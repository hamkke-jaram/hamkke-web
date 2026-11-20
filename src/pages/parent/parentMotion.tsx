import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Delivery } from '../../api/types';
import { buddy, type BuddyKind } from '../../components/buddyBus';
import * as coachingArt from '../../components/coachingArt';
import type { Pose } from '../../components/coachingArt';
import { useMotionOn } from '../../motion';

/*
 * 부모 화면의 움직임 도우미(T-020). 모양은 parent-motion.css에 있다.
 *
 * 지키는 것
 * - 화면 설정 '움직이는 캐릭터'가 꺼져 있거나 기기의 '동작 줄이기'를 따라 꺼져 있으면(<html data-motion="off">)
 *   움직이지 않고 바로 마지막 모습을 보인다. 숫자는 처음부터 최종 값, 하트는 띄우지 않는다.
 * - 화면을 돌아다니는 모찌(buddy)는 보호자가 한 일(기록 저장, '해봤어요')에만 반응한다.
 *   기록 숫자·추이·코칭 내용에 따라 기뻐하거나 슬퍼하지 않는다(평가로 읽히지 않게).
 */

export type BuddyCue = BuddyKind;

/** 돌아다니는 모찌에게 신호를 보낸다. 모찌가 꺼져 있거나 없으면 아무 일도 일어나지 않는다. */
export function cue(kind: BuddyCue) {
  try {
    buddy.emit(kind);
  } catch {
    /* 꾸밈이라 실패해도 화면 동작에는 영향이 없다 */
  }
}

/**
 * 숫자가 0에서 target까지 올라가는 모습(꾸밈). 움직임이 꺼져 있으면 처음부터 target.
 * 화면 낭독기에는 최종 값을 따로 읽히게(sr-only) 쓰는 쪽에서 둔다. 탭이 가려져 그림이 멈춰도 제 시간에 최종 값이 된다.
 */
export function useCountUp(target: number, ms = 700): number {
  const on = useMotionOn();
  const safe = Number.isFinite(target) ? target : 0;
  const [shown, setShown] = useState(on ? 0 : safe);
  const last = useRef(on ? 0 : safe);
  useEffect(() => {
    if (!on || safe <= 0) {
      last.current = safe;
      setShown(safe);
      return;
    }
    const from = last.current === safe ? 0 : last.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const v = from + (safe - from) * (1 - Math.pow(1 - k, 3));
      last.current = v;
      setShown(k >= 1 ? safe : Math.round(v));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    const done = window.setTimeout(() => {
      cancelAnimationFrame(raf);
      last.current = safe;
      setShown(safe);
    }, ms + 120);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(done);
    };
  }, [safe, on, ms]);
  return shown;
}

/**
 * 코칭 모찌 그림에 붙일 움직임 클래스(숨쉬기·포즈별 몸짓·등장·누르면 말랑). 움직임 자체는 공용이다:
 * coachingArt.ts의 artMotionFor(pose)와 components 쪽 css(fe-2). 설정이 꺼져 있으면 그쪽 css가 정지 그림으로 둔다.
 * artMotionFor가 아직 없는 판에서도 화면이 깨지지 않게, 없으면 빈 이름을 돌려준다.
 */
export function artClass(pose: Pose): string {
  const fn = (coachingArt as { artMotionFor?: (p: Pose) => string }).artMotionFor;
  return typeof fn === 'function' ? fn(pose) : '';
}

const HEARTS = 5;

/** 하트 몇 개가 떠올랐다 사라진다(꾸밈, aria-hidden). 움직임이 꺼져 있으면 그리지 않는다. */
function HeartBurst({ onEnd }: { onEnd: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onEnd, 1300);
    return () => window.clearTimeout(t);
  }, [onEnd]);
  return (
    <span className="p-hearts" aria-hidden="true">
      {Array.from({ length: HEARTS }, (_, i) => (
        <span key={i} className="p-heart" style={{ ['--i' as string]: i }}>
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path
              fill="currentColor"
              d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.1 4.3 2.4h2c.7-1.3 2.2-2.4 4.3-2.4 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z"
            />
          </svg>
        </span>
      ))}
    </span>
  );
}

/**
 * '오늘 해봤어요'를 막 눌렀을 때(전달 항목의 triedAt이 비어 있다가 채워졌을 때) 하트를 띄우고 모찌에게 'celebrate'를 보낸다.
 * 카드 내용·기록 숫자와는 상관없이 보호자가 한 일에만 반응한다.
 * 돌려주는 onUpdated를 TriableCard에 넘기고, hearts를 하트가 떠오를 자리(position: relative인 상자) 안에 둔다.
 */
export function useTriedCheer(
  delivery: Delivery,
  onUpdated?: (d: Delivery) => void,
): { onUpdated: (d: Delivery) => void; hearts: ReactNode } {
  const on = useMotionOn();
  const [burst, setBurst] = useState(0);
  const wasTried = useRef(delivery.triedAt != null);
  useEffect(() => {
    wasTried.current = delivery.triedAt != null;
  }, [delivery.triedAt]);
  const end = useCallback(() => setBurst(0), []);
  const wrapped = useCallback(
    (d: Delivery) => {
      if (d.triedAt && !wasTried.current) {
        cue('celebrate');
        if (on) setBurst((n) => n + 1);
      }
      wasTried.current = d.triedAt != null;
      onUpdated?.(d);
    },
    [on, onUpdated],
  );
  return { onUpdated: wrapped, hearts: burst > 0 ? <HeartBurst key={burst} onEnd={end} /> : null };
}

/** 같은 값으로는 한 번만 신호를 보낸다(다시 그려져도 되풀이하지 않게). 값이 null이면 보내지 않는다. */
export function useCueOnce(kind: BuddyCue, key: string | number | null | undefined) {
  const sent = useRef<string | number | null>(null);
  useEffect(() => {
    if (key == null || sent.current === key) return;
    sent.current = key;
    cue(kind);
  }, [kind, key]);
}
