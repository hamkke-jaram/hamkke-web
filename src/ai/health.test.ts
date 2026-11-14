import { afterEach, describe, expect, it, vi } from 'vitest';
import { HEALTH_URL, checkAiHealth, healthNotice } from './health';

function stub(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  const fn = vi.fn(impl);
  vi.stubGlobal('fetch', fn);
  return fn;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

describe('checkAiHealth', () => {
  it('modelReady=true면 ready. 로그인 토큰은 보내지 않는다', async () => {
    const fn = stub(async () => json(200, { status: 'ok', model: 'm', modelReady: true }));
    await expect(checkAiHealth()).resolves.toEqual({ kind: 'ready' });
    expect(fn.mock.calls[0][0]).toBe(HEALTH_URL);
    const headers = (fn.mock.calls[0][1]?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it('서버에는 닿았지만 모델이 준비되지 않았으면 not-ready', async () => {
    stub(async () => json(200, { status: 'ok', model: 'm', modelReady: false }));
    await expect(checkAiHealth()).resolves.toEqual({ kind: 'not-ready' });
    stub(async () => json(503, { status: 'degraded', modelReady: false }));
    await expect(checkAiHealth()).resolves.toEqual({ kind: 'not-ready' });
  });

  it('JSON이 아닌 응답(프록시 안내 페이지)이나 연결 실패는 unreachable', async () => {
    stub(async () => new Response('<html>Bad Gateway</html>', { status: 502 }));
    await expect(checkAiHealth()).resolves.toEqual({ kind: 'unreachable' });
    stub(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(checkAiHealth()).resolves.toEqual({ kind: 'unreachable' });
  });

  it('멈추면(abort) unreachable로 끝난다', async () => {
    stub(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
    const ctrl = new AbortController();
    const p = checkAiHealth(ctrl.signal);
    ctrl.abort();
    await expect(p).resolves.toEqual({ kind: 'unreachable' });
  });
});

describe('healthNotice', () => {
  it('준비되었거나 확인 중이면 안내가 없다', () => {
    expect(healthNotice({ kind: 'ready' })).toBeNull();
    expect(healthNotice({ kind: 'checking' })).toBeNull();
    expect(healthNotice({ kind: 'not-ready' })).toContain('준비 중');
    expect(healthNotice({ kind: 'unreachable' })).toContain('연결할 수 없어요');
  });
});
