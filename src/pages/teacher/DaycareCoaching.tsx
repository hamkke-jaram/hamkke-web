import { useEffect, useState } from 'react';
import { ApiError, requestDaycareCoaching } from '../../api/client';
import type { DaycareRecommendation, Delivery } from '../../api/types';
import { CoachingReviewLinks, CoachingRows } from './CoachingRows';

type Result =
  | { state: 'loading' }
  | { state: 'ready'; recommendation: DaycareRecommendation | null }
  | { state: 'error'; message: string };

export function DaycareCoaching({
  childId, month, rows, onAccessChanged,
}: {
  childId: number;
  month: string;
  rows: Delivery[];
  onAccessChanged: (reason: ApiError) => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result>({ state: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => controller.abort(), 55_000);
    requestDaycareCoaching(childId, month, controller.signal)
      .then(({ recommendation }) => {
        if (active) setResult({ state: 'ready', recommendation });
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiError && ([401, 403, 409].includes(error.status) || error.code === 'COACHING_NOT_SHARED')) {
          onAccessChanged(error);
          return;
        }
        const busy = error instanceof ApiError && error.status === 429;
        setResult({ state: 'error', message: busy
          ? 'AI가 다른 요청을 처리하고 있어요. 잠시 후 다시 시도해 주세요.'
          : '지금은 어린이집 활동을 추천받을 수 없어요.' });
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [childId, month, attempt, onAccessChanged]);

  const recommendation = result.state === 'ready' ? result.recommendation : null;
  return (
    <>
      <CoachingRows childId={childId} rows={rows} recommendation={recommendation} />
      <p className={recommendation ? 'sr-only' : 'muted daycare-status'} role="status">
        {result.state === 'loading' && '어린이집에서 해볼 활동을 고르고 있어요.'}
        {result.state === 'ready' && (recommendation ? '목록 첫 번째에 어린이집 추천 활동이 있어요.' : '이달 코칭으로 추천할 활동이 아직 없어요.')}
        {result.state === 'error' && result.message}
      </p>
      {result.state === 'error' && (
        <button type="button" className="btn secondary small" onClick={() => {
          setResult({ state: 'loading' });
          setAttempt(value => value + 1);
        }}>추천 다시 받기</button>
      )}
      {!recommendation && result.state !== 'loading' && <CoachingReviewLinks childId={childId} />}
    </>
  );
}
