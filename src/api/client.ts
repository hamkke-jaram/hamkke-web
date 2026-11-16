import type { TokenResponse } from './types';

/**
 * API 호출 도우미. JSON만 주고받는다(영상·파일 업로드 기능 없음).
 * 액세스 토큰이 만료되면 리프레시 토큰으로 한 번 갱신한 뒤 다시 시도한다.
 *
 * 여러 탭: 세션은 localStorage 하나를 함께 쓴다. 리프레시 토큰은 쓸 때마다 바뀌고, 이미 바뀐(낡은) 토큰을 다시 보내면
 * 서버는 탈취로 보고 그 사람의 모든 기기를 로그아웃시킨다(ACC-04). 그래서 탭마다 낡은 토큰을 들고 있지 않게
 * - 다른 탭의 로그인·로그아웃·토큰 회전을 storage 이벤트로 바로 따르고,
 * - 갱신하기 직전에 저장소를 다시 읽어 다른 탭이 이미 회전했으면 그 토큰을 쓰고,
 * - 갱신은 탭 사이에서도 한 번에 하나씩 한다(Web Locks).
 */

const STORAGE_KEY = 'hj.session';
/** 탭 사이에서 토큰 갱신을 한 번에 하나씩 하려고 잡는 Web Locks 이름. */
const REFRESH_LOCK = 'hj.session.refresh';

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

/**
 * 이 탭이 마지막으로 저장소에서 읽었거나 저장소에 쓴 값(없으면 null, 저장소를 읽을 수 없으면 undefined).
 * 저장소 값이 이것과 다르면 다른 탭이 바꾼 것이다.
 */
let known: string | null | undefined = readStored();
let session: Session | null = parseSession(known);
let refreshing: Promise<boolean> | null = null;
/** fromOtherTab: 다른 탭이 바꾼 세션을 이 탭이 따라 바꾼 경우 true. */
const listeners = new Set<(fromOtherTab: boolean) => void>();

/**
 * 요청 관찰 고리(시연 전용). 기능별 시연이 '서버로 간 내용'을 보여 줄 때만 설정하고, 평소에는 비어 있어
 * 아무 일도 하지 않는다. window.fetch는 바꾸지 않는다.
 */
export interface ApiObserver {
  /** 보내기 직전. 'offline'을 돌려주면 보내지 않고 연결 실패로 처리한다(시연의 '서버에 닿지 못함' 흉내). */
  before?(req: { method: string; path: string; body: unknown }): 'offline' | void;
  /** 응답을 받은 뒤. 값을 돌려주면 그 값을 응답 본문으로 쓴다(시연의 응답 흉내, 화면에도 그렇게 표시한다). */
  after?(res: { method: string; path: string; body: unknown; status: number; data: unknown }): unknown;
  /** 서버에 닿지 못했을 때. */
  failed?(req: { method: string; path: string; body: unknown }): void;
}

let observer: ApiObserver | null = null;

/** 시연 코드만 부른다. null을 넣으면 관찰을 끝낸다. */
export function setApiObserver(next: ApiObserver | null) {
  observer = next;
}

/** 저장소의 세션 값. 저장소를 읽을 수 없는 환경이면 undefined. */
function readStored(): string | null | undefined {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return undefined;
  }
}

function parseSession(raw: string | null | undefined): Session | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Partial<Session> | null;
    return s && typeof s.accessToken === 'string' && typeof s.refreshToken === 'string'
      ? { accessToken: s.accessToken, refreshToken: s.refreshToken }
      : null;
  } catch {
    return null;
  }
}

function notify(fromOtherTab: boolean) {
  listeners.forEach((l) => l(fromOtherTab));
}

export function setSession(t: TokenResponse | null) {
  session = t ? { accessToken: t.accessToken, refreshToken: t.refreshToken } : null;
  const raw = session ? JSON.stringify(session) : null;
  try {
    if (raw) localStorage.setItem(STORAGE_KEY, raw);
    else localStorage.removeItem(STORAGE_KEY);
    known = raw;
  } catch {
    // 저장소를 쓸 수 없는 환경(사생활 보호 모드 등)에서는 메모리에만 둔다.
    // 지금 저장소 값을 기억해 두어, 쓰지 못한 것을 '다른 탭이 로그아웃했다'로 잘못 읽지 않게 한다.
    known = readStored();
  }
  notify(false);
}

/**
 * 다른 탭이 저장소의 세션을 바꿨으면(로그인·로그아웃·토큰 회전) 이 탭도 그 세션으로 바꾼다.
 * 이 탭이 마지막으로 보거나 쓴 값 그대로이거나 저장소를 읽을 수 없으면 아무것도 하지 않는다.
 */
function syncFromStorage() {
  const raw = readStored();
  if (raw === undefined || raw === known) return;
  known = raw;
  const next = parseSession(raw);
  if (next?.accessToken === session?.accessToken && next?.refreshToken === session?.refreshToken) return;
  session = next;
  notify(true);
}

// storage 이벤트는 값을 바꾼 탭이 아닌 같은 브라우저의 다른 탭에서만 온다. key가 null이면 저장소를 통째로 비운 것.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === null) syncFromStorage();
  });
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

/** 세션이 바뀌면 부른다. fromOtherTab은 다른 탭의 로그인·로그아웃·토큰 회전을 따라 바뀐 경우 true. */
export function onSessionChange(fn: (fromOtherTab: boolean) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * 액세스 토큰 rejected가 401을 받았을 때 부른다. 다시 보낼 토큰이 생기면 true.
 * 이 탭에서 동시에 받은 401 여러 개는 갱신 한 번을 같이 쓴다.
 */
async function refresh(rejected: string | undefined): Promise<boolean> {
  if (!session) return false;
  if (!refreshing) {
    const run = withRefreshLock(() => rotate(rejected)).catch(() => false);
    refreshing = run;
    void run.then(() => {
      if (refreshing === run) refreshing = null;
    });
  }
  return refreshing;
}

/**
 * 탭 사이에서도 갱신을 한 번에 하나씩 한다. 두 탭이 같은 리프레시 토큰을 동시에 보내면 서버는 재사용으로 보고
 * 모든 기기를 로그아웃시키기 때문이다. Web Locks를 쓸 수 없는 곳(오래된 브라우저, https가 아닌 주소)에서는 잠그지 않는다.
 */
async function withRefreshLock(fn: () => Promise<boolean>): Promise<boolean> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  return locks ? await locks.request(REFRESH_LOCK, () => fn()) : await fn();
}

async function rotate(rejected: string | undefined): Promise<boolean> {
  // 기다리는 사이(또는 storage 이벤트를 놓친 사이) 다른 탭이 회전했거나 로그아웃했으면 저장소의 세션을 따른다.
  syncFromStorage();
  if (!session) return false;
  // 거절된 토큰 대신 쓸 새 토큰이 이미 있다(다른 탭이 회전함 등). 낡은 리프레시 토큰을 서버에 보내지 않는다.
  if (session.accessToken !== rejected) return true;

  const token = session.refreshToken;
  const req = { method: 'POST', path: '/auth/refresh', body: { refreshToken: token } };
  try {
    const res = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: token }),
    });
    // 갱신하는 사이 다른 세션으로 바뀌었다면(데모의 계정 전환, 다른 탭의 로그아웃 등) 새 세션을 덮어쓰지 않는다.
    const stillSame = () => session?.refreshToken === token;
    if (!res.ok) {
      observer?.after?.({ ...req, status: res.status, data: undefined });
      if (stillSame()) setSession(null);
      return false;
    }
    const next = (await res.json()) as TokenResponse;
    observer?.after?.({ ...req, status: res.status, data: next });
    if (!stillSame()) return false;
    setSession(next);
    return true;
  } catch {
    return false;
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export async function api<T>(method: Method, path: string, body?: unknown, retry = true): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const sentWith = session?.accessToken;
  if (sentWith) headers.Authorization = `Bearer ${sentWith}`;

  let res: Response;
  try {
    if (observer?.before?.({ method, path, body }) === 'offline') throw new TypeError('Failed to fetch');
    res = await fetch(`/api/v1${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    observer?.failed?.({ method, path, body });
    throw new ApiError(0, 'NETWORK', '인터넷 연결을 확인해 주세요.');
  }

  if (res.status === 204) {
    observer?.after?.({ method, path, body, status: 204, data: undefined });
    return undefined as T;
  }

  const text = await res.text().catch(() => '');
  let data = parseBody(text);
  if (observer?.after) {
    const replaced = observer.after({ method, path, body, status: res.status, data });
    if (replaced !== undefined) data = replaced as ErrorBody;
  }

  // 비밀번호가 틀린 경우(INVALID_CREDENTIALS, 예: DELETE /me)도 401이지만 토큰 문제가 아니므로 갱신하지 않는다.
  if (res.status === 401 && retry && session && !path.startsWith('/auth/') && data?.code !== 'INVALID_CREDENTIALS') {
    if (await refresh(sentWith)) return api<T>(method, path, body, false);
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
