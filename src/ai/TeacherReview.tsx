import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, api, requestObservationGuidance } from '../api/client';
import type {
  AiObservation, EvidenceRecommendation, GuidancePreview, SharedSummary,
  TeacherObservationReview, TeacherRecommendation, TeacherRecommendationEdit, TeacherReviewDisplay,
} from '../api/types';
import { useAuth } from '../auth/AuthContext';
import SubHead from '../components/SubHead';
import { usePagedList } from '../components/paging';
import { formatDate, Loading, loadStateView, MoreButton } from '../components/ui';
import { useSharedDetail } from '../pages/teacher/useSharedDetail';
import { EvidenceItem, observationNeedsReview, ReviewedResult } from './ReviewResult';
import { sourceUrl } from './EvidenceDetails';
import { ReviewFollowUp, ReviewScene } from './TeacherReviewDisplay';
import './ai.css';

export function TeacherReviewInbox() {
  const id = Number(useParams().childId);
  return <div className="observation-review">
    <SubHead title="가정 영상 검토" fallback={`/t/children/${id}/coaching`} />
    <TeacherReviewQueue childId={id} />
  </div>;
}

export function TeacherReviewQueue({ childId, embedded = false }: { childId: number; embedded?: boolean }) {
  const { user } = useAuth();
  const summary = useSharedDetail<SharedSummary>(`/teacher/children/${childId}/shared-summary?weeks=1`, user?.id);
  return loadStateView(summary, '공유 설정을') ?? (summary.data?.sharedItems.includes('AI_OBSERVATIONS')
    ? <ReviewQueue key={`${user?.id}-${childId}`} childId={childId} heading={embedded ? 'h3' : 'h2'} />
    : <p>보호자가 ‘가정의 AI 관찰 기록’ 공유를 켜면 이곳에서 검토할 수 있어요.</p>);
}

function ReviewQueue({ childId, heading: Heading }: { childId: number; heading: 'h2' | 'h3' }) {
  const list = usePagedList<AiObservation>(`/children/${childId}/ai-observations`, 20, [childId]);
  const rows = (list.items ?? []).filter(observationNeedsReview);
  return loadStateView(list, '검토할 기록을') ?? <>
    <p className="muted">공유된 행동 기록을 열어 AI 조치 제안과 근거를 확인하고, 선생님이 검토한 조치를 보호자에게 전해 주세요.</p>
    {['PENDING', 'PUBLISHED'].map(status => {
      const group = rows.filter(row => row.reviewStatus === status);
      return group.length > 0 && <section key={status}>
        <Heading>{status === 'PENDING' ? '검토 대기' : '보호자에게 전달한 기록'}</Heading>
        <ul className="review-queue">{group.map(row => <li key={row.id}>
          <Link to={`/t/children/${childId}/ai-reviews/${row.id}`} data-demo="review-open">
            <span>{formatDate(row.recordedAt || row.createdAt)}</span>
            <strong>{row.publishedGuidance?.summary || row.summary || row.moments?.[0]?.note || '장면별 관찰 기록 확인'}</strong>
          </Link>
        </li>)}</ul>
      </section>;
    })}
    {!rows.length && <p>조회한 기록에 검토 요청이 없어요.</p>}
    <MoreButton list={list} label="이전 관찰 기록 더 보기" />
  </>;
}

export function validGuidance(preview: GuidancePreview) {
  return !!preview && typeof preview.receipt === 'string' && !!preview.receipt && typeof preview.summary === 'string'
    && !!preview.summary.trim() && !!preview.corpusVersion && Array.isArray(preview.recommendations)
    && preview.recommendations.every(item => item && [item.observation, item.action, item.reason, item.sourceId,
      item.sourceTitle, item.sourcePublisher].every(s => typeof s === 'string' && s.trim()) && sourceUrl(item.sourceUrl))
    && new Set(preview.recommendations.map(item => item.sourceId)).size === preview.recommendations.length;
}

export function TeacherReviewDetail() {
  const params = useParams();
  const childId = Number(params.childId), observationId = Number(params.observationId);
  const { user } = useAuth();
  return <ReviewScreen key={`${user?.id}-${childId}-${observationId}`}
    childId={childId} observationId={observationId} viewerId={user?.id} />;
}

function ReviewScreen({ childId, observationId, viewerId }: {
  childId: number; observationId: number; viewerId?: number;
}) {
  const path = `/children/${childId}/ai-observations/${observationId}/review`;
  const detail = useSharedDetail<TeacherObservationReview>(path, viewerId);
  const review = detail.data;
  const display = review?.display?.observationId === observationId ? review.display : undefined;
  // When a teacher opens a source, the visibility guard hides the review. Keep the
  // input in memory so it can be restored after the server confirms access again.
  const cache = useRef<ReviewDraft | null>(null);
  useEffect(() => {
    if (review?.status === 'PUBLISHED' || accessChanged(detail.error)) cache.current = null;
  }, [review, detail.error]);
  return <div className="observation-review">
    <SubHead title="가정 영상 검토" fallback={`/t/children/${childId}/coaching`} />
    {detail.error ? <div>
      <p role="alert">검토 기록을 열 수 없어요. 선생님 연결과 보호자의 AI 기록 공유 상태를 확인해 주세요.</p>
      <button type="button" className="btn secondary" onClick={detail.reload}>다시 확인하기</button>
    </div> : !review ? <Loading />
      : review.status === 'PUBLISHED' ? <>
        {display && <ReviewScene observation={review.observation} display={display} />}
        {review.observation.publishedGuidance
          ? <ReviewedResult guidance={review.observation.publishedGuidance} /> : <p>보호자에게 전달한 기록이에요.</p>}
        <ReviewFollowUp childId={childId} display={display} />
      </>
      : <ReviewEditor childId={childId} observation={review.observation} display={display} path={path} reload={detail.reload} cache={cache} />}
  </div>;
}

const REVIEW_TEXT_LIMIT = 500;
type ActionDraft = { action: string; rationale: string };
type ReviewOption = ActionDraft & { suggestion: EvidenceRecommendation; included: boolean };
type ReviewDraft = {
  summary: string;
  edited: boolean;
  receipt: string | null;
  options: ReviewOption[];
  own: ActionDraft;
};

function accessChanged(error: unknown) {
  return error instanceof ApiError && [401, 403, 404, 409].includes(error.status);
}

function matchingSuggestion(a: EvidenceRecommendation, b: EvidenceRecommendation) {
  return a.sourceId === b.sourceId && a.action === b.action && a.observation === b.observation
    && a.reason === b.reason && a.sourceUrl === b.sourceUrl && a.sourceSection === b.sourceSection;
}

function RecommendationFields({ value, disabled, own = false, onChange }: {
  value: ActionDraft; disabled: boolean; own?: boolean; onChange: (value: ActionDraft) => void;
}) {
  return <div className="review-action-fields">
    <label className="field">
      <span>{own ? '선생님이 제안하는 조치' : '보호자에게 전할 조치'}</span>
      <textarea data-demo={own ? 'review-own-action' : 'review-action'} rows={2} maxLength={REVIEW_TEXT_LIMIT}
        value={value.action} disabled={disabled} onChange={e => onChange({ ...value, action: e.target.value })} />
    </label>
    <label className="field">
      <span>선생님 판단 근거 (선택)</span>
      <textarea data-demo={own ? 'review-own-rationale' : 'review-rationale'} rows={2} maxLength={REVIEW_TEXT_LIMIT}
        value={value.rationale} disabled={disabled}
        placeholder="아이의 평소 모습이나 선생님이 직접 확인한 점을 적어 주세요."
        onChange={e => onChange({ ...value, rationale: e.target.value })} />
    </label>
  </div>;
}

function ReviewEditor({ childId, observation, display, path, reload, cache }: {
  childId: number; observation: AiObservation; display?: TeacherReviewDisplay; path: string; reload: () => void;
  cache: { current: ReviewDraft | null };
}) {
  const original = observation.summary?.trim() || '';
  const [draft, setDraft] = useState<ReviewDraft>(() => cache.current ?? {
    summary: original, edited: false, receipt: null, options: [], own: { action: '', rationale: '' },
  });
  const [working, setWorking] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState('');
  const active = useRef<AbortController | null>(null);
  const submitting = useRef(false);
  const hasObservation = !!original || !!observation.moments?.length;
  const autoGenerate = useRef(hasObservation && !draft.edited && !draft.receipt && !draft.options.length);

  const updateDraft = useCallback((update: (current: ReviewDraft) => ReviewDraft) => {
    const current = cache.current ?? {
      summary: original, edited: false, receipt: null, options: [], own: { action: '', rationale: '' },
    };
    const next = update(current);
    cache.current = next;
    setDraft(next);
  }, [cache, original]);

  const generate = useCallback(async (text?: string) => {
    active.current?.abort();
    const request = new AbortController();
    active.current = request;
    const timer = window.setTimeout(() => request.abort(), 60_000);
    setError('');
    setWorking(true);
    try {
      const data = await requestObservationGuidance(childId, observation.id, text, request.signal);
      if (active.current !== request) return;
      if (!validGuidance(data)) throw new Error('invalid guidance');
      updateDraft(current => ({
        ...current, receipt: data.receipt, summary: data.summary,
        options: data.recommendations.map(suggestion => current.options.find(option =>
          matchingSuggestion(option.suggestion, suggestion)) ?? {
          suggestion, included: false, action: suggestion.action, rationale: '',
        }),
      }));
    } catch (err) {
      if (active.current !== request) return;
      if (accessChanged(err)) { cache.current = null; setBlocked(true); }
      else setError(err instanceof ApiError && err.status === 429
        ? 'AI가 다른 기록을 살펴보고 있어요. 잠시 뒤 다시 눌러 주세요.'
        : '근거 자료를 확인하지 못했어요. 관찰 문장을 확인하고 다시 찾아 주세요.');
    } finally {
      window.clearTimeout(timer);
      if (active.current === request) { active.current = null; setWorking(false); }
    }
  }, [cache, childId, observation.id, updateDraft]);

  useEffect(() => {
    if (autoGenerate.current) void generate();
    return () => { active.current?.abort(); active.current = null; };
  }, [generate]);

  const selected = draft.options.filter(option => option.included);
  const ownAction = draft.own.action.trim();
  const invalidAction = selected.some(option => !option.action.trim()) || (!ownAction && !!draft.own.rationale.trim());

  async function publish() {
    if (!draft.receipt || invalidAction || submitting.current) return;
    const teacherEdits: TeacherRecommendationEdit[] = selected
      .filter(option => option.action.trim() !== option.suggestion.action || !!option.rationale.trim())
      .map(({ suggestion, action, rationale }) => ({ sourceId: suggestion.sourceId, action: action.trim(), rationale: rationale.trim() || undefined }));
    const teacherRecommendation: TeacherRecommendation | undefined = ownAction
      ? { action: ownAction, rationale: draft.own.rationale.trim() || undefined } : undefined;
    submitting.current = true;
    setPublishing(true); setError('');
    try {
      await api<AiObservation>('POST', path + '/publish', {
        receipt: draft.receipt, selectedSourceIds: selected.map(option => option.suggestion.sourceId),
        ...(teacherEdits.length > 0 && { teacherEdits }),
        ...(teacherRecommendation && { teacherRecommendation }),
      });
      cache.current = null;
      reload();
    } catch (err) {
      if (accessChanged(err)) { cache.current = null; setBlocked(true); }
      else if (err instanceof ApiError && err.code === 'AI_RECEIPT_INVALID') {
        updateDraft(current => ({ ...current, receipt: null }));
        setError('확인한 근거의 유효 시간이 지났어요. 근거를 다시 찾아 주세요.');
      } else {
        setError('전달하지 못했어요. 작성한 내용을 확인한 뒤 다시 시도해 주세요.');
      }
    } finally { submitting.current = false; setPublishing(false); }
  }

  if (blocked) return <div><p role="status">공유 권한이나 검토 상태가 바뀌었어요. 최신 기록을 확인해 주세요.</p>
    <button type="button" className="btn secondary" onClick={reload}>검토 기록 다시 열기</button></div>;

  return <>
    <ReviewScene observation={observation} display={display} />
    <section aria-labelledby="review-heading"><h2 id="review-heading"><label htmlFor="review-summary">보호자에게 전할 관찰 내용</label></h2>
      <textarea id="review-summary" data-demo="review-summary" rows={3} maxLength={REVIEW_TEXT_LIMIT}
        value={draft.summary} disabled={publishing} placeholder="장면에서 확인한 행동을 적어 주세요."
        onChange={e => {
          active.current?.abort(); active.current = null;
          setWorking(false); setError('');
          const summary = e.target.value;
          updateDraft(current => ({ ...current, summary, edited: true, receipt: null, options: [] }));
        }} />
      {!draft.receipt && <button type="button" className="btn secondary block" data-demo="review-generate"
        disabled={working || (!draft.summary.trim() && (draft.edited || !hasObservation))}
        onClick={() => void generate(draft.summary.trim() || undefined)}>
        {working ? '공개 자료에서 근거를 찾는 중…' : '이 관찰 내용으로 근거 찾기'}
      </button>}
    </section>
    {draft.receipt && <section aria-labelledby="review-options" data-demo="review-preview">
      <h2 id="review-options">참고할 대처</h2>
      {draft.options.length ? <>
        <p className="muted">AI가 자료에서 고른 대처예요. 근거와 아이의 평소 모습을 살펴보고 보호자에게 전할 내용을 골라 수정해 주세요.</p>
        {draft.options.map((option, index) => {
          const updateOption = (update: Partial<ReviewOption>) => updateDraft(current => ({
            ...current, options: current.options.map(candidate => candidate.suggestion.sourceId === option.suggestion.sourceId
              ? { ...candidate, ...update } : candidate),
          }));
          return <div className="review-choice" key={option.suggestion.sourceId}>
            <EvidenceItem item={option.suggestion} />
            <label className="review-include"><input data-demo="review-include" type="checkbox" checked={option.included}
              disabled={publishing} onChange={e => updateOption({ included: e.target.checked })} />
              {index + 1}번째 제안을 검토해 전달하기</label>
            {option.included && <RecommendationFields value={option} disabled={publishing} onChange={updateOption} />}
          </div>;
        })}</> : <p>이 관찰에 연결할 만한 근거를 찾지 못했어요. 선생님이 직접 조치를 적어 전달할 수 있어요.</p>}
      <details className="review-own">
        <summary>선생님이 직접 제안하는 조치 추가</summary>
        <RecommendationFields own value={draft.own} disabled={publishing}
          onChange={own => updateDraft(current => ({ ...current, own }))} />
      </details>
      {invalidAction && <p className="muted" role="status">전달할 조치의 내용을 적어 주세요.</p>}
      <button className="btn block" type="button" data-demo="review-publish" disabled={publishing || invalidAction}
        onClick={() => void publish()}>
        {publishing ? '전달하는 중…' : selected.length || ownAction ? '검토 완료 · 보호자에게 전달' : '검토한 관찰 내용만 전달'}
      </button>
    </section>}
    <ReviewFollowUp childId={childId} display={display} />
    {working && <p className="sr-only" role="status">공개 자료에서 이 장면에 맞는 대응 근거를 찾고 있어요.</p>}
    {error && <p className="error" role="alert">{error}</p>}
  </>;
}
