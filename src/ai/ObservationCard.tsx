import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../api/client';
import type { AiObservation } from '../api/types';
import { formatDate } from '../components/ui';
import { ADULT_RESPONSE_LABEL, CHILD_STATE_LABEL, SOURCE_LABEL, formatClock, labelsOf, peopleLabel } from './labels';
import { contextGuidance, guidanceOptionsFor } from './momentGuidance.mjs';
import { observationNeedsReview, PendingReview, ReviewedResult, type ReviewAccess } from './ReviewResult';
import './ai.css';

/** 화면 아래에 늘 붙이는 문구(명세 8장). */
export const AI_CAVEAT = 'AI가 화면을 보고 적은 기록이에요. 틀릴 수 있어요.';

const RESPONSE_LABELS = {
  WAIT: '잠시 기다려 보기',
  OFFER: '도움 제안하기',
  CHECK: '상황 먼저 확인하기',
  SAFETY: '먼저 안전 확보',
};

interface Props {
  observation: AiObservation;
  /** 'card'는 혼자 서는 카드, 'row'는 목록 안의 한 줄 */
  variant?: 'card' | 'row';
  /** 넘겨주면 '삭제' 버튼을 보여 준다. 한 번 더 확인한 뒤에 부른다. */
  onDelete?: () => Promise<void>;
  /** 연결한 영상에서 선택한 장면의 시작 시각(초)으로 이동한다. */
  onMomentSelect?: (seconds: number) => void;
  example?: boolean;
  childId?: number;
  teacher?: boolean;
  reviewAccess?: ReviewAccess;
}

/**
 * AI 관찰 기록 한 건. 요약 문장, 태그(모두 같은 중립색), 시각별 메모, 출처(가정/기관), 날짜를 보여 준다.
 * 아이를 평가하는 표시(점수·색 구분)는 두지 않는다.
 */
export default function ObservationCard({ observation: o, variant = 'card', onDelete, onMomentSelect, example = false, childId, teacher, reviewAccess }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ observationId: number; index: number } | null>(null);
  const busy = useRef(false);

  const childLabels = labelsOf(o.childStates, CHILD_STATE_LABEL);
  const adultLabels = labelsOf(o.adultResponses, ADULT_RESPONSE_LABEL);
  const moments = (o.moments ?? []).filter((m) => m && typeof m.note === 'string' && m.note.trim());
  const usesMomentExamples = example || o.source === 'INSTITUTION';
  const reviewedWorkflow = observationNeedsReview(o) && !example;
  const options = usesMomentExamples ? moments.map(moment => guidanceOptionsFor(moment.note)[0]) : [];
  const safetyIndex = options.findIndex(option => option.decision === 'SAFETY');
  const activeIndex = selection?.observationId === o.id && selection.index < moments.length
    ? selection.index : Math.max(safetyIndex, 0);
  const activeMoment = moments[activeIndex];
  const guidance = options[activeIndex] ?? contextGuidance;
  const people = peopleLabel(o.peopleCount);
  const source = SOURCE_LABEL[o.source] ?? '';
  const when = o.recordedAt || o.createdAt;

  async function remove() {
    if (!onDelete || busy.current) return;
    busy.current = true;
    setDeleting(true);
    setError(null);
    try {
      await onDelete();
    } catch (e) {
      setError(`지우지 못했어요. 잠시 후 다시 눌러 주세요. (${errorMessage(e)})`);
      setDeleting(false);
    } finally {
      busy.current = false;
    }
  }

  return (
    <article className={variant === 'card' ? 'card ai-obs' : 'ai-obs ai-obs-row'} aria-label={example ? '합성 영상 관찰 예시' : 'AI 관찰 기록'}>
      <div className="ai-obs-head">
        {example ? <span className="chip">관찰 예시</span> : source && <span className="chip">{source}에서 기록</span>}
        {o.authorName && <span className="muted">{o.authorName}</span>}
        {when && <span className="muted ai-obs-when">{formatDate(when)}</span>}
      </div>

      {reviewedWorkflow ? (
        o.reviewStatus === 'PUBLISHED' && o.publishedGuidance ? (
          <ReviewedResult guidance={o.publishedGuidance} />
        ) : teacher && childId ? (
          <Link className="btn secondary block" to={`/t/children/${childId}/ai-reviews/${o.id}`}>관찰 내용 검토하기</Link>
        ) : <PendingReview childId={childId} access={reviewAccess} />
      ) : <>
      {o.summary ? (
        <p className="ai-obs-summary">{o.summary}</p>
      ) : (
        <p className="ai-obs-summary muted">이번에는 요약 문장 없이 본 모습만 적었어요.</p>
      )}

      {childLabels.length > 0 && (
        <div className="ai-tag-group">
          <p className="ai-tag-title">아이 모습</p>
          <ul className="ai-chips">
            {childLabels.map((l) => (
              <li key={l} className="chip">
                {l}
              </li>
            ))}
          </ul>
        </div>
      )}

      {adultLabels.length > 0 && (
        <div className="ai-tag-group">
          <p className="ai-tag-title">어른 반응</p>
          <ul className="ai-chips">
            {adultLabels.map((l) => (
              <li key={l} className="chip">
                {l}
              </li>
            ))}
          </ul>
        </div>
      )}

      <section className="ai-response" aria-label="장면에 맞는 대응 예시">
        <h3>{usesMomentExamples ? '어떻게 반응하면 좋을까요?' : '시각별 관찰 메모'}</h3>
        {usesMomentExamples && moments.length > 1 && <p className="ai-response-tip">장면을 고르면 그때 해 볼 수 있는 행동이 나와요.</p>}
        {moments.length > 0 && (
          <ul className="ai-moments" aria-label="시각별 메모">
            {moments.map((m, i) => (
              <li key={`${m.t}-${i}`}>
                {(usesMomentExamples && moments.length > 1) || onMomentSelect ? (
                  <button type="button" className="ai-moment" aria-pressed={i === activeIndex} onClick={() => {
                    setSelection({ observationId: o.id, index: i });
                    onMomentSelect?.(m.t);
                  }}>
                    <span className="ai-time">{formatClock(m.t)}</span>
                    <span>{m.note}{options[i]?.decision === 'SAFETY' && <strong className="ai-moment-safety">먼저 안전 확보</strong>}</span>
                  </button>
                ) : (
                  <div className="ai-moment">
                    <span className="ai-time">{formatClock(m.t)}</span>
                    <span>{m.note}</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {usesMomentExamples && <div className="ai-response-plan" aria-live="polite" aria-atomic="true">
          <p className="ai-response-title">
            {activeMoment && <span className="ai-time">{formatClock(activeMoment.t)} · </span>}
            {RESPONSE_LABELS[guidance.decision]}
          </p>
          {!activeMoment && <p>시각별 메모가 없어 어떤 도움이 맞을지 아직 알기 어려워요.</p>}
          <p>{guidance.action}</p>
          <p className="ai-response-follow"><strong>다음에 볼 점</strong> {guidance.watchFor}</p>
        </div>}
        {!usesMomentExamples && !moments.length && <p>저장된 시각별 메모가 없어요.</p>}
      </section>
      </>}

      <p className="muted ai-caveat">
        {example ? '체험을 위해 합성 영상의 장면에 맞춰 작성한 예시예요.' : AI_CAVEAT}
        {!reviewedWorkflow && people && ` 화면에 보인 사람: ${people}.`}
      </p>

      {onDelete && (
        <div className="ai-obs-actions">
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {confirming ? (
            <div className="ai-confirm" role="group" aria-label="관찰 기록 삭제 확인">
              <p>
                이 관찰 기록을 지울까요? 지우면 되돌릴 수 없어요.
                {o.source === 'HOME' && !reviewedWorkflow && ' 이 기록으로 받은 코칭 카드도 함께 지워져요.'}
              </p>
              <div className="row">
                <button
                  type="button"
                  className="btn secondary ai-tap"
                  style={{ flex: 1 }}
                  disabled={deleting}
                  data-demo="ai-obs-delete-cancel"
                  onClick={() => setConfirming(false)}
                >
                  그대로 두기
                </button>
                <button
                  type="button"
                  className="btn danger ai-tap"
                  style={{ flex: 1 }}
                  disabled={deleting}
                  data-demo="ai-obs-delete-confirm"
                  onClick={() => void remove()}
                >
                  {deleting ? '지우는 중…' : '지우기'}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn small ghost ai-tap" data-demo="ai-obs-delete" onClick={() => setConfirming(true)}>
              이 기록 삭제
            </button>
          )}
        </div>
      )}
    </article>
  );
}
