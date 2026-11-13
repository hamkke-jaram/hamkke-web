import type { RunStage, RunState } from './useObservationRun';
import './ai.css';

const STAGE_LABEL: Record<RunStage, string> = {
  frames: '영상에서 장면 사진을 고르고 있어요.',
  session: '보낼 준비를 하고 있어요.',
  analyzing: 'AI가 장면 사진을 살펴보고 있어요. 살펴본 뒤 사진은 바로 지워요.',
  saving: 'AI가 적은 관찰 기록을 저장하고 있어요.',
};

interface Props {
  state: RunState;
  /** 진행 중일 때의 제목 */
  workingTitle: string;
  /** 실패·멈춤 안내 아래에 덧붙일 말(예: 지표 기록은 그대로 남아 있다는 안내) */
  reassurance?: string;
  onStop: () => void;
  /** 넘겨주면 실패·멈춤 때 '다시 시도'를 보여 준다 */
  onRetry?: () => void;
}

/**
 * AI 관찰 기록 만들기의 진행·실패·멈춤 상태를 보여 주는 카드. 완료(done)와 시작 전(idle)은 그리지 않는다.
 * 저장은 되었지만 내용을 가져오지 못한 경우(saved)는 저장되었다는 안내만 보여 준다.
 * 실패도 차분하게 알린다(빨간 경고 대신 안내 문장과 다시 시도).
 */
export default function ObservationRunStatus({ state, workingTitle, reassurance, onStop, onRetry }: Props) {
  if (state.kind === 'working') {
    return (
      <section className="card" aria-label="AI 관찰 기록 진행 상태">
        <div className="ai-status" role="status" aria-live="polite">
          <div className="spinner" aria-hidden="true" />
          <div>
            <p>
              <strong>{workingTitle}</strong>
            </p>
            <p className="muted">{STAGE_LABEL[state.stage]}</p>
          </div>
        </div>
        {state.stage !== 'saving' && (
          <>
            <p className="muted">이 화면을 나가면 만들기를 멈춰요.</p>
            <button type="button" className="btn secondary block" onClick={onStop}>
              멈추기
            </button>
          </>
        )}
      </section>
    );
  }

  // 저장은 되었는데 방금 기록을 화면으로 가져오지 못한 경우. 실패가 아니므로 저장되었다고 알린다.
  if (state.kind === 'saved') {
    return (
      <section className="card" aria-label="AI 관찰 기록 진행 상태">
        <div role="status" aria-live="polite">
          <p style={{ marginTop: 0 }}>
            <strong>AI 관찰 기록을 저장했어요.</strong>
          </p>
          <p className="muted" style={{ marginBottom: 0 }}>
            {state.message}
          </p>
        </div>
      </section>
    );
  }

  if (state.kind === 'failed' || state.kind === 'stopped') {
    const canRetry = onRetry && (state.kind === 'stopped' || state.retryable);
    return (
      <section className="card" aria-label="AI 관찰 기록 진행 상태">
        <div role="status" aria-live="polite">
          <p style={{ marginTop: 0 }}>
            <strong>
              {state.kind === 'stopped' ? 'AI 관찰 기록 만들기를 멈췄어요.' : '이번에는 AI 관찰 기록을 만들지 못했어요.'}
            </strong>
          </p>
          {state.kind === 'failed' && <p>{state.message}</p>}
          {state.kind === 'stopped' && (
            <p className="muted">이미 AI 서버로 간 사진이 있다면 살펴본 직후 지워지고, 관찰 기록은 저장되지 않아요.</p>
          )}
          {reassurance && <p className="muted">{reassurance}</p>}
        </div>
        {canRetry && (
          <button type="button" className="btn secondary block" onClick={onRetry}>
            다시 시도
          </button>
        )}
      </section>
    );
  }

  return null;
}
