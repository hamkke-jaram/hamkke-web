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

describe('api: 여러 탭', () => {
  /*
   * 같은 브라우저의 탭 여럿을 흉내 낸다. 탭마다 client 모듈을 새로 불러와 메모리 세션을 따로 두고,
   * localStorage(가짜)는 함께 쓴다. storage 이벤트는 실제 브라우저처럼 값을 바꾼 탭이 아닌 탭에만 보낸다.
   */
  type Client = typeof import('./client');
  interface Tab extends Client {
    /** 다른 탭이 hj.session을 바꿨다고 이 탭에 알린다. */
    storageEvent(key?: string | null): void;
    /** 이 탭의 onSessionChange가 받은 fromOtherTab 값들. */
    changes: boolean[];
  }

  let store: Map<string, string>;

  async function openTab(): Promise<Tab> {
    const win = new EventTarget();
    vi.stubGlobal('window', win);
    vi.resetModules();
    const mod = await import('./client');
    const changes: boolean[] = [];
    mod.onSessionChange((fromOtherTab) => changes.push(fromOtherTab));
    return {
      ...mod,
      changes,
      storageEvent(key: string | null = 'hj.session') {
        win.dispatchEvent(Object.assign(new Event('storage'), { key }));
      },
    };
  }

  const stored = () => JSON.parse(store.get('hj.session') ?? 'null') as { accessToken: string; refreshToken: string } | null;

  beforeEach(() => {
    store = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
    });
  });

  it('다른 탭이 이미 회전했으면 저장소의 새 토큰을 쓰고, 낡은 리프레시 토큰을 서버에 보내지 않는다', async () => {
    const a = await openTab();
    a.setSession(tokens(1));
    const b = await openTab(); // 저장소에서 refresh-1을 읽는다
    expect(b.currentSession()?.refreshToken).toBe('refresh-1');

    mockFetch((c) => {
      if (c.url === '/api/v1/auth/refresh') return json(200, tokens(2));
      if (c.auth === 'Bearer access-1') return json(401, {});
      return json(200, { ok: true });
    });
    await expect(a.api('GET', '/children')).resolves.toEqual({ ok: true });
    expect(stored()?.refreshToken).toBe('refresh-2');

    // B는 storage 이벤트를 아직 받지 못해 낡은 토큰을 들고 있다(백그라운드 탭 등).
    expect(b.currentSession()?.refreshToken).toBe('refresh-1');
    await expect(b.api('GET', '/me')).resolves.toEqual({ ok: true });

    // 갱신 요청은 A의 한 번뿐이고, B는 A가 받은 토큰으로 다시 보냈다.
    expect(calls.filter((c) => c.url === '/api/v1/auth/refresh').map((c) => c.body)).toEqual([{ refreshToken: 'refresh-1' }]);
    expect(calls.at(-1)).toMatchObject({ url: '/api/v1/me', auth: 'Bearer access-2' });
    expect(b.currentSession()).toEqual({ accessToken: 'access-2', refreshToken: 'refresh-2' });
    expect(b.changes).toEqual([true]);
  });

  it('다른 탭에서 로그아웃했으면 갱신하지 않고 이 탭도 로그아웃된다', async () => {
    const a = await openTab();
    a.setSession(tokens(1));
    const b = await openTab();
    a.setSession(null); // A에서 로그아웃(B는 이벤트를 아직 받지 못함)

    mockFetch((c) => (c.url === '/api/v1/auth/refresh' ? json(200, tokens(2)) : json(401, {})));
    const err = await caught(b.api('GET', '/children'));
    expect(err.status).toBe(401);
    expect(calls.map((c) => c.url)).toEqual(['/api/v1/children']);
    expect(b.hasSession()).toBe(false);
    expect(b.changes).toEqual([true]);
    expect(store.has('hj.session')).toBe(false);
  });

  it('storage 이벤트로 다른 탭의 로그인·토큰 회전·로그아웃을 바로 따른다', async () => {
    const a = await openTab();
    const b = await openTab();
    expect(b.hasSession()).toBe(false);

    a.setSession(tokens(1));
    b.storageEvent();
    expect(b.currentSession()).toEqual({ accessToken: 'access-1', refreshToken: 'refresh-1' });

    a.setSession(tokens(2));
    b.storageEvent('theme'); // 다른 키는 상관없다
    expect(b.currentSession()?.refreshToken).toBe('refresh-1');
    b.storageEvent();
    expect(b.currentSession()?.refreshToken).toBe('refresh-2');

    // 바뀐 것이 없으면 다시 알리지 않는다.
    b.storageEvent();

    a.setSession(null);
    b.storageEvent(null); // localStorage.clear()처럼 key가 없는 이벤트
    expect(b.hasSession()).toBe(false);
    expect(b.changes).toEqual([true, true, true]);
    expect(a.changes).toEqual([false, false, false]);
  });

  it('두 탭이 같은 토큰으로 동시에 401을 받아도 갱신 요청은 한 번만 보낸다', async () => {
    const a = await openTab();
    a.setSession(tokens(1));
    const b = await openTab();

    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    mockFetch(async (c) => {
      if (c.url === '/api/v1/auth/refresh') {
        await gate;
        return json(200, tokens(2));
      }
      if (c.auth === 'Bearer access-1') return json(401, {});
      return json(200, { auth: c.auth });
    });
    const pa = a.api('GET', '/children');
    const pb = b.api('GET', '/me');
    await vi.waitFor(() => expect(calls.filter((c) => c.auth === 'Bearer access-1')).toHaveLength(2));
    await new Promise((r) => setTimeout(r, 0));
    release();
    await expect(pa).resolves.toEqual({ auth: 'Bearer access-2' });
    await expect(pb).resolves.toEqual({ auth: 'Bearer access-2' });
    expect(calls.filter((c) => c.url === '/api/v1/auth/refresh')).toHaveLength(1);
  });

  it('저장소에 쓸 수 없으면(사생활 보호 모드 등) 메모리의 세션으로 계속 갱신한다', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('QuotaExceededError');
      },
      removeItem: () => undefined,
    });
    const a = await openTab();
    a.setSession(tokens(1));
    mockFetch((c) => {
      if (c.url === '/api/v1/auth/refresh') return json(200, tokens(2));
      if (c.auth === 'Bearer access-1') return json(401, {});
      return json(200, { ok: true });
    });
    await expect(a.api('GET', '/children')).resolves.toEqual({ ok: true });
    expect(a.currentSession()?.refreshToken).toBe('refresh-2');
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
