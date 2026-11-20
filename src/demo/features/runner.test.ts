import { describe, expect, it } from 'vitest';
import { Runner, type Net } from './runner';
import { charDelay, readMs, scaled, splitChars, ymFromToday, ymdFromToday } from './timing';
import type { Driver, NetLike, ScenarioData, Services, Step, Target } from './types';

/* 엔진의 단계 진행(가짜 화면·가짜 시계로 확인한다). */

type Call = string;

function fakeDriver(calls: Call[], hooks: Partial<Record<'click' | 'type' | 'find', (t: Target) => void>> = {}): Driver {
  return {
    async find(t) {
      hooks.find?.(t);
      calls.push(`find ${t}`);
    },
    async reveal(t) {
      calls.push(`reveal ${t}`);
    },
    spotlight(t) {
      calls.push(`spot ${t ?? '-'}`);
    },
    async type(t, text, o) {
      hooks.type?.(t);
      calls.push(`type ${t} ${text}${o.instant ? ' (한 번에)' : ''}${o.clear ? ' (비우고)' : ''}`);
      if (!o.instant) for (const ch of splitChars(text)) await o.sleep(o.delay(ch, 0));
    },
    async fill(t, v) {
      calls.push(`fill ${t} ${v}`);
    },
    async click(t) {
      calls.push(`click ${t}`);
      hooks.click?.(t);
    },
    async putFile(t) {
      calls.push(`file ${t}`);
    },
    async goto(p) {
      calls.push(`goto ${p}`);
    },
    async waitRoute(r) {
      calls.push(`route ${r.source}`);
    },
    text: () => '',
    exists: () => true,
    isDisabled: () => false,
  };
}

const services = (calls: Call[]): Services => ({
  async switchTo(a) {
    calls.push(`as ${a ?? '로그아웃'}`);
  },
  async adopt(a) {
    calls.push(`adopt ${a}`);
  },
  async check() {
    return { id: 1, status: 200, data: undefined };
  },
  forget() {},
});

function fakeNet(entries: NetLike[] = [], appCount = 0): Net {
  return {
    mark: () => 0,
    wait: async (e) => entries.find((x) => x.method === e.method && e.path.test(x.path)) ?? null,
    appCountSince: () => appCount,
  };
}

const data = (): ScenarioData => ({ aiOn: false, vars: { email: 'a@demo.hamkke.test' } });
const tick = () => new Promise((r) => setTimeout(r, 0));

function make(steps: Step[], o: { calls?: Call[]; driver?: Driver; net?: Net; reduced?: boolean; clock?: (ms: number) => Promise<void>; speed?: number } = {}) {
  const calls = o.calls ?? [];
  return new Runner({
    steps,
    data: data(),
    driver: o.driver ?? fakeDriver(calls),
    services: services(calls),
    net: o.net ?? fakeNet(),
    clock: o.clock ?? (async () => undefined),
    reduced: o.reduced,
    random: () => 0.5,
    speed: o.speed,
  });
}

describe('단계 진행', () => {
  it('정해진 순서대로 화면을 움직이고 끝나면 비추기를 끈다', async () => {
    const calls: Call[] = [];
    const r = make(
      [
        { kind: 'as', account: null },
        { kind: 'goto', path: '/register', target: '@signup-email' },
        { kind: 'type', target: '@signup-email', text: (d) => d.vars.email },
        { kind: 'click', target: '@signup-submit' },
        { kind: 'wait', route: /^\/p/ },
      ],
      { calls },
    );
    expect(await r.run()).toBe('done');
    expect(calls).toEqual([
      'spot -',
      'as 로그아웃',
      'spot -',
      'goto /register',
      'find @signup-email',
      'reveal @signup-email',
      'spot @signup-email',
      'find @signup-email',
      'reveal @signup-email',
      'spot @signup-email',
      'type @signup-email a@demo.hamkke.test',
      'find @signup-submit',
      'reveal @signup-submit',
      'spot @signup-submit',
      'click @signup-submit',
      'spot -',
      'route ^\\/p',
      'spot -',
    ]);
    expect(r.view.status).toBe('done');
  });

  it('움직임 줄이기에서는 글자를 한 번에 채운다(단계는 그대로)', async () => {
    const calls: Call[] = [];
    await make([{ kind: 'type', target: '@x-name', text: '별이', clear: true }], { calls, reduced: true }).run();
    expect(calls).toContain('type @x-name 별이 (한 번에) (비우고)');
  });

  it('일시정지하면 다음 동작으로 넘어가지 않고, 계속을 누르면 이어 간다', async () => {
    const calls: Call[] = [];
    let runner: Runner | null = null;
    const driver = fakeDriver(calls, { click: () => runner?.pause() });
    runner = make(
      [
        { kind: 'click', target: '@a-btn' },
        { kind: 'click', target: '@b-btn' },
      ],
      { calls, driver },
    );
    const done = runner.run();
    await tick();
    expect(runner.view.status).toBe('paused');
    expect(calls.filter((c) => c.startsWith('click'))).toEqual(['click @a-btn']);
    runner.resume();
    await tick();
    // 두 번째 클릭에서 다시 멈춘다(가짜 화면이 누를 때마다 멈추게 했다).
    expect(calls.filter((c) => c.startsWith('click'))).toEqual(['click @a-btn', 'click @b-btn']);
    runner.resume();
    expect(await done).toBe('done');
  });

  it('사람이 만져서 멈춘 상태는 interrupted로 보이고, 사람 차례(letUser)에는 멈추지 않는다', async () => {
    let runner: Runner | null = null;
    let seen = '';
    runner = make([
      {
        kind: 'do',
        run: async (ctx) => {
          await ctx.letUser(async () => {
            runner?.interrupt();
            seen = runner?.view.status ?? '';
          });
          runner?.interrupt();
        },
      },
      { kind: 'say', say: { title: '다음', body: '다음 단계' } },
    ]);
    const done = runner.run();
    await tick();
    expect(seen).toBe('running');
    expect(runner.view.status).toBe('interrupted');
    runner.resume();
    expect(await done).toBe('done');
  });

  it('그만 보기를 누르면 남은 단계를 실행하지 않고 stopped로 끝난다', async () => {
    const calls: Call[] = [];
    let runner: Runner | null = null;
    const driver = fakeDriver(calls, { click: () => runner?.stop() });
    runner = make(
      [
        { kind: 'click', target: '@a-btn' },
        { kind: 'click', target: '@b-btn' },
      ],
      { calls, driver },
    );
    expect(await runner.run()).toBe('stopped');
    expect(calls).not.toContain('click @b-btn');
    expect(runner.view.status).toBe('stopped');
  });

  it('실패한 단계는 멈추고 고르게 한다: 건너뛰고 계속', async () => {
    const calls: Call[] = [];
    const driver = fakeDriver(calls, {
      find: (t) => {
        if (t === '@missing') throw new Error('없어요');
      },
    });
    const r = make(
      [
        { kind: 'click', target: '@missing' },
        { kind: 'click', target: '@next-btn' },
      ],
      { calls, driver },
    );
    const done = r.run();
    await tick();
    expect(r.view.status).toBe('error');
    expect(r.view.error).toBe('없어요');
    r.decide('skip');
    expect(await done).toBe('done');
    expect(calls).toContain('click @next-btn');
  });

  it('실패한 단계 다시 해 보기는 같은 단계를 한 번 더 실행한다', async () => {
    let fail = true;
    const calls: Call[] = [];
    const driver = fakeDriver(calls, {
      find: () => {
        if (fail) throw new Error('아직 없어요');
      },
    });
    const r = make([{ kind: 'click', target: '@later-btn' }], { calls, driver });
    const done = r.run();
    await tick();
    expect(r.view.status).toBe('error');
    fail = false;
    r.decide('retry');
    expect(await done).toBe('done');
    expect(calls).toContain('click @later-btn');
  });

  it('optional 단계는 실패해도 조용히 넘어간다', async () => {
    const calls: Call[] = [];
    const driver = fakeDriver(calls, {
      find: (t) => {
        if (t === '@old-server-only') throw new Error('없어요');
      },
    });
    const r = make(
      [
        { kind: 'say', target: '@old-server-only', optional: true, say: { title: 't', body: 'b' } },
        { kind: 'click', target: '@next-btn' },
      ],
      { calls, driver },
    );
    expect(await r.run()).toBe('done');
    expect(calls).toContain('click @next-btn');
  });

  it('기다린 요청의 상태가 다르면 오류로 멈추고, 맞으면 말풍선에 그 요청을 보인다', async () => {
    const ok = make([{ kind: 'click', target: '@go-btn', expect: { method: 'POST', path: /\/children$/, status: [200, 201] } }], {
      net: fakeNet([{ id: 7, method: 'POST', path: '/children', status: 201, source: 'app' }]),
    });
    expect(await ok.run()).toBe('done');
    expect(ok.view.requestId).toBe(7);

    const bad = make([{ kind: 'click', target: '@go-btn', expect: { method: 'POST', path: /\/children$/, status: 201 } }], {
      net: fakeNet([{ id: 8, method: 'POST', path: '/children', status: 422, source: 'app' }]),
    });
    const done = bad.run();
    await tick();
    expect(bad.view.status).toBe('error');
    expect(bad.view.error).toContain('422');
    bad.stop();
    expect(await done).toBe('stopped');
  });

  it("연결 실패를 기다리는 단계는 'offline'을 맞는 결과로 본다", async () => {
    const r = make([{ kind: 'click', target: '@go-btn', expect: { method: 'GET', path: /support/, status: 'offline' } }], {
      net: fakeNet([{ id: 2, method: 'GET', path: '/support-resources', status: 'offline', source: 'app' }]),
    });
    expect(await r.run()).toBe('done');
  });

  it('요청이 없어야 하는 단계는 0건이면 그 사실을 보인다', async () => {
    const views: boolean[] = [];
    const r = make([{ kind: 'click', target: '@submit-btn', noRequest: true }], { net: fakeNet([], 0) });
    r.subscribe(() => views.push(r.view.noRequest));
    await r.run();
    expect(views).toContain(true);
  });

  it('건너뛰기는 그 단계의 onSkip을 부르고 기다림을 끝낸다', async () => {
    let skippedCalled = false;
    const r = make([
      {
        kind: 'do',
        run: (ctx) =>
          new Promise<void>((res) => {
            ctx.skipSignal.addEventListener('abort', () => res());
          }),
        onSkip: () => {
          skippedCalled = true;
        },
      },
    ]);
    const done = r.run();
    await tick();
    r.skip();
    expect(await done).toBe('done');
    expect(skippedCalled).toBe(true);
  });

  it('속도 2x는 기다리는 시간을 절반으로 줄인다', async () => {
    const total = async (speed: number) => {
      let ms = 0;
      const r = make([{ kind: 'say', say: { title: '제목', body: '읽을 시간이 필요한 설명이에요.' } }], {
        clock: async (m) => {
          ms += m;
        },
        speed,
      });
      await r.run();
      return ms;
    };
    const one = await total(1);
    expect(one).toBe(readMs('제목', '읽을 시간이 필요한 설명이에요.'));
    expect(await total(2)).toBe(Math.round(one / 2));
  });
});

describe('시간 계산', () => {
  it('글자 간격: 기본 70ms ± 30ms, 공백·문장부호 뒤에는 더 쉰다', () => {
    expect(charDelay('가', () => 0.5)).toBe(70);
    expect(charDelay('가', () => 0)).toBe(40);
    expect(charDelay('가', () => 0.999)).toBe(100);
    expect(charDelay(' ', () => 0.5)).toBe(190);
    expect(charDelay('.', () => 0.5)).toBe(190);
  });

  it('한글은 음절 단위로 나눈다', () => {
    expect(splitChars('별이 ab')).toEqual(['별', '이', ' ', 'a', 'b']);
  });

  it('읽기 시간은 1.8~8초 사이', () => {
    expect(readMs('', '')).toBe(1800);
    expect(readMs('a'.repeat(500), '')).toBe(8000);
    expect(scaled(1000, 2)).toBe(500);
    expect(scaled(1000, 0)).toBe(1000);
  });

  it('날짜 칸 값', () => {
    const now = new Date(2026, 10, 14);
    expect(ymdFromToday(1, now)).toBe('2026-11-15');
    expect(ymdFromToday(-14, now)).toBe('2026-10-31');
    expect(ymFromToday(36, now)).toBe('2023-11');
  });
});
