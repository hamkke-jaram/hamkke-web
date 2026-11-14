import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, setSession } from '../../api/client';
import { MASK, clearEntries, getEntries, install, setOffline, setTransform, uninstall } from './netlog';

/*
 * api 클라이언트의 관찰 고리(시연 전용)와 '서버로 간 내용' 기록. fetch만 가짜로 바꾼다.
 * 관찰은 install()로 붙였을 때만 일어나고, window.fetch는 바꾸지 않는다.
 */

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

let fetched: string[] = [];

beforeEach(() => {
  setSession(null);
  clearEntries();
  fetched = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      fetched.push(url);
      if (url.endsWith('/auth/login')) return json(200, { accessToken: 'acc', refreshToken: 'ref', user: { id: 1 } });
      if (url.endsWith('/me')) return json(200, { id: 1, email: 'a@demo.hamkke.test' });
      return json(200, []);
    }),
  );
});

afterEach(() => {
  uninstall();
  vi.unstubAllGlobals();
});

describe('관찰 고리', () => {
  it('붙이지 않으면 아무것도 남기지 않는다', async () => {
    await api('GET', '/support-resources');
    expect(getEntries()).toEqual([]);
  });

  it('보낸 내용과 받은 내용을 가려서 남긴다', async () => {
    install();
    await api('POST', '/auth/login', { email: 'a@demo.hamkke.test', password: 'Secret123' });
    const [e] = getEntries();
    expect(e).toMatchObject({ source: 'app', method: 'POST', path: '/auth/login', status: 200, files: 0 });
    expect(e.body).toEqual({ email: 'a@demo.hamkke.test', password: MASK });
    expect(e.response).toEqual({ accessToken: MASK, refreshToken: MASK, user: { id: 1 } });
  });

  it('연결 실패 흉내: 서버에 보내지 않고 연결 오류로 처리한다', async () => {
    install();
    setOffline(/\/support-resources$/);
    const err = await api('GET', '/support-resources').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(0);
    expect(fetched).toEqual([]);
    expect(getEntries()[0]).toMatchObject({ status: 'offline', simulated: 'offline' });
  });

  it('응답 흉내: 화면이 받는 값을 바꾸고 기록에 표시한다', async () => {
    install();
    setTransform((method, path, data) => (method === 'GET' && path === '/me' ? { ...(data as object), pendingConsents: ['TERMS_OF_SERVICE'] } : undefined));
    const me = await api<{ pendingConsents?: string[] }>('GET', '/me');
    expect(me.pendingConsents).toEqual(['TERMS_OF_SERVICE']);
    expect(getEntries()[0]).toMatchObject({ simulated: 'response' });
  });

  it('떼어 내면 흉내도 함께 꺼진다', async () => {
    install();
    setOffline(/./);
    uninstall();
    await api('GET', '/support-resources');
    expect(fetched).toHaveLength(1);
    expect(getEntries()).toEqual([]);
  });
});
