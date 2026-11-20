import { Link } from 'react-router-dom';
import type { DaycareRecommendation, Delivery } from '../../api/types';
import { EvidenceDetails } from '../../ai/EvidenceDetails';
import { useAuth } from '../../auth/AuthContext';
import { isDemoWorkspaceChild } from '../../auth/demoLogin';
import { poseFor, poseSrc, type Pose } from '../../components/coachingArt';
import { firstSentence } from '../parent/coachText';
import { ChevronIcon } from '../parent/icons';
import { artClass } from '../parent/parentMotion';
import { kstDateKey } from '../parent/week';

export type CoachPick = { selectedId: number | null; onPick: (delivery: Delivery) => void };

export function CoachingReviewLinks({ childId }: { childId: number }) {
  const { user } = useAuth();
  const showExample = user?.role === 'TEACHER' && isDemoWorkspaceChild(user, childId);
  return <div className="coaching-review-links">
    <Link data-demo="th-coach-review-inbox" to={`/t/children/${childId}/ai-reviews`}>가정 영상 검토함 열기</Link>
    {showExample && <Link data-demo="th-coach-review-example" to={`/t/children/${childId}/coaching/example`}>
      예시 영상으로 검토 과정 체험하기
    </Link>}
  </div>;
}

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

export function CoachingRows({ childId, rows, recommendation, pick }: {
  childId: number;
  rows: Delivery[];
  recommendation?: DaycareRecommendation | null;
  pick?: CoachPick;
}) {
  // 최신순 목록에서 근거 카드의 가장 최근 전달 한 건만 추천 줄로 옮긴다.
  const source = recommendation && rows.find(d => d.card.code === recommendation.sourceCode);
  const sourcePath = (id: number) => `/t/children/${childId}/coaching/${id}`;
  return (
    <ul className="coach-rows">
      {recommendation && (
        <li className="daycare-coaching" data-demo="th-daycare-coaching" data-delivery-id={source?.id}>
          <details>
            <summary className="coach-row">
              <RowContent pose={poseFor(source?.card ?? { code: recommendation.sourceCode })} label="AI 추천 · 어린이집"
                title={recommendation.title} line={firstSentence(recommendation.action)} />
            </summary>
            <div className="daycare-details">
              <p>{recommendation.action}</p>
              <EvidenceDetails evidence={recommendation.evidence} />
              <p className="daycare-source">
                바탕이 된 가정 코칭{' '}
                {source ? <Link to={sourcePath(source.id)}>{source.card.title}</Link> : recommendation.sourceTitle}
              </p>
              <div className="daycare-review">
                <p>보호자가 영상을 기록하고 관찰 기록을 공유하면 선생님이 AI의 관찰 내용과 추천 근거를 확인해요. 관찰 문장을 수정하고 전달할 대응을 골라 보호자에게 보낼 수 있어요.</p>
                <CoachingReviewLinks childId={childId} />
              </div>
            </div>
          </details>
        </li>
      )}
      {rows.filter(d => d.id !== source?.id).map(d => {
        const selected = d.id === pick?.selectedId;
        const content = <RowContent pose={poseFor(d.card)} label={sharedDayLabel(d.deliveredAt)}
          title={d.card.title} line={firstSentence(d.card.body)} selected={selected} />;
        return (
          <li key={d.id} data-delivery-id={d.id}>
            {pick ? (
              <button type="button" className={`coach-row th-pick${selected ? ' picked' : ''}`}
                aria-pressed={selected} onClick={() => pick.onPick(d)}>{content}</button>
            ) : <Link to={sourcePath(d.id)} className="coach-row">{content}</Link>}
          </li>
        );
      })}
    </ul>
  );
}
