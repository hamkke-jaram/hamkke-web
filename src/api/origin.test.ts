import { describe, expect, it, vi } from 'vitest';
import { installServerOrigins, normalizeOrigin, rewriteUrl, withServerOrigins } from './origin';

const API = 'http://localhost:8080';
const AI = 'http://localhost:8090';

describe('서버 주소(앱 빌드용)', () => {
  it('주소 끝의 /는 떼고, 주소 모양이 아니면 쓰지 않는다', () => {
    expect(normalizeOrigin('http://localhost:8080/')).toBe(API);
    expect(normalizeOrigin('  https://api.example.com  ')).toBe('https://api.example.com');
    expect(normalizeOrigin('')).toBe('');
    expect(normalizeOrigin(undefined)).toBe('');
    expect(normalizeOrigin('localhost:8080')).toBe('');
    expect(normalizeOrigin('http://localhost:8080/api')).toBe('');
    expect(normalizeOrigin('javascript:alert(1)')).toBe('');
  });

  it('/api 는 API 서버로, /ai 는 AI 서버로 보내고 나머지는 그대로 둔다', () => {
    expect(rewriteUrl('/api/v1/me', API, AI)).toBe('http://localhost:8080/api/v1/me');
    expect(rewriteUrl('/ai/v1/analyze', API, AI)).toBe('http://localhost:8090/ai/v1/analyze');
    expect(rewriteUrl('/ai/v1/health?strict=1', API, AI)).toBe('http://localhost:8090/ai/v1/health?strict=1');
    // 화면 파일·분석 모델·시연 영상은 앱 안의 파일이다.
    expect(rewriteUrl('/mediapipe/wasm/vision_wasm_internal.wasm', API, AI)).toBe('/mediapipe/wasm/vision_wasm_internal.wasm');
    expect(rewriteUrl('/demo/sample-30s.mp4', API, AI)).toBe('/demo/sample-30s.mp4');
    expect(rewriteUrl('/apiary', API, AI)).toBe('/apiary');
    expect(rewriteUrl('https://example.com/api/v1/me', API, AI)).toBe('https://example.com/api/v1/me');
  });

  it('주소를 정하지 않은 쪽은 바꾸지 않는다(웹과 같은 동작)', () => {
    expect(rewriteUrl('/api/v1/me', '', '')).toBe('/api/v1/me');
    expect(rewriteUrl('/ai/v1/analyze', API, '')).toBe('/ai/v1/analyze');
  });

  it('바꾼 주소와 받은 옵션 그대로 원래 fetch를 부른다', async () => {
    const res = new Response('{}', { status: 200 });
    const base = vi.fn(async () => res);
    const f = withServerOrigins(base as unknown as typeof fetch, API, AI);
    const init = { method: 'POST', headers: { Authorization: 'Bearer t' }, body: '{}' };
    expect(await f('/api/v1/children', init)).toBe(res);
    expect(base).toHaveBeenCalledWith('http://localhost:8080/api/v1/children', init);
    await f('/icon.svg');
    expect(base).toHaveBeenLastCalledWith('/icon.svg', undefined);
  });

  it('멈춤 신호가 오면 응답을 기다리지 않고 AbortError로 끝낸다', async () => {
    let finish: (r: Response) => void = () => {};
    const base = vi.fn(() => new Promise<Response>((r) => (finish = r)));
    const f = withServerOrigins(base as unknown as typeof fetch, API, AI);
    const ctrl = new AbortController();
    const pending = f('/ai/v1/analyze', { method: 'POST', signal: ctrl.signal });
    ctrl.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    finish(new Response('{}')); // 뒤늦게 온 응답은 버려진다

    const already = new AbortController();
    already.abort();
    await expect(f('/api/v1/me', { signal: already.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(base).toHaveBeenCalledTimes(1); // 이미 멈춘 신호면 보내지도 않는다
  });

  it('멈추지 않으면 응답과 실패를 그대로 넘긴다', async () => {
    const ctrl = new AbortController();
    const ok = withServerOrigins((async () => new Response('x', { status: 201 })) as unknown as typeof fetch, API, AI);
    expect((await ok('/api/v1/me', { signal: ctrl.signal })).status).toBe(201);
    const bad = withServerOrigins((async () => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch, API, AI);
    await expect(bad('/api/v1/me', { signal: ctrl.signal })).rejects.toBeInstanceOf(TypeError);
  });

  it('주소가 하나도 없으면 fetch를 건드리지 않는다', () => {
    const original = vi.fn();
    const win = { fetch: original };
    vi.stubGlobal('window', win);
    try {
      installServerOrigins({});
      expect(win.fetch).toBe(original);
      installServerOrigins({ VITE_API_ORIGIN: '', VITE_AI_ORIGIN: 'not a url' });
      expect(win.fetch).toBe(original);
      installServerOrigins({ VITE_API_ORIGIN: API });
      expect(win.fetch).not.toBe(original);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
