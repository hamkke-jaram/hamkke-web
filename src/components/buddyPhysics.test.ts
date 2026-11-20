import { describe, expect, it } from 'vitest';
import {
  GRAVITY,
  MAX_THROW,
  buddyPose,
  cheerBuddy,
  dragBuddyTo,
  grabBuddy,
  moveBuddyTo,
  nearestEdge,
  nearestFree,
  releaseBuddy,
  spawnBuddy,
  stepBuddy,
  tapBuddy,
  type BuddyBounds,
  type BuddyState,
} from './buddyPhysics';

const BOUNDS: BuddyBounds = { minX: 40, maxX: 400, ceil: 600 };
const DT = 1 / 60;

/** 늘 같은 순서로 나오는 '무작위' 수(시험이 매번 같게). */
function seq(...values: number[]) {
  let i = 0;
  return () => values[i++ % values.length];
}

function run(s: BuddyState, seconds: number, rand = seq(0.5), bounds = BOUNDS, watch?: (s: BuddyState) => void) {
  for (let t = 0; t < seconds; t += DT) {
    stepBuddy(s, DT, bounds, rand);
    watch?.(s);
  }
  return s;
}

describe('돌아다니는 모찌의 움직임(buddyPhysics)', () => {
  it('처음에는 화면 위쪽에서 떨어져 바닥에 내려앉고 멈춰 쉰다', () => {
    const s = spawnBuddy(BOUNDS, seq(0.5));
    expect(s.mode).toBe('air');
    expect(s.y).toBeGreaterThan(0);
    let landed = false;
    run(s, 1.6, seq(0.99), BOUNDS, (st) => {
      if (st.mode === 'idle') landed = true;
    });
    expect(landed).toBe(true);
    expect(s.y).toBe(0);
  });

  it('세게 떨어지면 한 번 튀었다가 내려앉고, 땅에 닿으면 납작해진다', () => {
    const s = spawnBuddy(BOUNDS, seq(0.5));
    let bounced = false;
    let flattest = 0;
    run(s, 2, seq(0.99), BOUNDS, (st) => {
      if (st.mode === 'air' && st.vy > 0) bounced = true;
      flattest = Math.max(flattest, buddyPose(st).scaleX);
    });
    expect(bounced).toBe(true);
    expect(flattest).toBeGreaterThan(1.1);
  });

  it('쉬다가 다른 곳으로 통통 뛰어가서 멈춘다(목표를 지나치지 않는다)', () => {
    const s = spawnBuddy(BOUNDS, seq(0.1));
    s.y = 0;
    s.vy = 0;
    s.mode = 'idle';
    s.timer = 0;
    // 0.9 → 제자리 뜀이 아니라 걷기, 그다음 목표는 범위의 90% 자리.
    const rand = seq(0.9, 0.9, 0.9, 0.9, 0.5, 0.5);
    const start = s.x;
    let hops = 0;
    let wasAir = false;
    let walkTarget: number | null = null;
    run(s, 6, rand, BOUNDS, (st) => {
      if (walkTarget === null && st.mode === 'walk') walkTarget = st.targetX;
      if (st.mode === 'air' && !wasAir) hops++;
      wasAir = st.mode === 'air';
    });
    expect(walkTarget).not.toBeNull();
    expect(walkTarget!).toBeGreaterThan(start + 80);
    expect(hops).toBeGreaterThan(3);
    // 걷기를 마친 뒤 목표 근처에서 쉬고 있거나, 다음 할 일로 넘어갔다.
    expect(s.x).toBeGreaterThan(start + 80);
    expect(s.x).toBeLessThanOrEqual(BOUNDS.maxX);
  });

  it('오래 놔둬도 벽과 천장 밖으로 나가지 않는다', () => {
    const s = spawnBuddy(BOUNDS);
    let min = Infinity;
    let max = -Infinity;
    let top = 0;
    run(s, 30, Math.random, BOUNDS, (st) => {
      min = Math.min(min, st.x);
      max = Math.max(max, st.x);
      top = Math.max(top, st.y);
      expect(st.y).toBeGreaterThanOrEqual(0);
    });
    expect(min).toBeGreaterThanOrEqual(BOUNDS.minX);
    expect(max).toBeLessThanOrEqual(BOUNDS.maxX);
    expect(top).toBeLessThanOrEqual(BOUNDS.ceil);
  });

  it('누르면 한 번 웅크렸다가(예비 동작) 폴짝 뛰고(약 140px) 웃는다, 공중에서 한 번 더 누르면 더 올라간다', () => {
    const s = run(spawnBuddy(BOUNDS, seq(0.5)), 2, seq(0.99));
    tapBuddy(s, seq(0.5));
    expect(s.mode).toBe('crouch');
    expect(buddyPose(s).eyes).toBe('happy');
    run(s, 0.12, seq(0.99));
    expect(s.mode).toBe('air');
    let peak = 0;
    run(s, 0.6, seq(0.99), BOUNDS, (st) => (peak = Math.max(peak, st.y)));
    expect(peak).toBeGreaterThan(120);
    expect(peak).toBeLessThan(160);

    const t = run(spawnBuddy(BOUNDS, seq(0.5)), 2, seq(0.99));
    tapBuddy(t, seq(0.5));
    run(t, 0.2);
    const vyBefore = t.vy;
    tapBuddy(t, seq(0.5));
    expect(t.vy).toBeGreaterThan(vyBefore);
  });

  it('집어 들면 손가락을 따라가고(범위 안), 놓으면 그 속도로 날아갔다가 떨어진다', () => {
    const s = run(spawnBuddy(BOUNDS, seq(0.5)), 2, seq(0.99));
    grabBuddy(s);
    expect(s.mode).toBe('drag');
    dragBuddyTo(s, 9999, 300, 500, BOUNDS);
    expect(s.x).toBe(BOUNDS.maxX);
    expect(s.y).toBe(300);
    // 드는 동안에는 떨어지지 않는다.
    run(s, 0.5);
    expect(s.y).toBe(300);
    expect(buddyPose(s).scaleY).toBeGreaterThan(1);

    releaseBuddy(s, -99999, 400);
    expect(s.mode).toBe('air');
    expect(s.vx).toBe(-MAX_THROW);
    expect(s.vy).toBe(400);
    run(s, 3, seq(0.99));
    expect(s.y).toBe(0);
    expect(s.x).toBeLessThan(BOUNDS.maxX);
  });

  it('들고 있는 동안 누른 것은 무시하고, 화면이 바뀌면 땅 위에서만 작게 뛴다', () => {
    const s = run(spawnBuddy(BOUNDS, seq(0.5)), 2, seq(0.99));
    grabBuddy(s);
    tapBuddy(s);
    expect(s.mode).toBe('drag');
    cheerBuddy(s);
    expect(s.mode).toBe('drag');

    const t = run(spawnBuddy(BOUNDS, seq(0.5)), 2, seq(0.99));
    cheerBuddy(t);
    expect(t.mode).toBe('air');
    const h = (t.vy * t.vy) / (2 * GRAVITY);
    expect(h).toBeLessThan(60);
  });

  it('화면이 좁아져 벽 밖에 있게 되면 안으로 들어온다, 시간이 크게 벌어져도 한 번에 날아가지 않는다', () => {
    const s = run(spawnBuddy(BOUNDS, seq(0.9)), 2, seq(0.99));
    const narrow = { minX: 40, maxX: 120, ceil: 600 };
    stepBuddy(s, DT, narrow, seq(0.99));
    expect(s.x).toBeLessThanOrEqual(120);

    tapBuddy(s, seq(0.5));
    run(s, 0.12, seq(0.99), narrow);
    const y0 = s.y;
    stepBuddy(s, 10, narrow, seq(0.99)); // 다른 탭에 10초 다녀옴
    expect(s.y - y0).toBeLessThan(50);
  });

  it('쉬는 동안 숨 쉬듯 말랑거리고, 높이 뜰수록 그림자가 작고 옅다', () => {
    const s = run(spawnBuddy(BOUNDS, seq(0.5)), 2, seq(0.99));
    s.timer = 100;
    s.squash = 0;
    s.squashV = 0;
    const heights = new Set<number>();
    run(s, 2.6, seq(0.99), BOUNDS, (st) => heights.add(Math.round(buddyPose(st).scaleY * 1000)));
    expect(heights.size).toBeGreaterThan(10);

    const low = buddyPose({ ...s, y: 0 });
    const high = buddyPose({ ...s, mode: 'air', y: 200 });
    expect(high.shadowScale).toBeLessThan(low.shadowScale);
    expect(high.shadowOpacity).toBeLessThan(low.shadowOpacity);
  });

  it('걸어갈 곳은 아래에 버튼이 없는 자리로 고르고, 그런 곳이 없으면 가장자리로 간다', () => {
    // 왼쪽 절반(x < 220)에는 버튼이 있다.
    const free = (x: number) => x >= 220;
    const s = run(spawnBuddy(BOUNDS, seq(0.05)), 2, seq(0.99));
    s.timer = 0;
    // 걷기를 고르고(0.9), 첫 후보 0.2(버튼 위) → 다음 후보 0.8(빈 곳).
    stepBuddy(s, DT, BOUNDS, seq(0.9, 0.2, 0.8), free);
    expect(s.mode).toBe('walk');
    expect(s.targetX).toBeGreaterThanOrEqual(220);

    const t = run(spawnBuddy(BOUNDS, seq(0.05)), 2, seq(0.99));
    t.timer = 0;
    stepBuddy(t, DT, BOUNDS, seq(0.9, 0.8), () => false);
    expect(t.mode).toBe('walk');
    expect(t.targetX).toBe(BOUNDS.maxX);
    expect(nearestEdge(100, BOUNDS)).toBe(BOUNDS.minX);
    expect(nearestEdge(300, BOUNDS)).toBe(BOUNDS.maxX);
  });

  it('버튼 위에 서 있으면 가장 가까운 빈 자리를 찾아 비켜 간다', () => {
    const free = (x: number) => x < 100 || x > 300;
    expect(nearestFree(150, BOUNDS, free, 16)).toBe(86);
    expect(nearestFree(260, BOUNDS, free, 16)).toBe(308);
    expect(nearestFree(50, BOUNDS, free)).toBe(50);
    expect(nearestFree(200, BOUNDS, () => false)).toBeNull();

    const s = run(spawnBuddy(BOUNDS, seq(0.5)), 2, seq(0.99));
    s.timer = 100;
    moveBuddyTo(s, 86);
    expect(s.mode).toBe('walk');
    run(s, 4, seq(0.99));
    expect(Math.abs(s.x - 86)).toBeLessThan(6);
    // 걷거나 떠 있는 동안에는 새로 정하지 않는다.
    tapBuddy(s, seq(0.5));
    moveBuddyTo(s, 300);
    expect(s.targetX).not.toBe(300);
  });

  it('눈을 깜빡이고, 걸을 때는 가는 쪽을, 들리면 아래를 쳐다본다', () => {
    const s = run(spawnBuddy(BOUNDS, seq(0.5)), 2, seq(0.99));
    s.timer = 100;
    const seen = new Set<string>();
    run(s, 8, seq(0.99), BOUNDS, (st) => seen.add(buddyPose(st).eyes));
    expect(seen.has('closed')).toBe(true); // 깜빡임
    expect(seen.has('open')).toBe(true);

    moveBuddyTo(s, BOUNDS.minX);
    run(s, 0.5, seq(0.99));
    expect(buddyPose(s).lookX).toBeLessThan(-0.5);

    grabBuddy(s);
    run(s, 0.5);
    expect(buddyPose(s).lookY).toBeGreaterThan(0.5);
  });

  it('세게 던져 떨어지면 별이 돌며 어지러워하고, 살살 놓으면 괜찮다', () => {
    const s = run(spawnBuddy(BOUNDS, seq(0.5)), 2, seq(0.99));
    grabBuddy(s);
    dragBuddyTo(s, 200, 500, 0, BOUNDS);
    releaseBuddy(s, 1200, 900);
    let dizzy = false;
    run(s, 2, seq(0.99), BOUNDS, (st) => (dizzy ||= buddyPose(st).stars && buddyPose(st).eyes === 'dizzy'));
    expect(dizzy).toBe(true);
    run(s, 3, seq(0.99));
    expect(buddyPose(s).stars).toBe(false);

    const t = run(spawnBuddy(BOUNDS, seq(0.5)), 2, seq(0.99));
    grabBuddy(t);
    dragBuddyTo(t, 200, 30, 0, BOUNDS);
    releaseBuddy(t, 0, 0);
    let dz = false;
    run(t, 2, seq(0.99), BOUNDS, (st) => (dz ||= st.dizzy > 0));
    expect(dz).toBe(false);
  });

  it('땅에 닿은 세기를 남겨 먼지를 피우게 한다', () => {
    const s = spawnBuddy(BOUNDS, seq(0.5));
    let maxImpact = 0;
    run(s, 1.5, seq(0.99), BOUNDS, (st) => {
      maxImpact = Math.max(maxImpact, st.impact);
      st.impact = 0; // 그리는 쪽처럼 읽고 비운다
    });
    expect(maxImpact).toBeGreaterThan(1000);
  });

  it('가끔 졸다가(눈 감고 깊게 숨쉼) 누르면 놀라 깨고, 춤출 때는 웃으며 좌우로 흔든다', () => {
    const s = run(spawnBuddy(BOUNDS, seq(0.5)), 2, seq(0.99));
    s.timer = 0;
    stepBuddy(s, DT, BOUNDS, seq(0.03, 0.5));
    expect(s.mode).toBe('sleep');
    run(s, 1, seq(0.99));
    expect(buddyPose(s)).toMatchObject({ eyes: 'closed', sleeping: true });
    tapBuddy(s);
    expect(s.woke).toBe(true);
    expect(s.mode).toBe('air');

    const d = run(spawnBuddy(BOUNDS, seq(0.5)), 2, seq(0.99));
    d.timer = 0;
    stepBuddy(d, DT, BOUNDS, seq(0.1));
    expect(d.mode).toBe('dance');
    let minLean = 0;
    let maxLean = 0;
    run(d, 1.5, seq(0.99), BOUNDS, (st) => {
      minLean = Math.min(minLean, st.lean);
      maxLean = Math.max(maxLean, st.lean);
      expect(buddyPose(st).eyes).toBe('happy');
    });
    expect(minLean).toBeLessThan(-5);
    expect(maxLean).toBeGreaterThan(5);
  });
});
