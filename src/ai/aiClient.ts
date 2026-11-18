import { ApiError, api } from '../api/client';
import type { AiObservation, AiSession, AnalyzeResponse, Delivery, SaveAiObservationResponse } from '../api/types';
import { MAX_FRAMES, isAbortError, type Frame } from './frames';

/**
 * AI 관찰 기록 만들기 (hamkke-api/docs/ai-observation.md 3장).
 *
 *   1) POST /api/v1/children/{id}/ai-sessions      → 분석 토큰 (한 번의 분석용, 10분)
 *   2) POST /ai/v1/analyze  (Bearer 분석 토큰, 사진) → 관찰 기록 + 영수증      ← AI 서버
 *   3) POST /api/v1/children/{id}/ai-observations  → 영수증만 보내 저장
 *
 * 장면 사진은 2)의 /ai/ 경로로만 간다. /api 로는 글자(영수증)만 보낸다.
 * AI 서버에는 로그인 토큰을 보내지 않고, 1)에서 받은 분석 토큰만 보낸다.
 * 사진·토큰·영수증·관찰 문장은 콘솔이나 저장소에 남기지 않는다(메모리에만 둔다).
 *
 * 3)만 실패하면 영수증을 AiError.pending 에 실어 돌려준다. '다시 시도'는 resumeSave 로 저장만 다시 하므로
 * 분석 토큰을 새로 받지도, 사진을 다시 보내지도 않는다.
 */

export type AiStage = 'session' | 'analyzing' | 'saving';

export interface CreateObservationOptions {
  signal?: AbortSignal;
  /** 영상 길이 또는 촬영한 시간(초) */
  durationSec?: number | null;
  /** 촬영한 시각(ISO). 없으면 서버가 저장 시각을 쓴다. */
  recordedAt?: string;
  onStage?: (stage: AiStage) => void;
}

/** 살펴보기는 끝났지만 아직 저장하지 못한 관찰 기록. 영수증은 메모리에만 두고, 저장만 다시 할 때 쓴다. */
export interface PendingSave {
  childId: number;
  /** AI 서버가 서명한 영수증(15분 동안 유효) */
  receipt: string;
  /** 촬영한 시각(ISO). 서버가 받지 않은 값이면 빼 둔다. */
  recordedAt?: string;
  /** 영수증을 받은 때(이 기기 시계, ms). 유효 시간이 지났는지 볼 때만 쓴다. */
  receivedAt: number;
}

/** AI 관찰 기록을 만들지 못했을 때. message는 화면에 그대로 보여 줄 수 있는 문장이다. */
export class AiError extends Error {
  constructor(
    public code: string,
    message: string,
    /** 다시 시도해 볼 만한지 */
    public retryable = true,
    /** 있으면 다시 시도할 때 사진을 다시 보내지 않고 저장만 다시 하면 된다(resumeSave). */
    public pending?: PendingSave,
  ) {
    super(message);
  }
}

const ANALYZE_URL = '/ai/v1/analyze';
/** AI 서버의 모델 제한 시간(기본 180초)과 프록시 읽기 제한(200초)에 맞춘 값. */
const ANALYZE_TIMEOUT_MS = 200_000;
const SAVE_ATTEMPTS = 3;
/** 영수증 유효 시간(15분)보다 조금 짧게 잡는다. 이보다 오래되면 저장만 다시 하지 않고 처음부터 다시 한다. */
const RECEIPT_USABLE_MS = 14 * 60_000;
/** 이미 저장된 기록을 다시 찾을 때 살펴볼 개수(명세의 목록 기본값). */
const RECOVER_LIST_LIMIT = 20;
/** 관찰 기록과 그 기록으로 전달된 카드는 같은 요청에서 만들어진다. 이 시간 안에 전달된 카드만 그 카드로 본다. */
const RECOVER_CARD_WINDOW_MS = 60_000;
const SAVE_ONLY_HINT = '다시 시도하면 사진을 다시 보내지 않고 저장만 다시 해요.';

const BUSY_SOON = '지금은 AI 서버가 바빠요. 잠시 후 다시 시도해 주세요.';

/** AI 서버 오류 코드(명세 5장) → 화면 문구. */
const ANALYZE_MESSAGE: Record<string, { message: string; retryable: boolean }> = {
  INVALID_FRAMES: { message: '장면 사진을 읽지 못했어요. 다시 찍어서 시도해 주세요.', retryable: false },
  INVALID_TOKEN: { message: '준비한 지 시간이 좀 지났어요. 다시 시도해 주세요.', retryable: true },
  SESSION_ALREADY_USED: { message: '이미 한 번 살펴본 요청이에요. 다시 시도해 주세요.', retryable: true },
  PAYLOAD_TOO_LARGE: { message: '장면 사진이 너무 커서 보내지 못했어요. 다시 찍어서 시도해 주세요.', retryable: false },
  BUSY: { message: '지금은 살펴보는 요청이 많아요. 잠시 후 다시 시도해 주세요.', retryable: true },
  MODEL_UNAVAILABLE: { message: BUSY_SOON, retryable: true },
  MODEL_TIMEOUT: { message: BUSY_SOON, retryable: true },
};

/** JSON 안내 없이 돌아온 응답(프록시 안내 페이지 등)은 상태 코드로 짐작한다. */
function codeFromStatus(status: number): string {
  if (status === 400) return 'INVALID_FRAMES';
  if (status === 401 || status === 403) return 'INVALID_TOKEN';
  if (status === 409) return 'SESSION_ALREADY_USED';
  if (status === 413) return 'PAYLOAD_TOO_LARGE';
  if (status === 429) return 'BUSY';
  if (status === 504) return 'MODEL_TIMEOUT';
  // 404(프록시에 /ai/ 경로가 없음), 502, 503 등: AI 서버에 닿지 못한 경우
  return 'MODEL_UNAVAILABLE';
}

function analyzeError(status: number, code: string | undefined): AiError {
  const known = code && Object.prototype.hasOwnProperty.call(ANALYZE_MESSAGE, code) ? code : codeFromStatus(status);
  const m = ANALYZE_MESSAGE[known];
  return new AiError(known, m.message, m.retryable);
}

function abortError(): DOMException {
  return new DOMException('멈췄어요.', 'AbortError');
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError();
}

/** 분석 토큰 발급 실패(hamkke-api) → 화면 문구. */
function sessionError(e: unknown): AiError {
  if (e instanceof ApiError) {
    if (e.code === 'AI_CONSENT_REQUIRED') {
      return new AiError(e.code, 'AI 관찰 기록이 꺼져 있어요. 아이 홈에서 켠 뒤 다시 해 주세요.', false);
    }
    if (e.code === 'AI_UNAVAILABLE' || e.status === 503) {
      return new AiError('AI_UNAVAILABLE', '지금은 AI 관찰 기록을 쓸 수 없어요. 나중에 다시 해 주세요.', true);
    }
    if (e.status === 429) {
      return new AiError('TOO_MANY', '짧은 시간에 AI 관찰 기록을 많이 만들었어요. 한 시간쯤 뒤에 다시 해 주세요.', false);
    }
    if (e.status === 404 || e.status === 403) {
      return new AiError(
        'NOT_ALLOWED',
        '지금은 이 아이의 AI 관찰 기록을 만들 수 없어요. AI 관찰 기록과 기관 촬영 설정이 켜져 있는지 확인해 주세요.',
        false,
      );
    }
    if (e.status === 0) return new AiError('NETWORK', '인터넷 연결을 확인하고 다시 시도해 주세요.', true);
  }
  return new AiError('SESSION_FAILED', 'AI 관찰 기록을 준비하지 못했어요. 잠시 후 다시 시도해 주세요.', true);
}

/** 서버가 알려 준 장수(maxFrames)보다 많으면 고르게 덜어 낸다. */
function limitFrames(frames: Frame[], max: number): Frame[] {
  const n = Math.max(1, Math.min(MAX_FRAMES, Math.floor(max) || MAX_FRAMES));
  if (frames.length <= n) return frames;
  if (n === 1) return [frames[Math.floor(frames.length / 2)]];
  return Array.from({ length: n }, (_, i) => frames[Math.round((i * (frames.length - 1)) / (n - 1))]);
}

function isAnalyzeResponse(v: unknown): v is AnalyzeResponse {
  if (!v || typeof v !== 'object') return false;
  const r = v as Partial<AnalyzeResponse>;
  return typeof r.receipt === 'string' && r.receipt.length > 0;
}

/** 사진을 AI 서버로 보내 살펴본다. 제한 시간과 '멈추기'를 함께 다룬다. */
async function analyze(token: string, frames: Frame[], durationSec: number | null | undefined, signal?: AbortSignal) {
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, ANALYZE_TIMEOUT_MS);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);

  try {
    let res: Response;
    let text: string;
    try {
      res = await fetch(ANALYZE_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          frames: frames.map((f) => ({ t: f.t, jpeg: f.jpeg })),
          ...(typeof durationSec === 'number' && Number.isFinite(durationSec) && durationSec > 0 ? { durationSec } : {}),
        }),
        signal: ctrl.signal,
        cache: 'no-store',
        credentials: 'omit',
      });
      text = await res.text();
    } catch (e) {
      if (signal?.aborted) throw abortError();
      if (timedOut) throw new AiError('MODEL_TIMEOUT', BUSY_SOON, true);
      if (isAbortError(e)) throw abortError();
      throw new AiError('NETWORK', 'AI 서버에 닿지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.', true);
    }

    let data: unknown;
    try {
      data = text ? JSON.parse(text) : undefined;
    } catch {
      data = undefined; // 프록시 안내 페이지(HTML) 등
    }

    if (!res.ok) {
      const code = data && typeof data === 'object' ? (data as { code?: unknown }).code : undefined;
      throw analyzeError(res.status, typeof code === 'string' ? code : undefined);
    }
    if (!isAnalyzeResponse(data)) throw new AiError('MODEL_UNAVAILABLE', BUSY_SOON, true);
    return data;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** 저장만 다시 해도 되는 상태인지(같은 아이의 것이고, 영수증 유효 시간이 남아 있는지). */
export function canResumeSave(
  pending: PendingSave | null | undefined,
  childId: number,
  now = Date.now(),
): pending is PendingSave {
  if (!pending || pending.childId !== childId || !pending.receipt) return false;
  const age = now - pending.receivedAt;
  return age >= 0 && age < RECEIPT_USABLE_MS;
}

function sameInstant(a: string, b: string): boolean {
  const x = Date.parse(a);
  const y = Date.parse(b);
  return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) < 1;
}

/**
 * 서버가 '이미 저장된 영수증'이라고 답했을 때(앞선 저장 요청이 서버에는 닿았지만 응답을 받지 못한 경우)
 * 방금 저장된 기록을 목록에서 찾아 돌려준다. 찾지 못하면 ALREADY_SAVED(기록은 저장되어 있다).
 *
 * 찾는 방법: 내가 만든 기록 가운데, 보낸 촬영 시각과 같은 것(보냈다면) 중에서 가장 나중에 저장된 것(id가 가장 큰 것).
 */
async function recoverSaved(childId: number, recordedAt: string | undefined): Promise<SaveAiObservationResponse> {
  const already = new AiError(
    'ALREADY_SAVED',
    "지금은 내용을 불러오지 못했어요. 아이 화면의 'AI 관찰 기록'에서 볼 수 있어요.",
    false,
  );
  let found: AiObservation | undefined;
  try {
    const list = await api<AiObservation[]>('GET', `/children/${childId}/ai-observations?limit=${RECOVER_LIST_LIMIT}`);
    for (const o of Array.isArray(list) ? list : []) {
      if (!o || typeof o.id !== 'number' || o.mine === false) continue;
      if (recordedAt && !sameInstant(o.recordedAt, recordedAt)) continue;
      if (!found || o.id > found.id) found = o;
    }
  } catch {
    throw already;
  }
  if (!found) throw already;

  // 가정 기록이면 저장할 때 카드 1장이 함께 전달되었다. 방금 전달된 카드를 찾아 함께 돌려준다(못 찾아도 기록은 돌려준다).
  let coaching: SaveAiObservationResponse['coaching'] = null;
  if (found.source === 'HOME') {
    try {
      const latest = (await api<Delivery[]>('GET', `/children/${childId}/card-deliveries?limit=1`))?.[0];
      const gap = latest ? Date.parse(latest.deliveredAt) - Date.parse(found.createdAt) : NaN;
      if (latest && gap > -1000 && gap < RECOVER_CARD_WINDOW_MS) coaching = { delivery: latest };
    } catch {
      /* 카드는 아이 홈의 '오늘의 코칭'에서 볼 수 있다 */
    }
  }
  return { observation: found, coaching };
}

/**
 * 영수증을 hamkke-api에 저장한다.
 * - 연결이 잠깐 끊긴 경우(응답 없음, 502·503·504)는 같은 영수증으로 몇 번 더 보낸다
 *   (서버가 같은 영수증을 두 번 저장하지 않는다). 그래도 안 되면 영수증을 실어 SAVE_FAILED 로 알린다.
 * - 이미 저장되어 있으면(409) 방금 저장된 기록을 찾아 돌려준다.
 * - 촬영 시각을 서버가 받지 않으면(기기 시계가 많이 빠른 경우 400) 촬영 시각 없이 한 번 더 보낸다(서버 시각으로 저장).
 * - 다시 보내도 결과가 같을 거절(4xx)은 다시 시도하지 않게 알린다.
 */
async function save(pending: PendingSave, signal?: AbortSignal): Promise<SaveAiObservationResponse> {
  const { childId, receipt, receivedAt } = pending;
  let recordedAt = pending.recordedAt;
  let failures = 0;
  for (;;) {
    throwIfAborted(signal);
    try {
      return await api<SaveAiObservationResponse>('POST', `/children/${childId}/ai-observations`, {
        receipt,
        ...(recordedAt ? { recordedAt } : {}),
      });
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      const code = e instanceof ApiError ? e.code : '';

      if (code === 'DUPLICATE_REQUEST') return recoverSaved(childId, recordedAt);
      if (code === 'VALIDATION_FAILED' && recordedAt) {
        recordedAt = undefined; // 기기 시계가 서버보다 많이 빠른 경우. 서버 시각으로 저장한다.
        continue;
      }
      if (code === 'AI_CONSENT_REQUIRED') {
        throw new AiError(code, 'AI 관찰 기록이 꺼져 있어서 저장하지 않았어요.', false);
      }
      if (code === 'AI_RECEIPT_INVALID') {
        throw new AiError(code, 'AI가 적은 관찰 기록을 확인하지 못해서 저장하지 않았어요. 다음에 다시 기록해 주세요.', false);
      }
      if (status === 401) {
        throw new AiError('SIGNED_OUT', '로그인이 풀려서 관찰 기록을 저장하지 못했어요. 다시 로그인해 주세요.', false);
      }
      if (status === 403 || status === 404) {
        throw new AiError(
          'NOT_ALLOWED',
          '지금은 이 아이의 AI 관찰 기록을 저장할 수 없어요. 그사이 설정이 바뀌었을 수 있어요.',
          false,
        );
      }

      // 여기부터는 잠시 뒤 저장만 다시 하면 될 수 있는 경우. 영수증을 실어 보낸다.
      const later: PendingSave = { childId, receipt, receivedAt, ...(recordedAt ? { recordedAt } : {}) };
      if (code === 'AI_UNAVAILABLE') {
        throw new AiError(code, `지금은 AI 관찰 기록을 저장할 수 없어요. 잠시 후 다시 시도해 주세요. ${SAVE_ONLY_HINT}`, true, later);
      }
      if (status === 429) {
        throw new AiError('SAVE_BUSY', `요청이 잠시 많았어요. 조금 뒤에 다시 시도해 주세요. ${SAVE_ONLY_HINT}`, true, later);
      }
      const transient = status === 0 || status === 502 || status === 503 || status === 504;
      if (transient && ++failures < SAVE_ATTEMPTS) {
        await wait(1000 * failures);
        continue;
      }
      if (transient || status >= 500) {
        throw new AiError(
          'SAVE_FAILED',
          `AI가 적은 관찰 기록을 저장하지 못했어요. 연결을 확인하고 다시 시도해 주세요. ${SAVE_ONLY_HINT}`,
          true,
          later,
        );
      }
      // 그 밖의 거절(400·413·422 등): 같은 내용으로 다시 보내도 결과가 같다.
      throw new AiError('SAVE_REJECTED', 'AI가 적은 관찰 기록을 저장하지 못했어요. 다음에 다시 기록해 주세요.', false);
    }
  }
}

/**
 * 살펴보기까지 끝난 관찰 기록(AiError.pending)의 저장만 다시 한다. 사진도 분석 토큰도 쓰지 않는다.
 * canResumeSave 로 먼저 확인하고 부른다.
 */
export async function resumeSave(
  pending: PendingSave,
  { signal, onStage }: Pick<CreateObservationOptions, 'signal' | 'onStage'> = {},
): Promise<SaveAiObservationResponse> {
  throwIfAborted(signal);
  onStage?.('saving');
  return save(pending, signal);
}

/**
 * 장면 사진으로 AI 관찰 기록을 만들어 저장한다.
 * 실패하면 AiError(화면 문구 포함), 멈추면 AbortError를 던진다. 사진 배열은 바꾸지 않는다.
 */
export async function createObservation(
  childId: number,
  frames: Frame[],
  { signal, durationSec, recordedAt, onStage }: CreateObservationOptions = {},
): Promise<SaveAiObservationResponse> {
  if (!Number.isInteger(childId) || childId <= 0) throw new AiError('NOT_ALLOWED', '아이 정보를 찾을 수 없어요.', false);
  const usable = frames.filter((f) => f && typeof f.jpeg === 'string' && f.jpeg.length > 0 && Number.isFinite(f.t));
  if (usable.length === 0) throw new AiError('INVALID_FRAMES', '보낼 장면 사진이 없어요. 다시 찍어서 시도해 주세요.', false);
  throwIfAborted(signal);

  onStage?.('session');
  let session: AiSession;
  try {
    session = await api<AiSession>('POST', `/children/${childId}/ai-sessions`);
  } catch (e) {
    throw sessionError(e);
  }
  if (!session || typeof session.token !== 'string' || !session.token) throw sessionError(null);
  throwIfAborted(signal); // 여기서 멈추면 사진은 한 장도 나가지 않는다

  onStage?.('analyzing');
  const analyzed = await analyze(session.token, limitFrames(usable, session.maxFrames), durationSec, signal);
  throwIfAborted(signal);

  onStage?.('saving');
  return save({ childId, receipt: analyzed.receipt, receivedAt: Date.now(), ...(recordedAt ? { recordedAt } : {}) }, signal);
}
