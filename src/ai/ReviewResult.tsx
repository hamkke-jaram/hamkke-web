import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type {
  AiObservation, EvidenceRecommendation, LinkedTeacher, PublishedGuidance, ShareSettings, TeacherRecommendation,
} from '../api/types';
import { formatDate } from '../components/ui';
import { watchSharedDetail } from '../pages/teacher/useSharedDetail';
import { EvidenceDetails } from './EvidenceDetails';

export type ReviewAccess = 'ready' | 'sharing-off' | 'no-teacher' | 'unknown';

/** Check current settings once for the displayed group of pending home records. */
export function useReviewAccess(childId: number | null): ReviewAccess {
  const [result, setResult] = useState<{ childId: number; value: ReviewAccess } | null>(null);
  useEffect(() => {
    if (!childId) return;
    return watchSharedDetail(async (): Promise<ReviewAccess> => {
      const settings = await api<ShareSettings>('GET', `/children/${childId}/share-settings`);
      if (!settings.aiObservations) return 'sharing-off';
      const teachers = await api<LinkedTeacher[]>('GET', `/children/${childId}/teachers`);
      return teachers.length ? 'ready' : 'no-teacher';
    }, state => setResult({ childId, value: state.data ?? 'unknown' }));
  }, [childId]);
  return result && result.childId === childId ? result.value : 'unknown';
}

export function EvidenceItem({ item }: { item: EvidenceRecommendation }) {
  return (
    <div className="evidence-item">
      <p className="evidence-scene">관찰한 상황 · {item.observation}</p>
      <p className="evidence-action">{item.action}</p>
      <EvidenceDetails evidence={item} />
    </div>
  );
}

function TeacherAction({ recommendation, label, aiSuggestion }: {
  recommendation: TeacherRecommendation;
  label: string;
  aiSuggestion?: EvidenceRecommendation;
}) {
  return <div className="evidence-item">
    <p className="evidence-scene">{label}</p>
    <p className="evidence-action" data-demo="review-teacher-action">{recommendation.action}</p>
    {recommendation.rationale && <p data-demo="review-teacher-rationale">
      <strong>선생님 판단 근거</strong><br />{recommendation.rationale}
    </p>}
    {aiSuggestion && <details className="review-original">
      <summary>AI 조치 제안과 참고 자료</summary>
      <EvidenceItem item={aiSuggestion} />
    </details>}
  </div>;
}

export function ReviewedResult({ guidance, summaryLabel = '관찰한 행동', recommendationsLabel = '상황에 맞는 대응' }: {
  guidance: PublishedGuidance;
  summaryLabel?: string;
  recommendationsLabel?: string;
}) {
  return (
    <section className="review-result" data-demo="ai-reviewed-result" aria-label="선생님이 검토한 관찰과 대응">
      <p className="review-status">선생님 검토 완료 {guidance.reviewedAt && <span>· {formatDate(guidance.reviewedAt)}</span>}</p>
      <h3>{summaryLabel}</h3>
      <p className="review-summary">{guidance.summary}</p>
      <h3>{recommendationsLabel}</h3>
      {guidance.recommendations.map(item => {
        const edit = guidance.teacherEdits?.find(entry => entry.sourceId === item.sourceId);
        return edit
          ? <TeacherAction key={item.sourceId} recommendation={edit} label="선생님이 검토한 조치" aiSuggestion={item} />
          : <EvidenceItem key={item.sourceId} item={item} />;
      })}
      {guidance.teacherRecommendation && <div data-demo="review-teacher-recommendation">
        <TeacherAction recommendation={guidance.teacherRecommendation} label="선생님이 추가한 조치" />
      </div>}
      {!guidance.recommendations.length && !guidance.teacherRecommendation
        && <p>이번 검토에서 전달된 대응 방법은 없어요.</p>}
    </section>
  );
}

export function PendingReview({ childId, access }: { childId?: number; access?: ReviewAccess }) {
  return (
    <section className="review-result" aria-label="선생님 검토 상태" data-demo="ai-review-pending">
      <h3>선생님 검토 대기</h3>
      <p>{access === 'ready' ? '연결된 선생님의 검토함에 있어요. 선생님이 확인하고 보내면 여기에서 관찰 내용과 대응 방법을 볼 수 있어요.'
        : access === 'sharing-off' ? '공유 설정에서 ‘가정의 AI 관찰 기록’을 켜면 연결된 선생님에게 이 기록이 보여요.'
        : access === 'no-teacher' ? '선생님을 연결하면 이 기록을 검토할 수 있어요.'
        : '가정의 AI 관찰 기록을 공유한 선생님이 확인하고 보내면 결과가 여기에 표시돼요.'}</p>
      {childId && <Link to={`/p/children/${childId}/share`}>선생님 연결·공유 설정</Link>}
    </section>
  );
}

export function observationNeedsReview(o: AiObservation) {
  return o.source === 'HOME' && o.reviewStatus != null;
}
