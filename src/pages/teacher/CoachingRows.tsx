import { Link } from 'react-router-dom';
import type { Delivery } from '../../api/types';
import { poseFor, poseSrc, type Pose } from '../../components/coachingArt';
import { firstSentence } from '../parent/coachText';
import { ChevronIcon } from '../parent/icons';
import { artClass } from '../parent/parentMotion';
import { kstDateKey } from '../parent/week';

export type CoachPick = { selectedId: number | null; onPick: (delivery: Delivery) => void };

export function sharedDayLabel(iso: string, now = Date.now()) {
  const date = kstDateKey(Date.parse(iso));
  if (!date) return '';
  const [, month, day] = date.split('-');
  const prefix = date === kstDateKey(now) ? '오늘 · ' : date === kstDateKey(now - 86_400_000) ? '어제 · ' : '';
  return `${prefix}${Number(month)}월 ${Number(day)}일`;
}

function RowContent({ pose, label, title, line, selected }: {
  pose: Pose; label: string; title: string; line: string; selected?: boolean;
}) {
  return <>
    <span className="coach-row-art">
      <img className={artClass(pose) || undefined} src={poseSrc(pose)} alt="" width={64} height={64} loading="lazy" decoding="async" />
    </span>
    <span className="coach-row-text">
      <span className="coach-row-date">{label}</span>
      <strong>{title}</strong>
      <span className="coach-row-line">{line}</span>
    </span>
    {selected ? (
      <span className="coach-row-check" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22">
          <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    ) : <ChevronIcon size={20} />}
  </>;
}

export function CoachingRows({ childId, rows, pick }: {
  childId: number;
  rows: Delivery[];
  pick?: CoachPick;
}) {
  return (
    <ul className="coach-rows">
      {rows.map(d => {
        const selected = d.id === pick?.selectedId;
        const content = <RowContent pose={poseFor(d.card)} label={sharedDayLabel(d.deliveredAt)}
          title={d.card.title} line={firstSentence(d.card.body)} selected={selected} />;
        return (
          <li key={d.id} data-delivery-id={d.id}>
            {pick ? (
              <button type="button" className={`coach-row th-pick${selected ? ' picked' : ''}`}
                aria-pressed={selected} onClick={() => pick.onPick(d)}>{content}</button>
            ) : <Link to={`/t/children/${childId}/coaching/${d.id}`} className="coach-row">{content}</Link>}
          </li>
        );
      })}
    </ul>
  );
}
