import { charDelay, readMs, scaled } from './timing';
import {
  resolve,
  type Driver,
  type Expect,
  type Narration,
  type NetLike,
  type ScenarioData,
  type Services,
  type Step,
  type StepContext,
  type Target,
} from './types';

/**
 * 기능별 시연 엔진. 단계 목록을 차례로 실행하며 일시정지·계속, 건너뛰기, 속도, 그만 보기를 다룬다.
 * 화면 조작은 Driver에, 계정·요청은 Services와 Net에 맡겨서 이 파일은 DOM 없이 테스트할 수 있다.
 */

export type RunStatus = 'running' | 'paused' | 'interrupted' | 'error' | 'done' | 'stopped';

export interface RunView {
  status: RunStatus;
  index: number;
  total: number;
  narration: Narration | null;
  target: Target | null;
  /** 말풍선에 함께 보일 요청 기록 id */
  requestId: number | null;
  /** 이 단계에서 서버로 간 요청이 없었음을 보인다. */
  noRequest: boolean;
  error: string | null;
  speed: number;
}

export interface Net {
  mark(): number;
  /** since 뒤에 생긴, 응답까지 끝난 요청을 기다린다. skip이 오면 null. */
  wait(e: Expect, since: number, o: { signal: AbortSignal; skip: AbortSignal; timeout: number }): Promise<NetLike | null>;
  /** since 뒤에 화면이 보낸 요청 수 */
  appCountSince(since: number): number;
}

export interface RunnerOptions {
  steps: Step[];
  data: ScenarioData;
  driver: Driver;
  services: Services;
  net: Net;
  /** 실제 시간 기다리기(테스트에서는 바로 끝나는 가짜) */
  clock?: (ms: number) => Promise<void>;
  reduced?: boolean;
  random?: () => number;
  speed?: number;
}

const FIND_TIMEOUT = 12_000;
const REQUEST_TIMEOUT = 25_000;
const NO_REQUEST_WAIT = 700;
const SLICE = 50;

export class StopError extends Error {
  constructor() {
    super('stopped');
  }
}

class SkipSignal {
  ctrl = new AbortController();
}

function realClock(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

export function errorText(e: unknown) {
  if (e instanceof Error && e.message) return e.message;
  return '알 수 없는 문제가 생겼어요.';
}

export class Runner {
  private o: Required<Omit<RunnerOptions, 'speed'>> & { speed: number };
  private ctrl = new AbortController();
  private paused: { promise: Promise<void>; resume: () => void } | null = null;
  private decision: ((d: 'retry' | 'skip' | 'stop') => void) | null = null;
  private skipSig = new SkipSignal();
  private fastForward = false;
  private userTurn = 0;
  private listeners = new Set<() => void>();
  view: RunView;

  constructor(opts: RunnerOptions) {
    this.o = {
      clock: realClock,
      reduced: false,
      random: Math.random,
      ...opts,
      speed: opts.speed ?? 1,
    };
    this.view = {
      status: 'running',
      index: 0,
      total: opts.steps.length,
      narration: null,
      target: null,
      requestId: null,
      noRequest: false,
      error: null,
      speed: this.o.speed,
    };
  }

  // ---------- 바깥(제어 패널)에서 부르는 것 ----------

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  get signal() {
    return this.ctrl.signal;
  }

  /** 사람이 직접 만지는 중이라 멈추지 않아도 되는지 */
  get userAllowed() {
    return this.userTurn > 0;
  }

  pause() {
    if (this.view.status !== 'running') return;
    this.hold('paused');
  }

  /** 사람이 화면을 직접 만져서 멈춤 */
  interrupt() {
    if (this.view.status !== 'running' || this.userAllowed) return;
    this.hold('interrupted');
  }

  resume() {
    if (this.view.status !== 'paused' && this.view.status !== 'interrupted') return;
    const p = this.paused;
    this.paused = null;
    this.set({ status: 'running' });
    p?.resume();
  }

  /** 지금 단계를 빨리 끝낸다(글자는 한 번에 채우고, 읽기 시간은 건너뛴다). */
  skip() {
    if (this.view.status === 'error') {
      this.decide('skip');
      return;
    }
    this.fastForward = true;
    this.skipSig.ctrl.abort();
    if (this.view.status === 'paused' || this.view.status === 'interrupted') this.resume();
  }

  setSpeed(speed: number) {
    this.o.speed = speed;
    this.set({ speed });
  }

  stop() {
    if (this.ctrl.signal.aborted) return;
    this.ctrl.abort();
    this.paused?.resume();
    this.paused = null;
    this.decision?.('stop');
  }

  /** 오류가 난 단계에서: 다시 해 보기 / 건너뛰고 계속 / 그만 보기 */
  decide(d: 'retry' | 'skip' | 'stop') {
    const fn = this.decision;
    this.decision = null;
    fn?.(d);
  }

  // ---------- 실행 ----------

  async run(): Promise<'done' | 'stopped'> {
    const { steps } = this.o;
    let i = 0;
    try {
      while (i < steps.length) {
        this.checkAbort();
        this.fastForward = false;
        this.skipSig = new SkipSignal();
        // 새 설명과 함께 새 동작을 하는 단계에서만 앞 단계의 요청 표시를 지운다. 설명만 하는 단계('say')와
        // 설명 없는 단계는 앞 단계의 결과(요청 0건, 보낸 요청)를 그대로 두어 그 결과를 설명할 수 있게 한다.
        const fresh = steps[i].say && steps[i].kind !== 'say';
        this.set(fresh ? { index: i, noRequest: false, requestId: null, error: null } : { index: i, error: null });
        try {
          await this.runStep(steps[i]);
          i++;
        } catch (e) {
          if (e instanceof StopError || this.ctrl.signal.aborted) throw new StopError();
          if (steps[i].optional) {
            i++;
            continue;
          }
          this.set({ status: 'error', error: errorText(e) });
          const d = await new Promise<'retry' | 'skip' | 'stop'>((r) => {
            this.decision = r;
          });
          if (d === 'stop') throw new StopError();
          this.set({ status: 'running', error: null });
          if (d === 'skip') i++;
        }
      }
      this.o.driver.spotlight(null);
      this.set({ status: 'done', target: null, index: steps.length });
      return 'done';
    } catch {
      this.o.driver.spotlight(null);
      this.set({ status: 'stopped', target: null });
      return 'stopped';
    }
  }

  private async runStep(step: Step) {
    const { driver, data } = this.o;
    const signal = this.ctrl.signal;
    const target = 'target' in step ? step.target : undefined;

    if (target && step.kind !== 'goto') {
      await this.point(target);
    } else if (step.kind !== 'do') {
      this.spot(null);
    }

    if (step.say) await this.narrate(resolve(step.say, data));
    await this.checkpoint();

    const since = this.o.net.mark();
    let entry: NetLike | null = null;

    switch (step.kind) {
      case 'say':
        break;
      case 'goto':
        await driver.goto(resolve(step.path, data), { signal, timeout: FIND_TIMEOUT });
        if (step.target) await this.point(step.target);
        break;
      case 'type':
        await driver.type(step.target, resolve(step.text, data), {
          signal,
          clear: step.clear,
          reveal: step.reveal,
          instant: this.o.reduced || this.fastForward,
          delay: (ch) => charDelay(ch, this.o.random),
          sleep: (ms) => this.sleep(ms),
        });
        break;
      case 'fill':
        await driver.fill(step.target, resolve(step.value, data));
        await this.sleep(700);
        break;
      case 'click':
        await this.sleep(250);
        await driver.click(step.target);
        break;
      case 'wait':
        if (step.target) await this.find(step.target, step.timeout ?? FIND_TIMEOUT);
        if (step.route) await driver.waitRoute(step.route, { signal, timeout: step.timeout ?? FIND_TIMEOUT });
        break;
      case 'as':
        await this.o.services.switchTo(step.account);
        break;
      case 'do': {
        const ctx = this.context();
        const onSkip = step.onSkip;
        if (onSkip) {
          const skipSignal = this.skipSig.ctrl.signal;
          const fire = () => void Promise.resolve(onSkip(ctx)).catch(() => undefined);
          skipSignal.addEventListener('abort', fire, { once: true });
          try {
            await step.run(ctx);
          } finally {
            skipSignal.removeEventListener('abort', fire);
          }
        } else {
          await step.run(ctx);
        }
        break;
      }
    }

    if ((step.kind === 'click' || step.kind === 'do') && step.expect) {
      entry = await this.o.net.wait(step.expect, since, {
        signal,
        skip: this.skipSig.ctrl.signal,
        timeout: REQUEST_TIMEOUT,
      });
      if (entry) {
        const want = step.expect.status;
        const ok =
          want === undefined ||
          (Array.isArray(want) ? want : [want]).includes(entry.status as Exclude<NetLike['status'], 'pending'>);
        this.set({ requestId: entry.id });
        if (!ok) {
          throw new Error(
            entry.status === 'offline'
              ? '서버에 닿지 못했어요. 기록 서버가 켜져 있는지 확인해 주세요.'
              : `서버가 예상과 다르게 답했어요. (${entry.method} ${entry.path.split('?')[0]} → ${entry.status})${
                  entry.status === 404 || entry.status === 405 ? ' 연결된 기록 서버가 아직 이 기능을 모르는 판일 수 있어요.' : ''
                }`,
          );
        }
      }
    }
    if ((step.kind === 'click' || step.kind === 'do') && step.noRequest) {
      await this.sleep(NO_REQUEST_WAIT);
      if (this.o.net.appCountSince(since) === 0) this.set({ noRequest: true });
    }

    if (step.after) await this.narrate(resolve(step.after, data));
  }

  private context(): StepContext {
    return {
      data: this.o.data,
      signal: this.ctrl.signal,
      driver: this.o.driver,
      services: this.o.services,
      sleep: (ms) => this.sleep(ms),
      say: async (n, target) => {
        if (target) await this.point(target);
        await this.narrate(n);
      },
      // (ctx.say는 요청 표시를 지우지 않는다: 확인 요청을 보여 준 뒤 그 결과를 설명하는 경우가 많다)
      show: (id) => this.set({ requestId: id }),
      skipped: () => this.skipSig.ctrl.signal.aborted,
      skipSignal: this.skipSig.ctrl.signal,
      letUser: async (fn) => {
        this.userTurn++;
        try {
          return await fn();
        } finally {
          this.userTurn--;
        }
      },
      waitRequest: (e, since, timeoutMs) =>
        this.o.net.wait(e, since, { signal: this.ctrl.signal, skip: this.skipSig.ctrl.signal, timeout: timeoutMs ?? REQUEST_TIMEOUT }),
      mark: () => this.o.net.mark(),
    };
  }

  // ---------- 도우미 ----------

  private set(patch: Partial<RunView>) {
    this.view = { ...this.view, ...patch };
    this.listeners.forEach((l) => l());
  }

  private hold(status: 'paused' | 'interrupted') {
    if (!this.paused) {
      let resume = () => undefined as void;
      const promise = new Promise<void>((r) => {
        resume = r;
      });
      this.paused = { promise, resume };
    }
    this.set({ status });
  }

  private checkAbort() {
    if (this.ctrl.signal.aborted) throw new StopError();
  }

  /** 멈춰 있으면 계속을 누를 때까지 기다리고, 그만 보기면 멈춘다. */
  private async checkpoint() {
    this.checkAbort();
    while (this.paused) {
      await this.paused.promise;
      this.checkAbort();
    }
  }

  /** 일시정지·속도·건너뛰기를 따르는 기다리기 */
  async sleep(ms: number) {
    let left = scaled(ms, this.o.speed);
    await this.checkpoint();
    while (left > 0) {
      if (this.fastForward) return;
      const slice = Math.min(SLICE, left);
      await this.o.clock(slice);
      left -= slice;
      await this.checkpoint();
    }
  }

  private spot(target: Target | null) {
    this.o.driver.spotlight(target);
    this.set({ target });
  }

  private async find(target: Target, timeout: number) {
    await this.o.driver.find(target, {
      timeout,
      signal: this.ctrl.signal,
      hidden: true,
      skip: undefined,
    });
  }

  /** 요소를 찾아 보이게 하고 비춘다. */
  private async point(target: Target) {
    await this.find(target, FIND_TIMEOUT);
    await this.o.driver.reveal(target);
    this.spot(target);
  }

  private async narrate(n: Narration) {
    this.set({ narration: n });
    await this.sleep(readMs(n.title, n.body));
  }
}
