import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, currentSession, errorMessage, hasSession, setSession } from './client';
import type { TokenResponse } from './types';

/*
 * client.ts의 토큰 갱신·오류 규칙. fetch만 가짜로 바꿔 서버 응답을 흉내 낸다.
 * (테스트 환경에는 localStorage가 없어서 세션은 메모리에만 있다.)
 */

interface Call {
  url: string;
  method: string;
  auth: string | null;
  body: unknown;
}

const USER = { id: 1, email: 'a@example.com', displayName: '하늘맘', role: 'PARENT' as const };

function tokens(n: number): TokenResponse {
  return { accessToken: `access-${n}`, refreshToken: `refresh-${n}`, accessTokenExpiresIn: 1800, user: USER };
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

let calls: Call[] = [];

/** 실패해야 하는 요청의 오류를 받는다(성공하면 테스트가 실패한다). */
function caught(p: Promise<unknown>): Promise<ApiError> {
  return p.then(
    () => {
      throw new Error('실패해야 하는 요청이 성공했어요.');
    },
    (e: unknown) => e as ApiError,
  );
}

/** 경로마다 응답을 고르는 가짜 fetch. handler가 undefined를 돌려주면 200 {}. */
function mockFetch(handler: (c: Call) => Response | Promise<Response> | undefined) {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const headers = (init.headers ?? {}) as Record<string, string>;
      const c: Call = {
        url,
        method: init.method ?? 'GET',
        auth: headers.Authorization ?? null,
        body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
      };
      calls.push(c);
      return (await handler(c)) ?? json(200, {});
    }),
  );
}

beforeEach(() => {
  setSession(tokens(1));
});

afterEach(() => {
  vi.unstubAllGlobals();
  setSession(null);
});

describe('api: 토큰 갱신', () => {
  it('401이면 리프레시 토큰으로 한 번 갱신하고 새 토큰으로 다시 보낸다', async () => {
    mockFetch((c) => {
      if (c.url === '/api/v1/auth/refresh') return json(200, tokens(2));
      if (c.auth === 'Bearer access-1') return json(401, { code: 'UNAUTHORIZED', message: '로그인이 필요해요.' });
      return json(200, { ok: true });
    });
    await expect(api('GET', '/children')).resolves.toEqual({ ok: true });
    expect(calls.map((c) => `${c.method} ${c.url} ${c.auth ?? ''}`)).toEqual([
      'GET /api/v1/children Bearer access-1',
      'POST /api/v1/auth/refresh ',
      'GET /api/v1/children Bearer access-2',
    ]);
    expect(calls[1].body).toEqual({ refreshToken: 'refresh-1' });
    expect(currentSession()).toEqual({ accessToken: 'access-2', refreshToken: 'refresh-2' });
  });

  it('비밀번호가 틀린 401(INVALID_CREDENTIALS)은 갱신하지 않고 그대로 알린다', async () => {
    mockFetch(() => json(401, { code: 'INVALID_CREDENTIALS', message: '비밀번호가 맞지 않아요.' }));
    const err = await caught(api('PUT', '/me/password', { currentPassword: 'x', newPassword: 'y' }));
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('INVALID_CREDENTIALS');
    expect(calls).toHaveLength(1);
    // 세션은 그대로다(로그아웃되지 않는다).
    expect(currentSession()?.accessToken).toBe('access-1');
  });

  it('/auth/ 경로의 401은 갱신하지 않는다', async () => {
    mockFetch(() => json(401, { code: 'UNAUTHORIZED', message: '이메일 또는 비밀번호를 확인해 주세요.' }));
    await expect(api('POST', '/auth/login', { email: 'a', password: 'b' })).rejects.toBeInstanceOf(ApiError);
    expect(calls.filter((c) => c.url.includes('/auth/refresh'))).toHaveLength(0);
  });

  it('동시에 받은 401 여러 개는 갱신 한 번을 같이 쓴다', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    mockFetch(async (c) => {
      if (c.url === '/api/v1/auth/refresh') {
        await gate;
        return json(200, tokens(2));
      }
      if (c.auth === 'Bearer access-1') return json(401, {});
      return json(200, { url: c.url });
    });
    const a = api('GET', '/children');
    const b = api('GET', '/me');
    // 두 요청이 모두 401을 받고 갱신을 기다릴 때까지 기다린 뒤 갱신을 끝낸다.
    await vi.waitFor(() => expect(calls.filter((c) => c.url === '/api/v1/auth/refresh')).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 0));
    release();
    await expect(a).resolves.toEqual({ url: '/api/v1/children' });
    await expect(b).resolves.toEqual({ url: '/api/v1/me' });
    expect(calls.filter((c) => c.url === '/api/v1/auth/refresh')).toHaveLength(1);
  });

  it('갱신이 거절되면 세션을 지우고(로그아웃) 401을 알린다', async () => {
    mockFetch((c) => (c.url === '/api/v1/auth/refresh' ? json(401, { code: 'INVALID_TOKEN' }) : json(401, {})));
    const err = await caught(api('GET', '/children'));
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(401);
    expect(err.message).toBe('로그인이 필요해요.');
    expect(hasSession()).toBe(false);
    // 다시 보내지 않는다(처음 요청 + 갱신 시도만).
    expect(calls).toHaveLength(2);
  });

  it('다시 보낸 요청이 또 401이면 갱신을 되풀이하지 않는다', async () => {
    let refreshes = 0;
    mockFetch((c) => {
      if (c.url === '/api/v1/auth/refresh') {
        refreshes++;
        return json(200, tokens(10 + refreshes));
      }
      return json(401, { code: 'UNAUTHORIZED' });
    });
    await expect(api('GET', '/children')).rejects.toBeInstanceOf(ApiError);
    expect(refreshes).toBe(1);
  });

  it('갱신하는 사이 다른 세션으로 바뀌었으면 새 세션을 덮어쓰지 않는다', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    mockFetch(async (c) => {
      if (c.url === '/api/v1/auth/refresh') {
        await gate;
        return json(200, tokens(2));
      }
      if (c.auth === 'Bearer access-1') return json(401, {});
      return json(200, {});
    });
    const p = caught(api('GET', '/children'));
    await vi.waitFor(() => expect(calls.some((c) => c.url === '/api/v1/auth/refresh')).toBe(true));
    setSession(tokens(7)); // 데모의 계정 전환처럼
    release();
    await p;
    expect(currentSession()?.accessToken).toBe('access-7');
  });
});

describe('api: 오류 문장', () => {
  it('칸 오류(fieldErrors)가 있으면 그 문장을 먼저 쓴다', async () => {
    mockFetch(() =>
      json(400, {
        code: 'VALIDATION_FAILED',
        message: '입력값을 확인해 주세요.',
        fieldErrors: [{ field: 'displayName', message: '이름은 30자까지 쓸 수 있어요.' }],
      }),
    );
    const err = await caught(api('PATCH', '/me', { displayName: 'x' }));
    expect(err.code).toBe('VALIDATION_FAILED');
    expect(err.message).toBe('이름은 30자까지 쓸 수 있어요.');
    expect(err.fieldErrors).toEqual([{ field: 'displayName', message: '이름은 30자까지 쓸 수 있어요.' }]);
  });

  it('칸 오류가 없으면 서버 message, 그것도 없으면 상태 코드 문장을 쓴다', async () => {
    mockFetch(() => json(422, { code: 'INVITE_LIMIT_REACHED', message: '아직 쓰지 않은 코드가 3개 있어요.' }));
    expect((await caught(api('POST', '/children/1/invite-codes'))).message).toBe('아직 쓰지 않은 코드가 3개 있어요.');

    mockFetch(() => new Response('<html>busy</html>', { status: 429 }));
    const busy = await caught(api('GET', '/me/export'));
    expect(busy.code).toBe('UNKNOWN');
    expect(busy.message).toBe('요청이 잠시 많았어요. 조금 뒤에 다시 시도해 주세요.');

    mockFetch(() => new Response('', { status: 503 }));
    expect((await caught(api('GET', '/children'))).message).toBe('서버가 잠시 쉬고 있어요. 잠시 후 다시 시도해 주세요.');
  });

  it('성공 응답인데 JSON이 아니면(프록시 안내 페이지 등) 오류로 본다', async () => {
    mockFetch(() => new Response('<html>hello</html>', { status: 200 }));
    const err = await caught(api('GET', '/children'));
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('UNKNOWN');
  });

  it('연결이 끊기면 NETWORK 오류', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    const err = await caught(api('GET', '/children'));
    expect(err.code).toBe('NETWORK');
    expect(errorMessage(err)).toBe('인터넷 연결을 확인해 주세요.');
  });

  it('204는 undefined를 돌려준다', async () => {
    mockFetch(() => new Response(null, { status: 204 }));
    await expect(api('DELETE', '/teacher/links/3')).resolves.toBeUndefined();
  });

  it('errorMessage는 알 수 없는 값에도 기본 문장을 준다', () => {
    expect(errorMessage(null)).toBe('잠시 문제가 생겼어요. 다시 시도해 주세요.');
    expect(errorMessage(new Error('직접 쓴 문장'))).toBe('직접 쓴 문장');
  });
});
