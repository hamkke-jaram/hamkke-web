import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { SaveAiObservationResponse } from '../api/types';
import { AiError, canResumeSave, createObservation, resumeSave, type AiStage, type PendingSave } from './aiClient';
import { FrameError, isAbortError, type Frame } from './frames';

/** 사진 고르기(frames)부터 저장(saving)까지의 단계. */
export type RunStage = 'frames' | AiStage;

export type RunState =
  | { kind: 'idle' }
  | { kind: 'working'; stage: RunStage }
  | { kind: 'done'; data: SaveAiObservationResponse }
  /** 저장은 되었지만 방금 기록의 내용을 화면으로 가져오지 못했다(실패가 아니다). */
  | { kind: 'saved'; message: string }
  | { kind: 'failed'; message: string; retryable: boolean }
  | { kind: 'stopped' };

export interface RunInput {
  frames: Frame[];
  durationSec?: number | null;
  recordedAt?: string;
}

/**
 * AI 관찰 기록 만들기 한 번의 진행 상태(화면과 떨어져 있어서 그대로 시험할 수 있다).
 *
 * - start(getInput): 사진을 준비(getInput)한 뒤 AI 서버로 보내 살펴보고 저장한다. 실패해도 예외를 던지지 않고 상태로 알린다.
 *   앞선 실행이 저장 단계에서만 실패했다면(영수증이 남아 있다면) 사진을 다시 준비하거나 보내지 않고 저장만 다시 한다.
 * - stop(): 진행 중인 요청을 멈춘다. 저장 요청이 나간 뒤에는 되돌릴 수 없으므로 멈추지 않는다.
 * - abort(): 화면을 떠날 때 부른다. 진행 중인 요청을 멈추고, 그 결과는 상태에 반영하지 않는다.
 * 새로 시작하면 앞선 실행은 멈추고, 멈춘 실행의 결과는 상태에 반영하지 않는다.
 */
export class ObservationRun {
  private state: RunState = { kind: 'idle' };
  private readonly listeners = new Set<() => void>();
  private ctrl: AbortController | null = null;
  private saving = false;
  /** 살펴보기는 끝났지만 저장하지 못한 영수증. 메모리에만 둔다. */
  private pending: PendingSave | null = null;

  constructor(private readonly childId: number) {}

  getState = (): RunState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private set(next: RunState) {
    this.state = next;
    this.listeners.forEach((l) => l());
  }

  start = async (getInput: (signal: AbortSignal) => Promise<RunInput>): Promise<void> => {
    this.ctrl?.abort();
    const ctrl = new AbortController();
    this.ctrl = ctrl;
    const current = () => this.ctrl === ctrl && !ctrl.signal.aborted;
    const onStage = (stage: AiStage) => {
      if (!current()) return;
      this.saving = stage === 'saving';
      this.set({ kind: 'working', stage });
    };

    const pending = this.pending;
    this.pending = null;
    this.saving = false;
    try {
      let data: SaveAiObservationResponse;
      if (canResumeSave(pending, this.childId)) {
        data = await resumeSave(pending, { signal: ctrl.signal, onStage });
      } else {
        this.set({ kind: 'working', stage: 'frames' });
        const input = await getInput(ctrl.signal);
        if (!current()) return;
        data = await createObservation(this.childId, input.frames, {
          signal: ctrl.signal,
          durationSec: input.durationSec,
          recordedAt: input.recordedAt,
          onStage,
        });
      }
      if (!current()) return;
      this.saving = false;
      this.set({ kind: 'done', data });
    } catch (e) {
      if (!current() || isAbortError(e)) return;
      this.saving = false;
      if (e instanceof AiError && e.code === 'ALREADY_SAVED') {
        this.set({ kind: 'saved', message: e.message });
      } else if (e instanceof AiError) {
        this.pending = e.pending ?? null;
        this.set({ kind: 'failed', message: e.message, retryable: e.retryable });
      } else if (e instanceof FrameError) {
        this.set({ kind: 'failed', message: e.message, retryable: false });
      } else {
        this.set({ kind: 'failed', message: 'AI 관찰 기록을 만들지 못했어요. 잠시 후 다시 시도해 주세요.', retryable: true });
      }
    }
  };

  stop = (): void => {
    if (this.saving) return;
    this.ctrl?.abort();
    this.ctrl = null;
    if (this.state.kind === 'working') this.set({ kind: 'stopped' });
  };

  reset = (): void => {
    this.abort();
    this.saving = false;
    this.pending = null;
    this.set({ kind: 'idle' });
  };

  abort = (): void => {
    this.ctrl?.abort();
    this.ctrl = null;
  };
}

/** ObservationRun을 화면에 붙인다. 화면을 떠나면(언마운트) 진행 중인 요청을 멈춘다. */
export function useObservationRun(childId: number) {
  const run = useMemo(() => new ObservationRun(childId), [childId]);
  useEffect(() => run.abort, [run]);
  const state = useSyncExternalStore(run.subscribe, run.getState, run.getState);
  return { state, start: run.start, stop: run.stop, reset: run.reset };
}
