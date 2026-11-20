import { useEffect, useId, useRef, useState, type UIEvent } from 'react';
import { Link } from 'react-router-dom';
import type { Delivery } from '../../api/types';
import TriableCard from '../../components/TriableCard';
import { poseFor, poseSrc, type Pose } from '../../components/coachingArt';
import { coachDateLabel, firstSentence } from './coachText';
import { ArrowIcon } from './icons';
import { useMotionOn } from '../../motion';
import { artClass, useTriedCheer } from './parentMotion';

interface CardProps {
  childId: number;
  delivery: Delivery;
  /** 카드 바탕: 크림·보랏빛을 번갈아(Figma 홈). */
  tone: 'cream' | 'lavender';
  onUpdated: (d: Delivery) => void;
  onGone: (d: Delivery) => void;
}

/** 한 번 못 불러온 포즈 그림은 이 탭에서 다시 그리지 않는다(자리가 잡혔다 사라지며 카드가 흔들리지 않게). */
const failedArt = new Set<Pose>();

/**
 * 아이 홈 '오늘의 코칭'의 카드 한 장(Figma 2판: 받은 날 → 가운데 큰 모찌 그림 → 큰 제목 → 한 줄, 크림·보랏빛 바탕).
 *
 * 접힌 모습에는 제목과 본문의 첫 문장만 보인다. '놀이 살펴보기'를 펼치면 공통 코칭 카드(TriableCard)가 그대로 나와
 * 본문 전체, '오늘 해봤어요', 근거·출처·작성·검수를 모두 보여 준다(카드는 늘 출처와 함께 전한다).
 * 펼침은 <details>라서 시연이 그 안의 자리(coach-evidence·coach-tried)를 가리키면 저절로 열린다.
 */
function HomeCoachCard({ childId, delivery, tone, onUpdated, onGone }: CardProps) {
  const titleId = useId();
  const { card } = delivery;
  const pose = poseFor(card);
  const [, rerender] = useState(0);
  const date = coachDateLabel(delivery.deliveredAt);
  const line = firstSentence(card.body);
  const showArt = !failedArt.has(pose);
  // '오늘 해봤어요'를 누르면 하트가 떠오르고 돌아다니는 모찌가 기뻐한다(보호자가 한 일에만 반응한다).
  const cheer = useTriedCheer(delivery, onUpdated);
  return (
    <article className={`hc-card tone-${tone}${showArt ? ' has-art' : ''}`} aria-labelledby={titleId}>
      {date && <p className="hc-date">{date}</p>}
      {showArt && (
        <Link to={`/p/children/${childId}/coaching/${delivery.id}`} state={{ delivery }} className="hc-art-link" tabIndex={-1} aria-hidden="true">
        <img
          // 모찌 그림의 움직임(숨쉬기·포즈별 몸짓·등장·누르면 말랑)은 공용(coachingArt.ts artMotionFor, fe-2). 설정이 꺼져 있으면 정지 그림.
          className={`hc-art ${artClass(pose)}`.trim()}
          src={poseSrc(pose)}
          alt=""
          width={180}
          height={180}
          decoding="async"
          onError={() => {
            failedArt.add(pose);
            rerender((n) => n + 1);
          }}
        />
        </Link>
      )}
      <div className="hc-text">
        <h3 id={titleId} className="hc-title">
          {/* 제목을 누르면 '오늘의 코칭' 자세히 보기(Figma). 아래 '놀이 살펴보기'는 이 자리에서 펼쳐 본다. */}
          <Link to={`/p/children/${childId}/coaching/${delivery.id}`} state={{ delivery }} className="hc-title-link">
            {card.title}
          </Link>
        </h3>
        {line && <p className="hc-line">{line}</p>}
      </div>
      <details className="hc-more">
        <summary data-demo="coach-more">
          놀이 살펴보기
          <ArrowIcon size={18} />
        </summary>
        <div className="hc-detail">
          <TriableCard childId={childId} delivery={delivery} onUpdated={cheer.onUpdated} onGone={onGone} />
        </div>
      </details>
      {cheer.hearts}
    </article>
  );
}

interface Props {
  childId: number;
  /** 맨 앞이 가장 최근에 받은 카드. 한 장이면 넘기는 점 없이 한 장만 보인다. */
  deliveries: Delivery[];
  onUpdated: (d: Delivery) => void;
  onGone: (d: Delivery) => void;
}

/** 코칭 카드를 옆으로 넘겨 보는 줄 + 지금 몇 번째인지 알리는 점. */
export default function HomeCoaching({ childId, deliveries, onUpdated, onGone }: Props) {
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);
  const railRef = useRef<HTMLUListElement>(null);
  const frame = useRef(0);
  const many = deliveries.length > 1;
  const motionOn = useMotionOn();

  const settle = useRef(0);

  /**
   * 넘기는 동안 멈출 자리에서 벗어난 카드를 살짝 기울이고 작게 보인다(꾸밈, parent-motion.css).
   * 손을 떼고 멈추면(settled) 기울기는 풀고, 옆에 걸쳐 보이는 카드만 조금 작게 둔다.
   * 움직임이 꺼져 있으면 값을 지워 카드가 반듯하게 그대로 있다.
   */
  function paintTilt(settled = false) {
    frame.current = 0;
    const rail = railRef.current;
    if (!rail) return;
    // 카드는 줄의 왼쪽(scroll-padding 자리)에 맞춰 멈춘다. 그 자리에서 벗어난 만큼(카드 한 장 너비 = 1) 기운다.
    const railLeft = rail.getBoundingClientRect().left + (Number.parseFloat(getComputedStyle(rail).scrollPaddingLeft) || 0);
    for (const li of Array.from(rail.children) as HTMLElement[]) {
      const card = li.firstElementChild as HTMLElement | null;
      if (!card) continue;
      if (!motionOn) {
        card.style.removeProperty('--tilt');
        card.style.removeProperty('--shrink');
        continue;
      }
      const r = li.getBoundingClientRect();
      const d = Math.max(-1, Math.min(1, (r.left - railLeft) / Math.max(1, r.width)));
      card.style.setProperty('--tilt', settled ? '0' : (d * 3).toFixed(2));
      card.style.setProperty('--shrink', (Math.abs(d) * 0.06).toFixed(3));
    }
  }

  useEffect(() => {
    paintTilt(true);
    return () => {
      cancelAnimationFrame(frame.current);
      window.clearTimeout(settle.current);
    };
    // paintTilt는 렌더마다 새로 만들어지지만 읽는 값(motionOn·카드 수)은 아래 의존성에 있다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motionOn, deliveries.length]);

  function onScroll(e: UIEvent<HTMLUListElement>) {
    if (motionOn) {
      if (!frame.current) frame.current = requestAnimationFrame(() => paintTilt());
      window.clearTimeout(settle.current);
      settle.current = window.setTimeout(() => paintTilt(true), 140);
    }
    const rail = e.currentTarget;
    const first = rail.firstElementChild as HTMLElement | null;
    if (!first) return;
    const gap = Number.parseFloat(getComputedStyle(rail).columnGap) || 0;
    const step = first.offsetWidth + gap;
    if (step <= 0) return;
    const i = Math.min(deliveries.length - 1, Math.max(0, Math.round(rail.scrollLeft / step)));
    if (i === activeRef.current) return;
    activeRef.current = i;
    setActive(i);
    // 다른 카드로 넘어가면 펼쳐 둔 카드는 접는다(줄의 높이가 가장 긴 카드에 맞춰져 아래가 길게 비지 않게).
    Array.from(rail.children).forEach((li, n) => {
      if (n !== i) li.querySelectorAll<HTMLDetailsElement>('details[open]').forEach((d) => (d.open = false));
    });
  }

  return (
    <>
      <ul ref={railRef} className={many ? 'hc-rail many' : 'hc-rail'} onScroll={many ? onScroll : undefined}>
        {deliveries.map((d, i) => (
          // is-active: 스크롤 스냅으로 지금 멈춰 보이는 카드. 이 카드의 그림만 등장 움직임이 나온다.
          <li key={d.id} className={i === active ? 'is-active' : undefined}>
            <HomeCoachCard childId={childId} delivery={d} tone={i % 2 === 0 ? 'cream' : 'lavender'} onUpdated={onUpdated} onGone={onGone} />
          </li>
        ))}
      </ul>
      {many && (
        // 꾸밈 표시다. 카드는 모두 목록에 있어 화면 낭독기·키보드로 차례대로 읽힌다.
        <div className="hc-dots" aria-hidden="true">
          {deliveries.map((d, i) => (
            <span key={d.id} className={i === active ? 'on' : undefined} />
          ))}
        </div>
      )}
    </>
  );
}
