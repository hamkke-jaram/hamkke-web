import { useId, useRef, useState, type UIEvent } from 'react';
import type { Delivery } from '../../api/types';
import TriableCard from '../../components/TriableCard';
import { poseFor, poseSrc, type Pose } from '../../components/coachingArt';
import { coachDateLabel, firstSentence } from './coachText';
import { ArrowIcon } from './icons';

interface CardProps {
  childId: number;
  delivery: Delivery;
  onUpdated: (d: Delivery) => void;
  onGone: (d: Delivery) => void;
}

/** 한 번 못 불러온 포즈 그림은 이 탭에서 다시 그리지 않는다(자리가 잡혔다 사라지며 카드가 흔들리지 않게). */
const failedArt = new Set<Pose>();

/**
 * 아이 홈 '오늘의 코칭'의 카드 한 장(시안: 받은 날, 큰 제목, 한 줄, '놀이 살펴보기 →', 오른쪽 그림).
 *
 * 접힌 모습에는 제목과 본문의 첫 문장만 보인다. '놀이 살펴보기'를 펼치면 공통 코칭 카드(TriableCard)가 그대로 나와
 * 본문 전체, '오늘 해봤어요', 근거·출처·작성·검수를 모두 보여 준다(카드는 늘 출처와 함께 전한다).
 * 펼침은 <details>라서 시연이 그 안의 자리(coach-evidence·coach-tried)를 가리키면 저절로 열린다.
 */
function HomeCoachCard({ childId, delivery, onUpdated, onGone }: CardProps) {
  const titleId = useId();
  const { card } = delivery;
  const pose = poseFor(card);
  const [, rerender] = useState(0);
  const date = coachDateLabel(delivery.deliveredAt);
  const line = firstSentence(card.body);
  const showArt = !failedArt.has(pose);
  return (
    <article className={showArt ? 'hc-card has-art' : 'hc-card'} aria-labelledby={titleId}>
      <div className="hc-text">
        {date && <p className="hc-date">{date}</p>}
        <h3 id={titleId} className="hc-title">
          {card.title}
        </h3>
        {line && <p className="hc-line">{line}</p>}
      </div>
      {showArt && (
        <img
          className="hc-art"
          src={poseSrc(pose)}
          alt=""
          width={132}
          height={132}
          decoding="async"
          onError={() => {
            failedArt.add(pose);
            rerender((n) => n + 1);
          }}
        />
      )}
      <details className="hc-more">
        <summary data-demo="coach-more">
          놀이 살펴보기
          <ArrowIcon size={18} />
        </summary>
        <div className="hc-detail">
          <TriableCard childId={childId} delivery={delivery} onUpdated={onUpdated} onGone={onGone} />
        </div>
      </details>
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
  const many = deliveries.length > 1;

  function onScroll(e: UIEvent<HTMLUListElement>) {
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
      <ul className={many ? 'hc-rail many' : 'hc-rail'} onScroll={many ? onScroll : undefined}>
        {deliveries.map((d) => (
          <li key={d.id}>
            <HomeCoachCard childId={childId} delivery={d} onUpdated={onUpdated} onGone={onGone} />
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
