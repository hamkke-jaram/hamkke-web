import type { TokenResponse } from './types';

/**
 * API 호출 도우미. JSON만 주고받는다(영상·파일 업로드 기능 없음).
 * 액세스 토큰이 만료되면 리프레시 토큰으로 한 번 갱신한 뒤 다시 시도한다.
 */

const STORAGE_KEY = 'hj.session';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fieldErrors: Array<{ field: string; message: string }> = [],
  ) {
    super(message);
  }
}

interface Session {
  accessToken: string;
  refreshToken: string;
}

let session: Session | null = readSession();
let refreshing: Promise<boolean> | null = null;
const listeners = new Set<() => void>();

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function setSession(t: TokenResponse | null) {
  session = t ? { accessToken: t.accessToken, refreshToken: t.refreshToken } : null;
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* 저장소를 쓸 수 없는 환경(사생활 보호 모드 등)에서는 메모리에만 둔다 */
  }
  listeners.forEach((l) => l());
}

export function hasSession() {
  return session !== null;
}

export function getRefreshToken() {
  return session?.refreshToken ?? null;
}

/** 지금 쓰는 토큰 한 쌍(데모에서 보호자·선생님 계정을 오갈 때 회전된 토큰을 잃지 않으려고 쓴다). */
export function currentSession(): { accessToken: string; refreshToken: string } | null {
  return session ? { ...session } : null;
}

/** 진행 중인 토큰 갱신이 있으면 끝날 때까지 기다린다(세션을 바꾸기 전에 회전 결과를 받으려고 쓴다). */
export async function settleRefresh(): Promise<void> {
  if (refreshing) await refreshing.catch(() => false);
}

export function onSessionChange(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

async function refresh(): Promise<boolean> {
  if (!session) return false;
  if (!refreshing) {
    const token = session.refreshToken;
    refreshing = (async () => {
      try {
        const res = await fetch('/api/v1/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: token }),
        });
        // 갱신하는 사이 다른 세션으로 바뀌었다면(데모의 계정 전환 등) 새 세션을 덮어쓰지 않는다.
        const stillSame = () => session?.refreshToken === token;
        if (!res.ok) {
          if (stillSame()) setSession(null);
          return false;
        }
        const next = (await res.json()) as TokenResponse;
        if (!stillSame()) return false;
        setSession(next);
        return true;
      } catch {
        return false;
      } finally {
        refreshing = null;
      }
    })();
  }
  return refreshing;
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export async function api<T>(method: Method, path: string, body?: unknown, retry = true): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (session) headers.Authorization = `Bearer ${session.accessToken}`;

  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', '인터넷 연결을 확인해 주세요.');
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text().catch(() => '');
  const data = parseBody(text);

  // 비밀번호가 틀린 경우(INVALID_CREDENTIALS, 예: DELETE /me)도 401이지만 토큰 문제가 아니므로 갱신하지 않는다.
  if (res.status === 401 && retry && session && !path.startsWith('/auth/') && data?.code !== 'INVALID_CREDENTIALS') {
    if (await refresh()) return api<T>(method, path, body, false);
  }

  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.code ?? 'UNKNOWN',
      data?.fieldErrors?.[0]?.message ?? data?.message ?? statusMessage(res.status),
      data?.fieldErrors ?? [],
    );
  }
  if (data === undefined && text) {
    // 성공 응답인데 JSON이 아니면(프록시 안내 페이지 등) 화면에 그대로 넘기지 않는다.
    throw new ApiError(res.status, 'UNKNOWN', statusMessage(res.status));
  }
  return data as T;
}

interface ErrorBody {
  code?: string;
  message?: string;
  fieldErrors?: Array<{ field: string; message: string }>;
}

/** 응답 본문을 JSON으로 읽는다. nginx 안내 페이지(HTML) 등 JSON이 아니면 undefined. */
function parseBody(text: string): ErrorBody | undefined {
  if (!text) return undefined;
  try {
    return JSON.parse(text) as ErrorBody;
  } catch {
    return undefined;
  }
}

/** 서버가 JSON 안내를 주지 못했을 때 상태 코드에 맞춰 보여 줄 문구. */
function statusMessage(status: number): string {
  if (status === 413) return '요청이 너무 커요. 내용을 조금 줄여서 다시 시도해 주세요.';
  if (status === 429) return '요청이 잠시 많았어요. 조금 뒤에 다시 시도해 주세요.';
  if (status === 401) return '로그인이 필요해요.';
  if (status === 404) return '찾는 내용이 없어요.';
  if (status === 502 || status === 503 || status === 504) return '서버가 잠시 쉬고 있어요. 잠시 후 다시 시도해 주세요.';
  return '잠시 문제가 생겼어요. 다시 시도해 주세요.';
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error && e.message) return e.message;
  return '잠시 문제가 생겼어요. 다시 시도해 주세요.';
}
