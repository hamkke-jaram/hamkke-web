import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FRAME_LONG_EDGE,
  FRAME_MAX_BYTES,
  FrameError,
  MAX_FRAMES,
  MAX_UPLOAD_FRAMES,
  captureFrame,
  discardFrames,
  frameByteLimit,
  frameTimes,
  sampleFramesFromFile,
  sampleUploadFramesFromFile,
  uploadFrameTimes,
  type Frame,
} from './frames';

/**
 * 장면 사진 뽑기 시험. 이 저장소의 시험 환경에는 DOM이 없어서, <video>·<canvas>를 흉내 낸 가짜를 쓴다.
 * (실제 브라우저의 영상 디코딩·카메라는 여기서 확인하지 못한다. 실제 기기에서 따로 확인해야 한다.)
 */

interface CanvasShot {
  width: number;
  height: number;
  quality: number;
  bytes: number;
}

/** 가짜 화면 설정. 시험마다 바꾼다. */
const world = {
  duration: 100,
  videoWidth: 1920,
  videoHeight: 1080,
  /** 이 시각(초) 근처로 찾아가면 끝났다는 신호가 오지 않는다(찾아가기 제한 시간 시험) */
  stuckAt: null as number | null,
  /** 영상을 열 수 없는 파일 */
  broken: false,
  /** 캔버스가 만들어 주는 사진의 종류 */
  blobType: 'image/jpeg',
  /** 캔버스가 만들어 주는 사진 크기(바이트) */
  sizeOf: (_w: number, _h: number, _q: number): number => 20_000,
  shots: [] as CanvasShot[],
  videos: [] as FakeVideo[],
  /** 찾아가기가 끝날 때마다 부른다(도중에 멈추는 시험) */
  onSeeked: null as ((n: number) => void) | null,
};

class FakeVideo extends EventTarget {
  muted = false;
  playsInline = false;
  preload = '';
  readyState = 0;
  videoWidth = 0;
  videoHeight = 0;
  duration = NaN;
  released = false;
  seeks = 0;
  private time = 0;

  set src(_url: string) {
    void Promise.resolve().then(() => {
      if (world.broken) {
        this.dispatchEvent(new Event('error'));
        return;
      }
      this.duration = world.duration;
      this.videoWidth = world.videoWidth;
      this.videoHeight = world.videoHeight;
      this.readyState = 1;
      this.dispatchEvent(new Event('loadedmetadata'));
    });
  }

  get currentTime() {
    return this.time;
  }

  set currentTime(t: number) {
    this.time = t;
    if (world.stuckAt != null && Math.abs(t - world.stuckAt) < 0.5) return;
    void Promise.resolve().then(() => {
      this.readyState = 2;
      this.seeks++;
      this.dispatchEvent(new Event('seeked'));
      world.onSeeked?.(this.seeks);
    });
  }

  removeAttribute(name: string) {
    if (name === 'src') this.released = true;
  }

  load() {
    /* 실제 요소는 여기서 영상을 놓아 준다 */
  }
}

class FakeCanvas {
  width = 0;
  height = 0;

  getContext() {
    return { drawImage: () => undefined };
  }

  toBlob(cb: (b: Blob | null) => void, _type: string, quality: number) {
    const bytes = Math.max(3, Math.floor(world.sizeOf(this.width, this.height, quality)));
    world.shots.push({ width: this.width, height: this.height, quality, bytes });
    const data = new Uint8Array(bytes);
    data.set([0xff, 0xd8, 0xff]); // JPEG 머리 바이트
    cb(new Blob([data], { type: world.blobType }));
  }
}

function decodedBytes(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

const FILE = new File([new Uint8Array(10)], 'play.mp4', { type: 'video/mp4' });
let created: string[];
let revoked: string[];

beforeEach(() => {
  Object.assign(world, {
    duration: 100,
    videoWidth: 1920,
    videoHeight: 1080,
    stuckAt: null,
    broken: false,
    blobType: 'image/jpeg',
    sizeOf: () => 20_000,
    shots: [],
    videos: [],
    onSeeked: null,
  });
  created = [];
  revoked = [];
  vi.stubGlobal('document', {
    createElement: (tag: string) => {
      if (tag === 'canvas') return new FakeCanvas();
      const v = new FakeVideo();
      world.videos.push(v);
      return v;
    },
  });
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
    const url = `blob:test/${created.length + 1}`;
    created.push(url);
    return url;
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => {
    revoked.push(String(url));
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('frameTimes · frameByteLimit', () => {
  it('처음과 끝 5%를 빼고 고르게 나눈다', () => {
    expect(frameTimes(100, 6)).toEqual([5, 23, 41, 59, 77, 95]);
    expect(frameTimes(100, 1)).toEqual([50]);
    expect(frameTimes(100, 99)).toHaveLength(MAX_FRAMES);
  });

  it('한 장은 300KB 이하, 6장을 합쳐도 요청 본문 2MB를 넘지 않는다', () => {
    for (let n = 1; n <= MAX_FRAMES; n++) {
      const limit = frameByteLimit(n);
      expect(limit).toBeLessThanOrEqual(FRAME_MAX_BYTES);
      // base64는 3바이트를 4글자로 적는다.
      expect(Math.ceil(limit / 3) * 4 * n).toBeLessThan(2 * 1024 * 1024);
    }
  });
});

describe('영상 길이에 맞춘 장면 사진', () => {
  it('짧은 영상은 6장, 44.57초 영상은 초반 5.7초와 끝을 포함해 24장을 고른다', () => {
    expect(uploadFrameTimes(10)).toEqual(frameTimes(10, MAX_FRAMES));
    expect(uploadFrameTimes(20)).toHaveLength(12);
    expect(uploadFrameTimes(30)).toHaveLength(18);
    const times = uploadFrameTimes(44.57);
    expect(times).toHaveLength(MAX_UPLOAD_FRAMES);
    expect(times[2]).toBeCloseTo(5.7, 1);
    expect(times.at(-1)).toBeCloseTo(42.3, 1);
  });

  it('긴 영상의 처음부터 끝까지 4개 구간을 고르고 각 구간은 촘촘하게 본다', () => {
    const times = uploadFrameTimes(124);
    expect(times).toHaveLength(MAX_UPLOAD_FRAMES);
    expect(times.filter((_, i) => i % MAX_FRAMES === 0)).toEqual([0.5, 38.5, 76.5, 114.5]);
    expect(times.at(-1)).toBeCloseTo(123.5);
    for (let i = 1; i < times.length; i++) {
      expect(times[i] - times[i - 1]).toBeGreaterThan(0);
      if (i % MAX_FRAMES) expect(times[i] - times[i - 1]).toBeLessThanOrEqual(2);
    }
  });

  it('24장을 열고 닫는 동안 영상은 한 번만 읽으며 JSON 본문은 2MB보다 작다', async () => {
    world.duration = 44.57;
    world.sizeOf = (_w, _h, quality) => quality > 0.6 ? 80_000 : 54_000;
    const sampled = await sampleUploadFramesFromFile(FILE);
    expect(sampled.frames).toHaveLength(MAX_UPLOAD_FRAMES);
    expect(sampled.frames[2].t).toBe(5.7);
    expect(sampled.durationSec).toBe(44.6);
    expect(JSON.stringify(sampled).length).toBeLessThan(2_000_000);
    expect(world.videos).toHaveLength(1);
    expect(world.videos[0].released).toBe(true);
  });
});

describe('sampleFramesFromFile', () => {
  it('고르게 6장을 긴 변 512px 이하 JPEG로 뽑고, 다 쓰면 영상을 놓아 준다', async () => {
    const { frames, durationSec } = await sampleFramesFromFile(FILE);

    expect(durationSec).toBe(100);
    expect(frames.map((f) => f.t)).toEqual([5, 23, 41, 59, 77, 95]);
    for (const f of frames) {
      expect(f.jpeg.startsWith('data:')).toBe(false);
      const bytes = decodedBytes(f.jpeg);
      expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xff, 0xd8, 0xff]);
      expect(bytes.length).toBeLessThanOrEqual(FRAME_MAX_BYTES);
    }
    // 1920x1080 → 512x288, 화질 0.7
    expect(world.shots).toHaveLength(6);
    for (const s of world.shots) {
      expect(Math.max(s.width, s.height)).toBe(FRAME_LONG_EDGE);
      expect(s.height).toBe(288);
      expect(s.quality).toBeCloseTo(0.7);
    }
    expect(world.videos[0].muted).toBe(true);
    expect(world.videos[0].released).toBe(true);
    expect(created).toHaveLength(1);
    expect(revoked).toEqual(created);
  });

  it('세로 영상도 긴 변을 512px로 맞추고, 작은 영상은 키우지 않는다', async () => {
    world.videoWidth = 1080;
    world.videoHeight = 1920;
    await sampleFramesFromFile(FILE, 1);
    expect(world.shots[0]).toMatchObject({ width: 288, height: 512 });

    world.shots = [];
    world.videoWidth = 320;
    world.videoHeight = 240;
    await sampleFramesFromFile(FILE, 1);
    expect(world.shots[0]).toMatchObject({ width: 320, height: 240 });
  });

  it('한 장이 한도를 넘으면 화질을 낮춘다', async () => {
    const limit = frameByteLimit(MAX_FRAMES);
    world.sizeOf = (_w, _h, q) => (q > 0.6 ? limit + 1 : limit - 1000);

    const { frames } = await sampleFramesFromFile(FILE);

    expect(frames).toHaveLength(6);
    for (const f of frames) expect(decodedBytes(f.jpeg).length).toBeLessThanOrEqual(limit);
    // 장마다 0.7(넘음) → 0.5(통과)
    expect(world.shots).toHaveLength(12);
    expect(world.shots[0].quality).toBeCloseTo(0.7);
    expect(world.shots[1].quality).toBeCloseTo(0.5);
    expect(world.shots[1].width).toBe(512);
  });

  it('가장 낮은 화질로도 넘으면 크기를 줄인다', async () => {
    const limit = frameByteLimit(1);
    world.sizeOf = (w) => (w > 400 ? limit + 1 : 10_000);

    const { frames } = await sampleFramesFromFile(FILE, 1);

    expect(frames).toHaveLength(1);
    expect(decodedBytes(frames[0].jpeg).length).toBe(10_000);
    const last = world.shots[world.shots.length - 1];
    expect(last.width).toBe(384); // 512 × 0.75
    expect(world.shots.filter((s) => s.width === 512).map((s) => s.quality.toFixed(1))).toEqual(['0.7', '0.5', '0.3']);
  });

  it('아무리 줄여도 넘으면 보내지 않고 알린다', async () => {
    world.sizeOf = () => FRAME_MAX_BYTES + 1;
    await expect(sampleFramesFromFile(FILE, 1)).rejects.toBeInstanceOf(FrameError);
    expect(revoked).toEqual(created);
  });

  it('찾아가기가 제한 시간 안에 끝나지 않은 시각은 건너뛴다', async () => {
    vi.useFakeTimers();
    world.stuckAt = 41;

    const pending = sampleFramesFromFile(FILE);
    await vi.advanceTimersByTimeAsync(8_000);
    const { frames } = await pending;

    expect(frames.map((f) => f.t)).toEqual([5, 23, 59, 77, 95]);
    expect(revoked).toEqual(created);
  });

  it('한 장도 뽑지 못하면 알린다', async () => {
    vi.useFakeTimers();
    world.stuckAt = 50;
    const pending = sampleFramesFromFile(FILE, 1);
    const caught = pending.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(8_000);
    expect(await caught).toBeInstanceOf(FrameError);
    expect(revoked).toEqual(created);
  });

  it('도중에 멈추면 AbortError로 끝나고 영상을 놓아 준다', async () => {
    const ctrl = new AbortController();
    world.onSeeked = (n) => {
      if (n === 2) ctrl.abort();
    };

    await expect(sampleFramesFromFile(FILE, MAX_FRAMES, ctrl.signal)).rejects.toMatchObject({ name: 'AbortError' });

    expect(world.videos[0].seeks).toBeLessThanOrEqual(3); // 멈춘 뒤에는 더 찾아가지 않는다
    expect(world.videos[0].released).toBe(true);
    expect(revoked).toEqual(created);
  });

  it('찾아가기를 기다리는 중에 멈춰도 바로 끝난다', async () => {
    vi.useFakeTimers();
    world.stuckAt = 5;
    const ctrl = new AbortController();
    const caught = sampleFramesFromFile(FILE, MAX_FRAMES, ctrl.signal).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(1_000);
    ctrl.abort();
    await vi.advanceTimersByTimeAsync(0);
    expect(await caught).toMatchObject({ name: 'AbortError' });
    expect(revoked).toEqual(created);
  });

  it('이미 멈춘 상태면 영상을 열지도 않는다', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(sampleFramesFromFile(FILE, MAX_FRAMES, ctrl.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(created).toHaveLength(0);
    expect(world.videos).toHaveLength(0);
  });

  it('열 수 없는 영상이면 알리고 영상을 놓아 준다', async () => {
    world.broken = true;
    await expect(sampleFramesFromFile(FILE)).rejects.toBeInstanceOf(FrameError);
    expect(revoked).toEqual(created);
  });

  it('JPEG로 만들지 못하는 브라우저면 보내지 않는다', async () => {
    world.blobType = 'image/png';
    await expect(sampleFramesFromFile(FILE)).rejects.toBeInstanceOf(FrameError);
    expect(revoked).toEqual(created);
  });
});

describe('captureFrame · discardFrames', () => {
  it('실시간 화면을 같은 크기 규칙으로 한 장 찍는다', async () => {
    const video = new FakeVideo();
    video.readyState = 4;
    video.videoWidth = 1280;
    video.videoHeight = 720;

    const frame = await captureFrame(video as unknown as HTMLVideoElement, 12.34);

    expect(frame.t).toBe(12.3);
    expect(decodedBytes(frame.jpeg).length).toBeLessThanOrEqual(frameByteLimit(MAX_FRAMES));
    expect(world.shots[0]).toMatchObject({ width: 512, height: 288 });
  });

  it('화면이 준비되지 않았으면 찍지 않는다', async () => {
    const video = new FakeVideo();
    await expect(captureFrame(video as unknown as HTMLVideoElement, 0)).rejects.toBeInstanceOf(FrameError);
    expect(world.shots).toHaveLength(0);
  });

  it('버린 사진은 내용까지 비운다', () => {
    const frames: Frame[] = [
      { t: 0, jpeg: '/9j/a' },
      { t: 1, jpeg: '/9j/b' },
    ];
    const kept = [...frames];
    discardFrames(frames);
    expect(frames).toHaveLength(0);
    expect(kept.every((f) => f.jpeg === '')).toBe(true);
    expect(() => discardFrames(null)).not.toThrow();
  });
});
