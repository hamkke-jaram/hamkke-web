import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { AiObservation, EvidenceRecommendation, LinkedTeacher, PublishedGuidance, ShareSettings } from '../api/types';
import { formatDate } from '../components/ui';
import { watchSharedDetail } from '../pages/teacher/useSharedDetail';

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

export function sourceUrl(url: string): string | null {
  try {
    const source = new URL(url);
    return source.protocol === 'https:' && !source.username && !source.password ? source.href : null;
  } catch {
    return null;
  }
}

export function EvidenceItem({ item }: { item: EvidenceRecommendation }) {
  const href = sourceUrl(item.sourceUrl);
  const sourceHost = href ? new URL(href).hostname : '';
  return (
    <div className="evidence-item">
      <p className="evidence-scene">관찰한 상황 · {item.observation}</p>
      <p className="evidence-action">{item.action}</p>
      <p><strong>추천 이유</strong> {item.reason}</p>
      {href && <p className="evidence-source"><a href={href} target="_blank" rel="noopener noreferrer">
        {item.sourcePublisher} · {item.sourceTitle}
      </a>{item.sourceSection && <span>{item.sourceSection}</span>}</p>}
      {sourceHost === 'www.cdc.gov' && <p className="evidence-source muted">미국 CDC에서 원문을 무료로 제공합니다. CDC와 미국 보건복지부, 미국 정부는 이 서비스를 보증하지 않습니다.</p>}
      {sourceHost === 'help-for-early-years-providers.education.gov.uk' && <p className="evidence-source muted">
        © Crown copyright. Contains public sector information licensed under the{' '}
        <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/" target="_blank" rel="noopener noreferrer" lang="en">Open Government Licence v3.0</a>.
      </p>}
    </div>
  );
}

export function ReviewedResult({ guidance }: { guidance: PublishedGuidance }) {
  return (
    <section className="review-result" data-demo="ai-reviewed-result" aria-label="선생님이 검토한 관찰과 대응">
      <p className="review-status">선생님 검토 완료 {guidance.reviewedAt && <span>· {formatDate(guidance.reviewedAt)}</span>}</p>
      <h3>관찰한 행동</h3>
      <p className="review-summary">{guidance.summary}</p>
      <h3>상황에 맞는 대응</h3>
      {guidance.recommendations.length
        ? guidance.recommendations.map(item => <EvidenceItem key={item.sourceId} item={item} />)
        : <p>이번 검토에서 전달된 대응 방법은 없어요.</p>}
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
