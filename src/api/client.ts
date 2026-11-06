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
        if (!res.ok) {
          setSession(null);
          return false;
        }
        setSession((await res.json()) as TokenResponse);
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

  if (res.status === 401 && retry && session && !path.startsWith('/auth/')) {
    if (await refresh()) return api<T>(method, path, body, false);
  }
  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.code ?? 'UNKNOWN',
      data?.fieldErrors?.[0]?.message ?? data?.message ?? '잠시 문제가 생겼어요. 다시 시도해 주세요.',
      data?.fieldErrors ?? [],
    );
  }
  return data as T;
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error && e.message) return e.message;
  return '잠시 문제가 생겼어요. 다시 시도해 주세요.';
}
