import { useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { ReviewedExample } from '../../ai/DemoObservationExample';
import { EvidenceItem } from '../../ai/ReviewResult';
import { formatClock } from '../../ai/labels';
import { useAuth } from '../../auth/AuthContext';
import { isDemoWorkspaceChild, publishedDemoReview, publishDemoReview } from '../../auth/demoLogin';
import SubHead from '../../components/SubHead';
import { blockPlayEvidence, blockPlayObservation } from '../../demo/blockPlayExample';
import sampleVideo from '../../demo/teacher-review/media/block-play.mp4';
import samplePoster from '../../demo/teacher-review/media/block-play.jpg';
import './teacherCoachingExample.css';

export default function TeacherCoachingExample() {
  const childId = Number(useParams().childId);
  const { user } = useAuth();
  if (user?.role !== 'TEACHER' || !isDemoWorkspaceChild(user, childId)) return <Navigate to="/t" replace />;
  return <Example key={`${user.id}-${childId}`} childId={childId} />;
}

function Example({ childId }: { childId: number }) {
  const { user } = useAuth();
  const [review, setReview] = useState(() => publishedDemoReview(user, childId));
  const [editing, setEditing] = useState(!review);
  const [summary, setSummary] = useState(review?.summary ?? blockPlayObservation.summary ?? '');
  const [includeAction, setIncludeAction] = useState(review?.includeAction ?? true);
  const [error, setError] = useState('');

  return <div className="observation-review teacher-coaching-example">
    <SubHead title="가정 영상 검토 예시" fallback={`/t/children/${childId}/coaching`} />
    <p className="muted">보호자가 공유한 상황을 가정한 합성 블록 놀이 영상이에요. 체험 계정의 검토 결과는 이 브라우저에 저장돼요.</p>
    {review && !editing ? <>
      <ReviewedExample review={review} />
      <p className="muted">같은 기기에서 보호자 체험 계정으로 로그인하면 아이 홈의 ‘블록 놀이 영상과 관찰 예시’에서 전달한 내용을 볼 수 있어요.</p>
      <button className="btn secondary block" onClick={() => setEditing(true)}>예시 다시 검토하기</button>
    </> : <>
      <section>
        <h2>영상에서 관찰한 행동</h2>
        <video controls playsInline preload="metadata" src={sampleVideo} poster={samplePoster} aria-label="블록 놀이 합성 영상" />
        <p>{blockPlayObservation.summary}</p>
        <details><summary>장면별 관찰 메모</summary>
          <ul className="review-scenes">{blockPlayObservation.moments?.map(moment =>
            <li key={moment.t}><span className="ai-time">{formatClock(moment.t)}</span> {moment.note}</li>)}</ul>
        </details>
      </section>
      <section className="example-action" aria-label="어린이집 추천과 근거">
        <h2>어린이집에서 해 볼 일</h2>
        <EvidenceItem item={blockPlayEvidence} />
      </section>
      <label className="field">
        <span>보호자에게 전할 선생님 관찰 메모</span>
        <textarea data-demo="qr-flow-summary" rows={3} maxLength={500} value={summary}
          onChange={event => setSummary(event.target.value)} />
      </label>
      <label className="check"><input type="checkbox" data-demo="qr-flow-select" checked={includeAction}
        onChange={event => setIncludeAction(event.target.checked)} />블록 놀이 장면의 추천 행동과 근거도 전달</label>
      <button type="button" className="btn block" data-demo="qr-flow-publish" disabled={!summary.trim()}
        onClick={() => {
          const saved = user && publishDemoReview(user, childId, summary, includeAction);
          if (!saved) { setError('체험 계정을 확인하고 다시 시도해 주세요.'); return; }
          setReview(saved); setEditing(false); setError('');
        }}>검토 완료 · 체험 보호자에게 전달</button>
      {error && <p role="alert">{error}</p>}
    </>}
  </div>;
}
