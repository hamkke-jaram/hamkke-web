import { useRef, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { ReviewedExample } from '../../ai/DemoObservationExample';
import { EvidenceItem } from '../../ai/ReviewResult';
import { formatClock } from '../../ai/labels';
import { useAuth } from '../../auth/AuthContext';
import { isDemoWorkspaceChild, publishedDemoReview, publishDemoReview } from '../../auth/demoLogin';
import SubHead from '../../components/SubHead';
import { observationExample, type ObservationExampleId } from '../../demo/observationExamples';
import './teacherCoachingExample.css';

export default function TeacherCoachingExample() {
  const childId = Number(useParams().childId);
  const { user } = useAuth();
  const [exampleId, setExampleId] = useState<ObservationExampleId>('block-play');
  if (user?.role !== 'TEACHER' || !isDemoWorkspaceChild(user, childId)) return <Navigate to="/t" replace />;
  return <div className="observation-review teacher-coaching-example">
    <SubHead title="가정 영상 검토 예시" fallback={`/t/children/${childId}/coaching`} />
    <p className="muted">합성 영상과 시연용 관찰 문장으로 검토를 연습할 수 있어요. 체험 결과는 이 브라우저에 저장돼요.</p>
    <div className="example-picker" role="group" aria-label="검토할 예시 영상">
      {(['block-play', 'throw-and-shout'] as const).map(id =>
        <button type="button" className="btn secondary" aria-pressed={id === exampleId}
          data-demo={`qr-example-${id}`} key={id} onClick={() => setExampleId(id)}>
          {observationExample(id).label}
        </button>)}
    </div>
    <Example key={`${user.id}-${childId}-${exampleId}`} childId={childId} exampleId={exampleId} />
  </div>;
}

function Example({ childId, exampleId }: { childId: number; exampleId: ObservationExampleId }) {
  const { user } = useAuth();
  const example = observationExample(exampleId);
  const video = useRef<HTMLVideoElement>(null);
  const [review, setReview] = useState(() => publishedDemoReview(user, childId, exampleId));
  const [editing, setEditing] = useState(!review);
  const [summary, setSummary] = useState(review?.summary ?? example.observation.summary ?? '');
  const [includeAction, setIncludeAction] = useState(review?.includeAction ?? false);
  const [action, setAction] = useState(review?.teacherEdit?.action ?? example.evidence.action);
  const [rationale, setRationale] = useState(review?.teacherEdit?.rationale ?? '');
  const [ownAction, setOwnAction] = useState(review?.teacherRecommendation?.action ?? '');
  const [ownRationale, setOwnRationale] = useState(review?.teacherRecommendation?.rationale ?? '');
  const [error, setError] = useState('');

  return <>
    {review && !editing ? <>
      <ReviewedExample review={review} exampleId={exampleId} />
      <p className="muted">같은 기기에서 보호자 체험 계정으로 로그인한 뒤 아이 홈의 해당 영상 예시를 열면 전달한 내용을 볼 수 있어요.</p>
      <button className="btn secondary block" onClick={() => setEditing(true)}>예시 다시 검토하기</button>
    </> : <>
      <section>
        <h2>영상에서 관찰한 행동</h2>
        {example.audioCue && <p className="muted">약 5초에 연기로 녹음한 큰 소리가 나와요.</p>}
        <video ref={video} controls playsInline preload="metadata" src={example.video} poster={example.poster}
          aria-label={`${example.label} 합성 영상`} />
        {!example.audioCue && <p>{example.observation.summary}</p>}
        <details><summary>장면별 관찰 메모</summary>
          <ul className="review-scenes">{example.observation.moments?.map(moment =>
            <li key={moment.t}><span className="ai-time">{formatClock(moment.t)}</span> {moment.note}</li>)}</ul>
        </details>
      </section>
      {example.audioCue && <section aria-labelledby="example-audio-title">
        <h2 id="example-audio-title">소리에서 확인한 내용</h2>
        <p>{example.audioCue.label}</p>
        <p className="muted">연기 음원을 영상에 따로 합쳤어요.</p>
        <button type="button" className="btn secondary" onClick={() => {
          if (!video.current || !example.audioCue) return;
          video.current.currentTime = example.audioCue.start;
          void video.current.play().catch(() => undefined);
        }}>큰 소리 구간 재생</button>
        <p className="muted"><a href={example.audioCue.sourceUrl} target="_blank" rel="noreferrer">{example.audioCue.credit}</a></p>
      </section>}
      <section className="example-action" aria-label="어린이집 추천과 근거">
        <h2>AI 조치 제안 예시</h2>
        <EvidenceItem item={example.evidence} />
      </section>
      <label className="field">
        <span>보호자에게 전할 선생님 관찰 메모</span>
        <textarea data-demo="qr-flow-summary" rows={3} maxLength={500} value={summary}
          onChange={event => setSummary(event.target.value)} />
      </label>
      <label className="check"><input type="checkbox" data-demo="qr-flow-select" checked={includeAction}
        onChange={event => setIncludeAction(event.target.checked)} />이 제안을 검토해 전달하기</label>
      {includeAction && <>
        <label className="field"><span>보호자에게 전할 조치</span>
          <textarea data-demo="qr-flow-action" rows={3} maxLength={500} value={action} onChange={event => setAction(event.target.value)} />
        </label>
        <label className="field"><span>선생님이 판단한 이유 (선택)</span>
          <textarea data-demo="qr-flow-rationale" rows={2} maxLength={500} value={rationale} onChange={event => setRationale(event.target.value)} />
        </label>
      </>}
      <details className="disclosure">
        <summary>선생님 조치 직접 추가</summary>
        <label className="field"><span>추가 조치 (선택)</span>
          <textarea rows={2} maxLength={500} value={ownAction} onChange={event => setOwnAction(event.target.value)} />
        </label>
        <label className="field"><span>추가 조치의 이유 (선택)</span>
          <textarea rows={2} maxLength={500} value={ownRationale} onChange={event => setOwnRationale(event.target.value)} />
        </label>
      </details>
      <button type="button" className="btn block" data-demo="qr-flow-publish"
        disabled={!summary.trim() || (includeAction && !action.trim()) || (!!ownRationale.trim() && !ownAction.trim())}
        onClick={() => {
          const teacherEdit = includeAction && (action.trim() !== example.evidence.action || rationale.trim())
            ? { action: action.trim(), rationale: rationale.trim() || undefined } : undefined;
          const teacherRecommendation = ownAction.trim()
            ? { action: ownAction.trim(), rationale: ownRationale.trim() || undefined } : undefined;
          const saved = user && publishDemoReview(user, childId, summary, includeAction, { teacherEdit, teacherRecommendation }, exampleId);
          if (!saved) { setError('체험 계정을 확인하고 다시 시도해 주세요.'); return; }
          setReview(saved); setEditing(false); setError('');
        }}>검토 완료 · 체험 보호자에게 전달</button>
      {error && <p role="alert">{error}</p>}
    </>}
  </>;
}
