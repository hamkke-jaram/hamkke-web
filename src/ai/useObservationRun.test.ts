import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SaveAiObservationResponse } from '../api/types';
import { AiError, createObservation, resumeSave, type CreateObservationOptions, type PendingSave } from './aiClient';
import { FrameError, type Frame } from './frames';
import { ObservationRun, type RunInput, type RunState } from './useObservationRun';

// 네트워크 단계(createObservation·resumeSave)만 가짜로 바꾸고, 오류 종류와 '저장만 다시 해도 되는지' 판단은 실제 것을 쓴다.
vi.mock('./aiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./aiClient')>();
  return { ...actual, createObservation: vi.fn(), resumeSave: vi.fn() };
});

const create = vi.mocked(createObservation);
const resume = vi.mocked(resumeSave);

const FRAMES: Frame[] = [{ t: 1, jpeg: '/9j/a' }];
const DONE = { observation: { id: 1 }, coaching: null } as unknown as SaveAiObservationResponse;
const input = async (): Promise<RunInput> => ({ frames: FRAMES, durationSec: 60, recordedAt: '2026-11-13T01:00:00Z' });

/** 바깥에서 끝낼 수 있는 약속 */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** 여러 번의 await 를 건너 상태가 반영될 때까지 기다린다. */
const settle = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

function watch(run: ObservationRun): RunState['kind'][] {
  const kinds: RunState['kind'][] = [];
  run.subscribe(() => kinds.push(run.getState().kind));
  return kinds;
}

/** createObservation 이 주어진 단계까지 간 뒤 work 가 끝나기를 기다리게 한다. 받은 signal 을 돌려준다. */
function holdAt(stage: 'session' | 'analyzing' | 'saving', work: Promise<SaveAiObservationResponse>) {
  const seen: { signal?: AbortSignal } = {};
  create.mockImplementationOnce(async (_childId: number, _frames: Frame[], opts: CreateObservationOptions = {}) => {
    seen.signal = opts.signal;
    for (const s of ['session', 'analyzing', 'saving'] as const) {
      opts.onStage?.(s);
      if (s === stage) break;
    }
    return work;
  });
  return seen;
}

beforeEach(() => {
  create.mockReset();
  resume.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ObservationRun', () => {
  it('사진을 준비해 보내고, 끝나면 결과를 알린다', async () => {
    create.mockResolvedValueOnce(DONE);
    const run = new ObservationRun(7);
    const kinds = watch(run);
    expect(run.getState()).toEqual({ kind: 'idle' });

    await run.start(input);

    expect(run.getState()).toEqual({ kind: 'done', data: DONE });
    expect(kinds).toEqual(['working', 'done']);
    expect(create).toHaveBeenCalledWith(
      7,
      FRAMES,
      expect.objectContaining({ durationSec: 60, recordedAt: '2026-11-13T01:00:00Z' }),
    );
  });

  it('살펴보는 중에 멈추면 요청을 거두고, 뒤늦게 온 결과는 반영하지 않는다', async () => {
    const work = deferred<SaveAiObservationResponse>();
    const seen = holdAt('analyzing', work.promise);
    const run = new ObservationRun(7);
    const started = run.start(input);
    await settle();
    expect(run.getState()).toEqual({ kind: 'working', stage: 'analyzing' });

    run.stop();
    expect(seen.signal?.aborted).toBe(true);
    expect(run.getState()).toEqual({ kind: 'stopped' });

    work.resolve(DONE);
    await started;
    expect(run.getState()).toEqual({ kind: 'stopped' });
  });

  it('사진을 준비하는 중에 멈추면 AI 서버로 아무것도 보내지 않는다', async () => {
    const frames = deferred<RunInput>();
    const run = new ObservationRun(7);
    const started = run.start(() => frames.promise);
    expect(run.getState()).toEqual({ kind: 'working', stage: 'frames' });

    run.stop();
    frames.resolve({ frames: FRAMES });
    await started;

    expect(create).not.toHaveBeenCalled();
    expect(run.getState()).toEqual({ kind: 'stopped' });
  });

  it('저장 요청이 나간 뒤에는 멈추기를 받지 않는다', async () => {
    const work = deferred<SaveAiObservationResponse>();
    const seen = holdAt('saving', work.promise);
    const run = new ObservationRun(7);
    const started = run.start(input);
    await settle();
    expect(run.getState()).toEqual({ kind: 'working', stage: 'saving' });

    run.stop();
    expect(seen.signal?.aborted).toBe(false);
    expect(run.getState()).toEqual({ kind: 'working', stage: 'saving' });

    work.resolve(DONE);
    await started;
    expect(run.getState()).toEqual({ kind: 'done', data: DONE });
  });

  it('화면을 떠나면(abort) 요청을 거두고, 뒤늦게 온 결과나 실패를 반영하지 않는다', async () => {
    for (const finish of ['resolve', 'reject'] as const) {
      const work = deferred<SaveAiObservationResponse>();
      const seen = holdAt('analyzing', work.promise);
      const run = new ObservationRun(7);
      const started = run.start(input);
      await settle();
      const kinds = watch(run);

      run.abort();
      expect(seen.signal?.aborted).toBe(true);
      if (finish === 'resolve') work.resolve(DONE);
      else work.reject(new AiError('NETWORK', '닿지 못했어요', true));
      await started;

      expect(kinds).toEqual([]); // 떠난 뒤에는 상태를 바꾸지 않는다
    }
  });

  it('화면을 떠났다가 다시 붙어도(개발 모드의 이중 마운트) 새로 시작할 수 있다', async () => {
    create.mockResolvedValueOnce(DONE);
    const run = new ObservationRun(7);
    run.abort();
    await run.start(input);
    expect(run.getState().kind).toBe('done');
  });

  it('새로 시작하면 앞선 실행을 거두고 그 결과를 쓰지 않는다', async () => {
    const first = deferred<SaveAiObservationResponse>();
    const seen = holdAt('analyzing', first.promise);
    const second = { observation: { id: 2 }, coaching: null } as unknown as SaveAiObservationResponse;
    const run = new ObservationRun(7);
    const a = run.start(input);
    await settle();

    create.mockResolvedValueOnce(second);
    const b = run.start(input);
    expect(seen.signal?.aborted).toBe(true);
    first.resolve(DONE);
    await Promise.all([a, b]);

    expect(run.getState()).toEqual({ kind: 'done', data: second });
  });

  it('살펴보기에서 실패하면 다시 시도할 때 처음부터 다시 한다', async () => {
    create.mockRejectedValueOnce(new AiError('BUSY', '잠시 후 다시 시도해 주세요.', true));
    create.mockResolvedValueOnce(DONE);
    const run = new ObservationRun(7);
    await run.start(input);
    expect(run.getState()).toEqual({ kind: 'failed', message: '잠시 후 다시 시도해 주세요.', retryable: true });

    await run.start(input);
    expect(create).toHaveBeenCalledTimes(2);
    expect(resume).not.toHaveBeenCalled();
    expect(run.getState().kind).toBe('done');
  });

  it('저장에서만 실패하면 다시 시도할 때 사진을 다시 준비하거나 보내지 않고 저장만 다시 한다', async () => {
    const pending: PendingSave = { childId: 7, receipt: 'signed-receipt', receivedAt: Date.now() };
    create.mockRejectedValueOnce(new AiError('SAVE_FAILED', '저장하지 못했어요.', true, pending));
    resume.mockImplementationOnce(async (_p, opts = {}) => {
      opts.onStage?.('saving');
      return DONE;
    });
    const run = new ObservationRun(7);
    await run.start(input);
    expect(run.getState().kind).toBe('failed');

    const getInput = vi.fn(input);
    const kinds = watch(run);
    await run.start(getInput);

    expect(getInput).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
    expect(resume).toHaveBeenCalledTimes(1);
    expect(resume.mock.calls[0][0]).toBe(pending);
    expect(kinds).toEqual(['working', 'done']);
    expect(run.getState()).toEqual({ kind: 'done', data: DONE });
  });

  it('저장만 다시 하는 것도 실패하면 영수증을 계속 들고 있다가 다음에 다시 쓴다', async () => {
    const pending: PendingSave = { childId: 7, receipt: 'signed-receipt', receivedAt: Date.now() };
    create.mockRejectedValueOnce(new AiError('SAVE_FAILED', '저장하지 못했어요.', true, pending));
    resume.mockRejectedValueOnce(new AiError('SAVE_FAILED', '저장하지 못했어요.', true, pending));
    resume.mockResolvedValueOnce(DONE);
    const run = new ObservationRun(7);
    await run.start(input);
    await run.start(input);
    expect(run.getState().kind).toBe('failed');
    await run.start(input);
    expect(resume).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledTimes(1);
    expect(run.getState().kind).toBe('done');
  });

  it('영수증 유효 시간이 지났으면 처음부터 다시 한다', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-13T01:00:00Z'));
    const pending: PendingSave = { childId: 7, receipt: 'signed-receipt', receivedAt: Date.now() };
    create.mockRejectedValueOnce(new AiError('SAVE_FAILED', '저장하지 못했어요.', true, pending));
    create.mockResolvedValueOnce(DONE);
    const run = new ObservationRun(7);
    await run.start(input);

    vi.setSystemTime(new Date('2026-11-13T01:15:00Z'));
    await run.start(input);
    expect(resume).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('처음으로 되돌리면(reset) 들고 있던 영수증을 버린다', async () => {
    const pending: PendingSave = { childId: 7, receipt: 'signed-receipt', receivedAt: Date.now() };
    create.mockRejectedValueOnce(new AiError('SAVE_FAILED', '저장하지 못했어요.', true, pending));
    create.mockResolvedValueOnce(DONE);
    const run = new ObservationRun(7);
    await run.start(input);
    run.reset();
    expect(run.getState()).toEqual({ kind: 'idle' });

    await run.start(input);
    expect(resume).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('이미 저장되어 있었다면 실패가 아니라 저장됨으로 알린다', async () => {
    create.mockRejectedValueOnce(new AiError('ALREADY_SAVED', "아이 화면의 'AI 관찰 기록'에서 볼 수 있어요.", false));
    const run = new ObservationRun(7);
    await run.start(input);
    expect(run.getState()).toEqual({ kind: 'saved', message: "아이 화면의 'AI 관찰 기록'에서 볼 수 있어요." });
  });

  it('사진을 뽑지 못하면 보내지 않고, 다시 시도를 권하지 않는다', async () => {
    const run = new ObservationRun(7);
    await run.start(async () => {
      throw new FrameError('영상에서 장면 사진을 뽑지 못했어요.');
    });
    expect(create).not.toHaveBeenCalled();
    expect(run.getState()).toEqual({ kind: 'failed', message: '영상에서 장면 사진을 뽑지 못했어요.', retryable: false });
  });

  it('알 수 없는 오류도 화면 문구로 알린다(예외를 던지지 않는다)', async () => {
    create.mockRejectedValueOnce(new TypeError('boom'));
    const run = new ObservationRun(7);
    await expect(run.start(input)).resolves.toBeUndefined();
    const state = run.getState();
    expect(state.kind).toBe('failed');
    expect(state.kind === 'failed' && state.message).not.toContain('boom');
  });
});
