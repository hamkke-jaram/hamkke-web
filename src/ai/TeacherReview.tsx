import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, api, requestObservationGuidance } from '../api/client';
import type { AiObservation, GuidancePreview, SharedSummary, TeacherObservationReview } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import SubHead from '../components/SubHead';
import { usePagedList } from '../components/paging';
import { formatDate, Loading, loadStateView, MoreButton } from '../components/ui';
import { useSharedDetail } from '../pages/teacher/useSharedDetail';
import { formatClock } from './labels';
import { EvidenceItem, observationNeedsReview, ReviewedResult } from './ReviewResult';
import { sourceUrl } from './EvidenceDetails';
import './ai.css';

export function TeacherReviewInbox() {
  const id = Number(useParams().childId);
  const { user } = useAuth();
  const summary = useSharedDetail<SharedSummary>(`/teacher/children/${id}/shared-summary?weeks=1`, user?.id);
  return <div className="observation-review">
    <SubHead title="가정 영상 검토" fallback="/t" />
    {loadStateView(summary, '공유 설정을') ?? (summary.data?.sharedItems.includes('AI_OBSERVATIONS')
      ? <ReviewQueue key={`${user?.id}-${id}`} childId={id} />
      : <p>보호자가 ‘가정의 AI 관찰 기록’ 공유를 켜면 이곳에서 검토할 수 있어요.</p>)}
  </div>;
}

function ReviewQueue({ childId }: { childId: number }) {
  const list = usePagedList<AiObservation>(`/children/${childId}/ai-observations`, 20, [childId]);
  const rows = (list.items ?? []).filter(observationNeedsReview);
  return loadStateView(list, '검토할 기록을') ?? <>
    <p className="muted">보호자가 공유한 영상의 장면별 관찰 메모를 확인하고, 근거 자료에 맞는 대응을 골라 주세요.</p>
    {['PENDING', 'PUBLISHED'].map(status => {
      const group = rows.filter(row => row.reviewStatus === status);
      return group.length > 0 && <section key={status}>
        <h2>{status === 'PENDING' ? '검토 대기' : '보호자에게 전달한 기록'}</h2>
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
  const path = `/children/${childId}/ai-observations/${observationId}/review`;
  const detail = useSharedDetail<TeacherObservationReview>(path, user?.id);
  const review = detail.data;
  return <div className="observation-review">
    <SubHead title="가정 영상 검토" fallback={`/t/children/${childId}/ai-reviews`} />
    {detail.error ? <div>
      <p role="alert">검토 기록을 열 수 없어요. 선생님 연결과 보호자의 AI 기록 공유 상태를 확인해 주세요.</p>
      <button type="button" className="btn secondary" onClick={detail.reload}>다시 확인하기</button>
    </div> : !review ? <Loading />
      : review.status === 'PUBLISHED' ? (review.observation.publishedGuidance
        ? <ReviewedResult guidance={review.observation.publishedGuidance} /> : <p>보호자에게 전달한 기록이에요.</p>)
      : <ReviewEditor key={`${user?.id}-${childId}-${observationId}`} childId={childId}
        observation={review.observation} path={path} reload={detail.reload} />}
  </div>;
}

function ReviewEditor({ childId, observation, path, reload }: {
  childId: number; observation: AiObservation; path: string; reload: () => void;
}) {
  const original = observation.summary?.trim() || '';
  const [summary, setSummary] = useState(original);
  const [edited, setEdited] = useState(false);
  const [preview, setPreview] = useState<GuidancePreview | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState('');
  const active = useRef<AbortController | null>(null);
  const submitting = useRef(false);
  const hasEvidence = !!original || !!observation.moments?.length;

  const generate = useCallback(async (text?: string) => {
    active.current?.abort();
    const request = new AbortController();
    active.current = request;
    const timer = window.setTimeout(() => request.abort(), 60_000);
    setError(''); setPreview(null); setWorking(true);
    try {
      const data = await requestObservationGuidance(childId, observation.id, text, request.signal);
      if (active.current !== request) return;
      if (!validGuidance(data)) throw new Error('invalid guidance');
      setPreview(data);
      setSelected(data.recommendations.map(item => item.sourceId));
      setSummary(data.summary);
    } catch (err) {
      if (active.current !== request) return;
      if (err instanceof ApiError && [401, 403, 404, 409].includes(err.status)) setBlocked(true);
      else setError(err instanceof ApiError && err.status === 429
        ? 'AI가 다른 기록을 살펴보고 있어요. 잠시 뒤 다시 눌러 주세요.'
        : '근거 자료를 확인하지 못했어요. 관찰 문장을 확인하고 다시 찾아 주세요.');
    } finally {
      window.clearTimeout(timer);
      if (active.current === request) { active.current = null; setWorking(false); }
    }
  }, [childId, observation.id]);

  useEffect(() => {
    if (hasEvidence) void generate();
    return () => { active.current?.abort(); active.current = null; };
  }, [hasEvidence, generate]);

  async function publish() {
    if (!preview || submitting.current) return;
    submitting.current = true;
    setPublishing(true); setError('');
    try {
      await api<AiObservation>('POST', path + '/publish', { receipt: preview.receipt, selectedSourceIds: selected });
      reload();
    } catch (err) {
      if (err instanceof ApiError && [401, 403, 404, 409].includes(err.status)) setBlocked(true);
      else {
        if (err instanceof ApiError && [400, 422].includes(err.status)) setPreview(null);
        setError('전달 여부를 확인하지 못했어요. 기록을 다시 확인하거나 근거를 다시 찾아 주세요.');
      }
    } finally { submitting.current = false; setPublishing(false); }
  }

  if (blocked) return <div><p role="status">공유 권한이나 검토 상태가 바뀌었어요. 최신 기록을 확인해 주세요.</p>
    <button type="button" className="btn secondary" onClick={reload}>검토 기록 다시 열기</button></div>;

  return <>
    <p className="review-date">{formatDate(observation.recordedAt || observation.createdAt)} · 가정에서 기록</p>
    <section aria-labelledby="review-scenes"><h2 id="review-scenes">AI가 장면에서 관찰한 행동</h2>
      <p className="muted">AI가 영상에서 추린 장면 사진을 보고 작성한 메모예요. 원본 영상과 소리는 보호자의 기기에 있어요.</p>
      {observation.moments?.length ? <ul className="review-scenes">{observation.moments.map((moment, i) =>
        <li key={i}><span className="ai-time">{formatClock(moment.t)}</span> {moment.note}</li>)}</ul>
        : <p>{original || '장면에서 구체적인 행동을 확인하기 어려웠어요.'}</p>}
    </section>
    <section aria-labelledby="review-heading"><h2 id="review-heading"><label htmlFor="review-summary">보호자에게 전할 관찰 내용</label></h2>
      <textarea id="review-summary" data-demo="review-summary" rows={3} maxLength={500}
        value={summary} disabled={publishing} placeholder="장면에서 확인한 행동을 적어 주세요."
        onChange={e => {
          active.current?.abort(); active.current = null;
          setWorking(false); setEdited(true); setSummary(e.target.value);
          setError(''); setPreview(null);
        }} />
      {!preview && <button type="button" className="btn secondary block" data-demo="review-generate"
        disabled={working || (!summary.trim() && (edited || !hasEvidence))}
        onClick={() => void generate(edited ? summary.trim() : undefined)}>
        {working ? '공개 자료에서 근거를 찾는 중…' : '이 관찰 내용으로 근거 찾기'}
      </button>}
    </section>
    {preview && <section aria-labelledby="review-options" data-demo="review-preview">
      <h2 id="review-options">상황별 대응과 추천 근거</h2>
      {preview.recommendations.length ? <>
        <p className="muted">관찰 내용과 원문을 확인하고 보호자에게 전할 대응을 선택해 주세요.</p>
        {preview.recommendations.map((item, index) => <div className="review-choice" key={item.sourceId}>
          <EvidenceItem item={item} />
          <label><input type="checkbox" checked={selected.includes(item.sourceId)} disabled={publishing}
            onChange={e => setSelected(ids => e.target.checked ? [...ids, item.sourceId] : ids.filter(id => id !== item.sourceId))} />
            {index + 1}번째 대응을 보호자에게 전달</label>
        </div>)}</> : <p>이 관찰에 연결할 만한 근거를 찾지 못했어요. 검토한 관찰 내용만 전달할 수 있어요.</p>}
      <button className="btn block" type="button" data-demo="review-publish" disabled={publishing} onClick={() => void publish()}>
        {publishing ? '전달하는 중…' : selected.length ? '검토 완료 · 보호자에게 전달' : '검토한 관찰 내용만 전달'}
      </button>
    </section>}
    {working && <p className="sr-only" role="status">공개 자료에서 이 장면에 맞는 대응 근거를 찾고 있어요.</p>}
    {error && <p className="error" role="alert">{error}</p>}
  </>;
}
