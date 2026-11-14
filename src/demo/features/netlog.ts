import { setApiObserver } from '../../api/client';

/**
 * 기능별 시연의 '서버로 간 내용' 기록. 시연이 도는 동안에만 api 클라이언트의 관찰 고리(setApiObserver)에 붙는다.
 * 기록은 이 탭의 메모리에만 두고(저장·전송하지 않는다), 비밀번호·토큰·영수증은 '••••'로 가려서 담는다.
 */

/** 누가 보낸 요청인지: 화면(앱)이 보냄 / 시연 준비(화면 밖) / 시연이 확인하려고 보냄(화면 밖) / 시연용 샘플 받기 */
export type NetSource = 'app' | 'prep' | 'check' | 'sample';

export interface NetEntry {
  id: number;
  at: number;
  source: NetSource;
  method: string;
  path: string;
  /** 가린 요청 본문 */
  body: unknown;
  /** 'pending' 응답 기다리는 중, 'offline' 서버에 닿지 못함(또는 시연의 흉내) */
  status: number | 'pending' | 'offline';
  /** 가린 응답 본문(요약) */
  response?: unknown;
  /** 시연이 응답을 바꾸거나 연결 실패를 흉내 낸 요청 */
  simulated?: 'offline' | 'response';
  /** 본문에 담긴 파일(영상·사진 파일 등) 수. api 클라이언트는 JSON만 보내므로 늘 0이어야 한다. */
  files: number;
  /** 본문에 담긴 장면 사진(jpeg 문자열) 수 */
  photos: number;
}

export const MASK = '••••';

/** 값을 가리는 키(대소문자 무시). 화면에도, 시연 기록에도 원래 값을 남기지 않는다. */
const SECRET_KEYS = new Set([
  'password',
  'currentpassword',
  'newpassword',
  'accesstoken',
  'refreshtoken',
  'token',
  'sessiontoken',
  'receipt',
  'authorization',
]);

const MAX_ITEMS = 5;
const MAX_DEPTH = 6;

export function isSecretKey(key: string) {
  return SECRET_KEYS.has(key.toLowerCase());
}

function isFileLike(v: unknown): boolean {
  if (typeof Blob !== 'undefined' && v instanceof Blob) return true; // File도 Blob이다
  if (typeof FormData !== 'undefined' && v instanceof FormData) return true;
  if (typeof ArrayBuffer !== 'undefined' && (v instanceof ArrayBuffer || ArrayBuffer.isView(v))) return true;
  return false;
}

/** base64 jpeg 문자열 길이로 대략의 크기(KB)를 셈한다. */
export function photoLabel(jpeg: string) {
  const kb = Math.max(1, Math.round((jpeg.length * 3) / 4 / 1024));
  return `[장면 사진 1장 · 약 ${kb}KB]`;
}

export interface Masked {
  value: unknown;
  files: number;
  photos: number;
}

/**
 * 보여 줄 수 있게 가린 사본을 만든다(원본은 바꾸지 않는다).
 * - 비밀번호·토큰·영수증 키 → '••••'
 * - jpeg 문자열 → '[장면 사진 1장 · 약 NKB]'
 * - File·Blob·FormData → '[파일]' (files로 센다)
 * - 배열은 앞의 5개만, 깊이는 6단계까지
 */
export function maskForDisplay(input: unknown): Masked {
  let files = 0;
  let photos = 0;
  const walk = (v: unknown, depth: number): unknown => {
    if (v === null || v === undefined) return v;
    if (isFileLike(v)) {
      files++;
      return '[파일]';
    }
    if (typeof v !== 'object') return v;
    if (depth >= MAX_DEPTH) return '…';
    if (Array.isArray(v)) {
      const shown = v.slice(0, MAX_ITEMS).map((x) => walk(x, depth + 1));
      // 보이지 않는 항목에 든 파일·사진도 센다.
      for (const rest of v.slice(MAX_ITEMS)) walk(rest, depth + 1);
      if (v.length > MAX_ITEMS) shown.push(`… 외 ${v.length - MAX_ITEMS}개`);
      return shown;
    }
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (isSecretKey(k)) out[k] = x === null || x === undefined || x === '' ? x : MASK;
      else if (k.toLowerCase() === 'jpeg' && typeof x === 'string') {
        photos++;
        out[k] = photoLabel(x);
      } else out[k] = walk(x, depth + 1);
    }
    return out;
  };
  return { value: walk(input, 0), files, photos };
}

/** 'GET /children/12?limit=5' 같은 한 줄 표시. 쿼리는 그대로 둔다(개인정보를 쿼리에 넣지 않는다). */
export function requestLine(e: Pick<NetEntry, 'method' | 'path' | 'status'>) {
  const status = e.status === 'pending' ? '…' : e.status === 'offline' ? '연결 실패' : String(e.status);
  return `${e.method} ${e.path} ${status}`;
}

/** method와 경로 규칙이 맞는 요청인지. */
export function matches(e: Pick<NetEntry, 'method' | 'path'>, method: string, path: RegExp) {
  return e.method === method.toUpperCase() && path.test(e.path.split('?')[0]);
}

// ---------- 기록 저장소(메모리) ----------

let entries: NetEntry[] = [];
let nextId = 1;
let offlinePattern: RegExp | null = null;
let transform: ((method: string, path: string, data: unknown) => unknown) | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getEntries(): NetEntry[] {
  return entries;
}

export function clearEntries() {
  entries = [];
  emit();
}

/** 지금까지의 마지막 id. 이 뒤에 생긴 요청만 보려고 쓴다. */
export function mark() {
  return nextId - 1;
}

export function since(id: number) {
  return entries.filter((e) => e.id > id);
}

/** 화면 밖에서 시연이 보낸 요청을 남긴다(준비·확인·샘플 받기). id를 돌려준다. */
export function begin(source: NetSource, method: string, path: string, body?: unknown): number {
  const m = maskForDisplay(body);
  const e: NetEntry = {
    id: nextId++,
    at: Date.now(),
    source,
    method: method.toUpperCase(),
    path,
    body: m.value,
    status: 'pending',
    files: m.files,
    photos: m.photos,
  };
  entries = [...entries, e];
  emit();
  return e.id;
}

export function finish(id: number, status: number | 'offline', response?: unknown, simulated?: NetEntry['simulated']) {
  const masked = response === undefined ? undefined : maskForDisplay(response).value;
  entries = entries.map((e) => (e.id === id ? { ...e, status, response: masked, simulated: simulated ?? e.simulated } : e));
  emit();
}

/** 응답을 아직 기다리는 같은 요청 중 가장 먼저 보낸 것. */
function pendingOf(method: string, path: string) {
  return entries.find((e) => e.source === 'app' && e.status === 'pending' && e.method === method && e.path === path);
}

/** 이 경로(쿼리 제외)로 가는 화면 요청은 보내지 않고 연결 실패로 처리한다. null이면 끈다. */
export function setOffline(pattern: RegExp | null) {
  offlinePattern = pattern;
}

/** 화면이 받은 응답을 시연용으로 바꾼다(예: 다시 동의할 약관이 있다고 답한 것처럼). null이면 끈다. */
export function setTransform(fn: ((method: string, path: string, data: unknown) => unknown) | null) {
  transform = fn;
}

/** 시연이 시작될 때 api 클라이언트에 붙는다. */
export function install() {
  setApiObserver({
    before({ method, path, body }) {
      const id = begin('app', method, path, body);
      if (offlinePattern && offlinePattern.test(path.split('?')[0])) {
        finish(id, 'offline', undefined, 'offline');
        return 'offline';
      }
    },
    after({ method, path, body, status, data }) {
      let out: unknown;
      let simulated: NetEntry['simulated'];
      if (transform && status >= 200 && status < 300) {
        const replaced = transform(method, path, data);
        if (replaced !== undefined) {
          out = replaced;
          simulated = 'response';
        }
      }
      const p = pendingOf(method, path);
      if (p) finish(p.id, status, out ?? data, simulated);
      else {
        // 토큰 갱신처럼 before를 거치지 않는 요청
        const id = begin('app', method, path, body);
        finish(id, status, out ?? data, simulated);
      }
      return out;
    },
    failed({ method, path }) {
      const p = pendingOf(method, path);
      if (p) finish(p.id, 'offline');
    },
  });
}

/** 시연이 끝나면 떼어 내고 흉내도 모두 끈다. 기록은 다음 시연이 시작될 때 비운다. */
export function uninstall() {
  setApiObserver(null);
  offlinePattern = null;
  transform = null;
}

/**
 * sinceId 뒤에 생긴 요청 중 method·경로가 맞고 응답까지 끝난 첫 요청을 기다린다.
 * signal이 오면 멈추고(오류), skip이 오거나 시간이 지나면 null(시간 초과는 오류).
 */
export function waitFor(
  e: { method: string; path: RegExp },
  sinceId: number,
  o: { signal: AbortSignal; skip?: AbortSignal; timeout: number },
): Promise<NetEntry | null> {
  return new Promise((resolvePromise, reject) => {
    const find = () => entries.find((x) => x.id > sinceId && x.status !== 'pending' && matches(x, e.method, e.path));
    let timer = 0;
    const done = () => {
      unsub();
      window.clearTimeout(timer);
      o.signal.removeEventListener('abort', onAbort);
      o.skip?.removeEventListener('abort', onSkip);
    };
    const check = () => {
      const hit = find();
      if (hit) {
        done();
        resolvePromise(hit);
      }
    };
    const onAbort = () => {
      done();
      reject(new Error('stopped'));
    };
    const onSkip = () => {
      done();
      resolvePromise(null);
    };
    const unsub = subscribe(check);
    o.signal.addEventListener('abort', onAbort);
    o.skip?.addEventListener('abort', onSkip);
    timer = window.setTimeout(() => {
      done();
      reject(new Error(`서버 응답을 기다리다 시간이 지났어요. (${e.method} 요청)`));
    }, o.timeout);
    check();
  });
}

/** sinceId 뒤에 화면(앱)이 보낸 요청 수. */
export function appCountSince(sinceId: number) {
  return entries.filter((x) => x.id > sinceId && x.source === 'app').length;
}

/** 이번 시연에서 보낸 파일·사진 수(화면 요청 기준). */
export function uploadCounts(list: NetEntry[] = entries) {
  let files = 0;
  let photos = 0;
  for (const e of list) {
    if (e.source === 'sample') continue;
    files += e.files;
    photos += e.photos;
  }
  return { files, photos };
}
