import { describe, expect, it, vi } from 'vitest';
import { buddy } from './buddyBus';
import { PEEK_TIME, buddyPose, peekHidden, signalBuddy, spawnBuddy, stepBuddy, type BuddyBounds, type BuddyState } from './buddyPhysics';

const BOUNDS: BuddyBounds = { minX: 40, maxX: 400, ceil: 600 };
const DT = 1 / 60;
const still = () => 0.99; // 쉬는 동안 다른 일을 고르지 않게(늘 걸어가기 쪽)

function settle() {
  const s = spawnBuddy(BOUNDS, () => 0.5);
  for (let t = 0; t < 2; t += DT) stepBuddy(s, DT, BOUNDS, still);
  s.timer = 99; // 쉬는 채로 둔다
  return s;
}

function run(s: BuddyState, seconds: number, watch?: (s: BuddyState) => void) {
  for (let t = 0; t < seconds; t += DT) {
    stepBuddy(s, DT, BOUNDS, still);
    watch?.(s);
  }
}

describe('모찌 신호(buddyBus)', () => {
  it('emit은 듣는 모두에게 가고, on이 돌려준 함수로 그만 듣는다', () => {
    const fn = vi.fn();
    const off = buddy.on(fn);
    buddy.emit('cheer');
    off();
    buddy.emit('wave');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('cheer');
  });

  it('듣는 쪽이 실패해도 다른 쪽과 부른 화면은 그대로다', () => {
    const ok = vi.fn();
    const off1 = buddy.on(() => {
      throw new Error('x');
    });
    const off2 = buddy.on(ok);
    expect(() => buddy.emit('celebrate')).not.toThrow();
    expect(ok).toHaveBeenCalled();
    off1();
    off2();
  });
});

describe('신호에 맞춘 모찌 동작(signalBuddy)', () => {
  it('celebrate: 웅크렸다가 크게 뛰고 웃는다', () => {
    const s = settle();
    signalBuddy(s, 'celebrate', BOUNDS);
    let top = 0;
    run(s, 1.2, (st) => (top = Math.max(top, st.y)));
    expect(top).toBeGreaterThan(110);
  });

  it('cheer: 작게 두 번 뛴다', () => {
    const s = settle();
    signalBuddy(s, 'cheer', BOUNDS);
    let lands = 0;
    let wasUp = false;
    run(s, 1.6, (st) => {
      if (st.y > 5) wasUp = true;
      if (wasUp && st.y === 0) {
        lands++;
        wasUp = false;
      }
    });
    expect(lands).toBe(2);
  });

  it('wave: 손을 흔들며(waving) 좌우로 몸을 흔들고 웃다가 쉰다', () => {
    const s = settle();
    signalBuddy(s, 'wave', BOUNDS);
    expect(buddyPose(s)).toMatchObject({ waving: true, eyes: 'happy' });
    run(s, 2);
    expect(buddyPose(s).waving).toBe(false);
  });

  it('think: 위를 올려다보며 점 세 개(thinking)', () => {
    const s = settle();
    signalBuddy(s, 'think', BOUNDS);
    run(s, 0.6);
    const p = buddyPose(s);
    expect(p.thinking).toBe(true);
    expect(p.lookY).toBeLessThan(-0.5);
  });

  it('peek: 가까운 가장자리로 가서 숨었다가 빼꼼 내밀고, 안쪽을 쳐다본 뒤 다시 나온다', () => {
    const s = settle();
    s.x = 120; // 왼쪽이 더 가깝다
    signalBuddy(s, 'peek', BOUNDS);
    let peeked = false;
    let maxHidden = 0;
    run(s, 8, (st) => {
      const p = buddyPose(st);
      if (p.peeking) {
        peeked = true;
        expect(st.x).toBeLessThan(BOUNDS.minX + 6);
        maxHidden = Math.max(maxHidden, -p.peekShift);
      }
    });
    expect(peeked).toBe(true);
    expect(maxHidden).toBeGreaterThan(0.95); // 한 번은 다 숨는다
    expect(s.mode).not.toBe('peek');
    expect(s.peekSide).toBe(0);
  });

  it('엿보기 모양: 숨기 → 숨어 있기 → 반쯤 → 다 나옴', () => {
    expect(peekHidden(0)).toBe(0);
    expect(peekHidden(0.8)).toBe(1);
    expect(peekHidden(2)).toBeCloseTo(0.42, 2);
    expect(peekHidden(PEEK_TIME)).toBeCloseTo(0, 5);
  });

  it('공중에서 받은 신호(wave·think·sleep)는 내려앉은 뒤에 한다', () => {
    const s = spawnBuddy(BOUNDS, () => 0.5); // 떨어지는 중
    signalBuddy(s, 'sleep', BOUNDS);
    expect(s.mode).toBe('air');
    run(s, 1.5);
    expect(s.mode).toBe('sleep');
  });

  it('밤(sleepy)에는 쉬다가 고르는 일 가운데 졸기가 더 많다', () => {
    const s = settle();
    s.sleepy = true;
    s.timer = 0;
    stepBuddy(s, DT, BOUNDS, () => 0.15);
    expect(s.mode).toBe('sleep');
    const day = settle();
    day.timer = 0;
    stepBuddy(day, DT, BOUNDS, () => 0.15);
    expect(day.mode).not.toBe('sleep');
  });

  it('들고 있는 동안에는 신호를 무시한다', () => {
    const s = settle();
    s.mode = 'drag';
    signalBuddy(s, 'celebrate', BOUNDS);
    expect(s.mode).toBe('drag');
  });
});
