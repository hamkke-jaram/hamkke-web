/**
 * 서버 주소. 웹은 같은 출처의 `/api`·`/ai`(vite·nginx 프록시)로 부르고, 이 파일은 아무 일도 하지 않는다.
 * 안드로이드 앱(Capacitor)은 화면이 `https://localhost`(기기 안의 파일)에서 열려 프록시가 없으므로,
 * 빌드 때 `VITE_API_ORIGIN`·`VITE_AI_ORIGIN`으로 서버 주소를 정해 주면 `/api/…`·`/ai/…` 요청을 그 주소로 보낸다.
 *
 * 요청을 만드는 코드(api/client.ts, ai/aiClient.ts, demo/…)는 고치지 않는다 — 앱을 시작할 때 fetch를 한 번 감싼다.
 * 앱에서는 Capacitor가 이미 fetch를 네이티브 요청으로 바꿔 두므로(CapacitorHttp), 교차 출처·혼합 콘텐츠 규칙에 걸리지 않는다.
 */

/** 'http://localhost:8080/' → 'http://localhost:8080'. 주소 모양이 아니면 빈 문자열(= 바꾸지 않음). */
export function normalizeOrigin(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim().replace(/\/+$/, '');
  return /^https?:\/\/[^/\s]+$/i.test(trimmed) ? trimmed : '';
}

/** `/api/…`는 API 서버로, `/ai/…`는 AI 서버로. 그 밖의 주소(화면 파일, 이미 완전한 주소)는 그대로 둔다. */
export function rewriteUrl(url: string, apiOrigin: string, aiOrigin: string): string {
  if (apiOrigin && url.startsWith('/api/')) return apiOrigin + url;
  if (aiOrigin && url.startsWith('/ai/')) return aiOrigin + url;
  return url;
}

function abortError() {
  return typeof DOMException === 'function' ? new DOMException('The operation was aborted.', 'AbortError') : Object.assign(new Error('aborted'), { name: 'AbortError' });
}

/**
 * 주소를 바꿔 보내는 fetch를 만든다.
 * 네이티브로 가는 요청은 AbortSignal을 모르므로, 멈춤 신호가 오면 여기서 기다리기를 끝낸다(브라우저의 fetch와 같은 AbortError).
 */
export function withServerOrigins(base: typeof fetch, apiOrigin: string, aiOrigin: string): typeof fetch {
  return (input, init) => {
    if (typeof input !== 'string') return base(input, init);
    const url = rewriteUrl(input, apiOrigin, aiOrigin);
    if (url === input) return base(input, init);
    const signal = init?.signal;
    if (!signal) return base(url, init);
    if (signal.aborted) return Promise.reject(abortError());
    return new Promise<Response>((resolve, reject) => {
      const onAbort = () => reject(abortError());
      signal.addEventListener('abort', onAbort, { once: true });
      base(url, init)
        .then(resolve, reject)
        .finally(() => signal.removeEventListener('abort', onAbort));
    });
  };
}

/** 앱을 시작할 때 한 번 부른다. 주소가 하나도 정해지지 않았으면(웹) fetch를 건드리지 않는다. */
export function installServerOrigins(env: Record<string, unknown> = import.meta.env): void {
  const apiOrigin = normalizeOrigin(env.VITE_API_ORIGIN);
  const aiOrigin = normalizeOrigin(env.VITE_AI_ORIGIN);
  if (!apiOrigin && !aiOrigin) return;
  const base = window.fetch.bind(window);
  window.fetch = withServerOrigins(base, apiOrigin, aiOrigin);
}
