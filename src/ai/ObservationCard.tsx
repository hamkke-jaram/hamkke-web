import { useRef, useState } from 'react';
import { errorMessage } from '../api/client';
import type { AiObservation } from '../api/types';
import { formatDate } from '../components/ui';
import { ADULT_RESPONSE_LABEL, CHILD_STATE_LABEL, SOURCE_LABEL, formatClock, labelsOf, peopleLabel } from './labels';
import './ai.css';

/** 화면 아래에 늘 붙이는 문구(명세 8장). */
export const AI_CAVEAT = 'AI가 화면을 보고 적은 기록이에요. 틀릴 수 있어요.';

interface Props {
  observation: AiObservation;
  /** 'card'는 혼자 서는 카드, 'row'는 목록 안의 한 줄 */
  variant?: 'card' | 'row';
  /** 넘겨주면 '삭제' 버튼을 보여 준다. 한 번 더 확인한 뒤에 부른다. */
  onDelete?: () => Promise<void>;
}

/**
 * AI 관찰 기록 한 건. 요약 문장, 태그(모두 같은 중립색), 시각별 메모, 출처(가정/기관), 날짜를 보여 준다.
 * 아이를 평가하는 표시(점수·색 구분)는 두지 않는다.
 */
export default function ObservationCard({ observation: o, variant = 'card', onDelete }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const childLabels = labelsOf(o.childStates, CHILD_STATE_LABEL);
  const adultLabels = labelsOf(o.adultResponses, ADULT_RESPONSE_LABEL);
  const moments = (o.moments ?? []).filter((m) => m && typeof m.note === 'string' && m.note.trim());
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
    <article className={variant === 'card' ? 'card ai-obs' : 'ai-obs ai-obs-row'} aria-label="AI 관찰 기록">
      <div className="ai-obs-head">
        {source && <span className="chip">{source}에서 기록</span>}
        {o.authorName && <span className="muted">{o.authorName}</span>}
        {when && <span className="muted ai-obs-when">{formatDate(when)}</span>}
      </div>

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

      {moments.length > 0 && (
        <ul className="ai-moments" aria-label="시각별 메모">
          {moments.map((m, i) => (
            <li key={`${m.t}-${i}`}>
              <span className="ai-time">{formatClock(m.t)}</span>
              <span>{m.note}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="muted ai-caveat">
        {AI_CAVEAT}
        {people && ` 화면에 보인 사람: ${people}.`}
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
              <p>이 관찰 기록을 지울까요? 지우면 되돌릴 수 없어요.</p>
              <div className="row">
                <button
                  type="button"
                  className="btn secondary ai-tap"
                  style={{ flex: 1 }}
                  disabled={deleting}
                  onClick={() => setConfirming(false)}
                >
                  그대로 두기
                </button>
                <button type="button" className="btn danger ai-tap" style={{ flex: 1 }} disabled={deleting} onClick={() => void remove()}>
                  {deleting ? '지우는 중…' : '지우기'}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn small ghost ai-tap" onClick={() => setConfirming(true)}>
              이 기록 삭제
            </button>
          )}
        </div>
      )}
    </article>
  );
}
