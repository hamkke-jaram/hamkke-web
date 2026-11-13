/**
 * 장면 사진 뽑기. 영상 파일이나 실시간 카메라 화면에서 정지 사진을 몇 장 골라 작은 JPEG로 만든다.
 *
 * 지키는 것(hamkke-api/docs/ai-observation.md 3·5장):
 * - 최대 6장, 긴 변 512px 이하, JPEG, 소리 없음. 한 장은 300KB 이하, 전체 본문은 2MB 이하.
 * - 사진은 메모리에만 둔다. 저장소(localStorage·IndexedDB 등)나 콘솔에 남기지 않는다.
 * - 영상 원본은 읽기만 하고 어디로도 보내지 않는다. 다 쓰면 ObjectURL을 해제한다.
 */

export interface Frame {
  /** 영상(또는 촬영 시작)에서 이 사진까지의 시각(초) */
  t: number;
  /** JPEG를 base64로 적은 것. 'data:' 머리말은 없다. */
  jpeg: string;
}

export interface SampledFrames {
  frames: Frame[];
  /** 영상 길이(초). 알 수 없으면 null. */
  durationSec: number | null;
}

export const MAX_FRAMES = 6;
export const FRAME_LONG_EDGE = 512;
/** 한 장의 디코딩 크기 한도(AI 서버와 같은 값). */
export const FRAME_MAX_BYTES = 300 * 1024;
/** 요청 본문 한도 2MB에서 JSON 껍데기 몫을 뺀, 사진 전체(base64)에 쓸 수 있는 크기. */
const BODY_BUDGET_CHARS = 1_900_000;

const START_QUALITY = 0.7;
const MIN_QUALITY = 0.3;
const METADATA_TIMEOUT_MS = 15_000;
const SEEK_TIMEOUT_MS = 8_000;
const READY_TIMEOUT_MS = 2_000;

/** 사진을 뽑지 못했을 때. message는 화면에 그대로 보여 줄 수 있는 문장이다. */
export class FrameError extends Error {}

/** count장을 보낼 때 한 장이 넘지 말아야 할 크기(바이트). 한 장 한도와 전체 본문 한도를 함께 지킨다. */
export function frameByteLimit(count: number): number {
  const n = Math.max(1, Math.min(MAX_FRAMES, Math.floor(count)));
  return Math.min(FRAME_MAX_BYTES, Math.floor((BODY_BUDGET_CHARS * 3) / 4 / n));
}

function abortError(): DOMException {
  return new DOMException('멈췄어요.', 'AbortError');
}

export function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError();
}

type WaitResult = 'event' | 'timeout';

/**
 * 영상 이벤트 하나를 기다린다. 제한 시간이 지나면 'timeout', 영상 오류면 FrameError, 멈추면 AbortError.
 * 어떤 식으로 끝나든 걸어 둔 리스너와 타이머를 모두 치운다.
 */
function waitFor(video: HTMLVideoElement, event: string, timeoutMs: number, signal?: AbortSignal): Promise<WaitResult> {
  return new Promise<WaitResult>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener(event, onEvent);
      video.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
    };
    const onEvent = () => {
      cleanup();
      resolve('event');
    };
    const onError = () => {
      cleanup();
      reject(new FrameError('이 영상은 열 수 없어요. 다른 영상으로 해 주세요.'));
    };
    const onAbort = () => {
      cleanup();
      reject(abortError());
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve('timeout');
    }, timeoutMs);
    video.addEventListener(event, onEvent);
    video.addEventListener('error', onError);
    signal?.addEventListener('abort', onAbort);
  });
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
    } catch {
      resolve(null);
    }
  });
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * 화면(영상 요소)의 지금 모습을 긴 변 512px 이하 JPEG로 만든다.
 * maxBytes를 넘으면 화질을 낮추고, 그래도 넘으면 크기를 줄여 다시 만든다.
 */
async function encodeFrame(video: HTMLVideoElement, maxBytes: number): Promise<string> {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) throw new FrameError('화면이 아직 준비되지 않았어요.');

  const canvas = document.createElement('canvas');
  try {
    let scale = Math.min(1, FRAME_LONG_EDGE / Math.max(vw, vh));
    for (let shrink = 0; shrink < 4; shrink++) {
      canvas.width = Math.max(1, Math.round(vw * scale));
      canvas.height = Math.max(1, Math.round(vh * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new FrameError('이 브라우저에서는 장면 사진을 만들 수 없어요.');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      for (let q = START_QUALITY; q >= MIN_QUALITY - 1e-9; q -= 0.2) {
        const blob = await toBlob(canvas, q);
        // JPEG로 만들지 못하는 브라우저는 다른 형식(PNG)을 돌려준다. AI 서버는 JPEG만 받는다.
        if (!blob || blob.type !== 'image/jpeg') throw new FrameError('이 브라우저에서는 장면 사진을 만들 수 없어요.');
        if (blob.size <= maxBytes) {
          const bytes = new Uint8Array(await blob.arrayBuffer());
          if (bytes.length < 3 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
            throw new FrameError('이 브라우저에서는 장면 사진을 만들 수 없어요.');
          }
          return toBase64(bytes);
        }
      }
      scale *= 0.75;
    }
    throw new FrameError('장면 사진이 너무 커서 보낼 수 없어요.');
  } finally {
    // 캔버스가 쥐고 있는 그림 메모리를 바로 놓아 준다.
    canvas.width = 0;
    canvas.height = 0;
  }
}

/** 길이가 Infinity로 나오는 영상(일부 녹화 파일)은 끝까지 한 번 찾아가면 길이가 잡힌다. */
async function resolveDuration(video: HTMLVideoElement, signal?: AbortSignal): Promise<number> {
  if (Number.isFinite(video.duration) && video.duration > 0) return video.duration;
  const changed = waitFor(video, 'durationchange', SEEK_TIMEOUT_MS, signal);
  video.currentTime = Number.MAX_SAFE_INTEGER;
  await changed;
  return Number.isFinite(video.duration) && video.duration > 0 ? video.duration : NaN;
}

/** 처음과 끝 5%를 뺀 구간에서 고르게 나눈 시각들. */
export function frameTimes(durationSec: number, count: number): number[] {
  const n = Math.max(1, Math.min(MAX_FRAMES, Math.floor(count)));
  const start = durationSec * 0.05;
  const end = durationSec * 0.95;
  if (n === 1) return [(start + end) / 2];
  const step = (end - start) / (n - 1);
  return Array.from({ length: n }, (_, i) => start + step * i);
}

/**
 * 영상 파일에서 장면 사진을 고르게 뽑는다. 화면에 보이지 않는 <video>로 해당 시각을 찾아가 그린다.
 * 찾아가기가 제한 시간 안에 끝나지 않은 시각은 건너뛴다. 한 장도 못 뽑으면 FrameError.
 */
export async function sampleFramesFromFile(file: File, count = MAX_FRAMES, signal?: AbortSignal): Promise<SampledFrames> {
  throwIfAborted(signal);
  const n = Math.max(1, Math.min(MAX_FRAMES, Math.floor(count)));
  const maxBytes = frameByteLimit(n);
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';

  try {
    const meta = waitFor(video, 'loadedmetadata', METADATA_TIMEOUT_MS, signal);
    video.src = url;
    if ((await meta) === 'timeout') throw new FrameError('영상을 여는 데 시간이 너무 오래 걸려요. 다른 영상으로 해 주세요.');

    const duration = await resolveDuration(video, signal);
    if (!Number.isFinite(duration)) throw new FrameError('영상 길이를 알 수 없어서 장면 사진을 뽑지 못했어요.');

    const frames: Frame[] = [];
    for (const t of frameTimes(duration, n)) {
      throwIfAborted(signal);
      const seeked = waitFor(video, 'seeked', SEEK_TIMEOUT_MS, signal);
      video.currentTime = t;
      if ((await seeked) === 'timeout') continue;
      // 찾아간 직후에는 그림이 아직 준비되지 않았을 수 있다(HAVE_CURRENT_DATA 미만).
      if (video.readyState < 2) {
        await waitFor(video, 'canplay', READY_TIMEOUT_MS, signal);
        if (video.readyState < 2) continue;
      }
      throwIfAborted(signal);
      const jpeg = await encodeFrame(video, maxBytes);
      frames.push({ t: Math.round(video.currentTime * 10) / 10, jpeg });
    }
    throwIfAborted(signal);
    if (frames.length === 0) throw new FrameError('영상에서 장면 사진을 뽑지 못했어요.');
    return { frames, durationSec: Math.round(duration * 10) / 10 };
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

/**
 * 실시간 카메라 화면(<video>)의 지금 모습을 사진 한 장으로 만든다. 영상은 녹화하지 않는다.
 * @param t 촬영을 시작한 뒤 지난 시간(초)
 * @param maxBytes 한 장의 크기 한도. 6장을 보낼 때의 한도가 기본값이다.
 */
export async function captureFrame(video: HTMLVideoElement, t: number, maxBytes = frameByteLimit(MAX_FRAMES)): Promise<Frame> {
  if (video.readyState < 2) throw new FrameError('화면이 아직 준비되지 않았어요.');
  const jpeg = await encodeFrame(video, maxBytes);
  return { t: Math.round(Math.max(0, t) * 10) / 10, jpeg };
}

/** 사진 묶음을 비운다(참조를 끊어 메모리에서 빨리 사라지게 한다). */
export function discardFrames(frames: Frame[] | null | undefined) {
  if (!frames) return;
  for (const f of frames) f.jpeg = '';
  frames.length = 0;
}
