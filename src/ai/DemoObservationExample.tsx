import { useEffect, useReducer, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { publishedDemoReview, type ExampleReview } from '../auth/demoLogin';
import { observationExample, type ObservationExampleId } from '../demo/observationExamples';
import ObservationCard from './ObservationCard';
import { ReviewedResult } from './ReviewResult';

export function ReviewedExample({ review, exampleId = 'block-play' }: { review: ExampleReview; exampleId?: ObservationExampleId }) {
  const { evidence } = observationExample(exampleId);
  return <ReviewedResult summaryLabel="선생님 관찰 메모" recommendationsLabel="이 장면에서 해 볼 일"
    guidance={{ summary: review.summary, recommendations: review.includeAction ? [evidence] : [],
      teacherEdits: review.includeAction && review.teacherEdit ? [{ sourceId: evidence.sourceId, ...review.teacherEdit }] : undefined,
      teacherRecommendation: review.teacherRecommendation,
      reviewedAt: review.reviewedAt, corpusVersion: `example-${evidence.sourceId}` }} />;
}

export default function DemoObservationExample() {
  return <>
    <ExampleVideo exampleId="block-play" />
    <ExampleVideo exampleId="throw-and-shout" />
  </>;
}

function ExampleVideo({ exampleId }: { exampleId: ObservationExampleId }) {
  const [open, setOpen] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const pendingTime = useRef<number | null>(null);
  const { user } = useAuth();
  const childId = Number(useParams().childId);
  const [, refresh] = useReducer(value => value + 1, 0);
  useEffect(() => {
    if (!open || user?.role !== 'PARENT') return;
    window.addEventListener('storage', refresh);
    return () => window.removeEventListener('storage', refresh);
  }, [open, user?.role]);
  const review = open && user?.role === 'PARENT' ? publishedDemoReview(user, childId, exampleId) : null;
  const example = observationExample(exampleId);
  const blockPlay = exampleId === 'block-play';
  function seek(seconds: number) {
    const player = video.current;
    if (!player) return;
    player.pause();
    if (player.readyState >= HTMLMediaElement.HAVE_METADATA) player.currentTime = seconds;
    else {
      pendingTime.current = seconds;
      player.load();
    }
  }
  return (
    <details className="card qr-sample-video" data-demo={blockPlay ? 'qr-example-video' : 'qr-action-example-video'}
      onToggle={e => setOpen(e.currentTarget.open)}>
      <summary>{blockPlay ? '블록 놀이 영상과 관찰 예시' : `${example.label} 영상 예시`}</summary>
      {open && <>
        {review && <ReviewedExample review={review} exampleId={exampleId} />}
        {example.audioCue && <p className="muted">약 5초에 연기로 녹음한 큰 소리가 나와요.</p>}
        <video ref={video} controls playsInline preload="metadata" src={example.video} poster={example.poster}
          aria-label={blockPlay ? '블록 놀이 합성 영상' : `${example.label} 합성 영상`} onLoadedMetadata={() => {
            if (video.current && pendingTime.current !== null) video.current.currentTime = pendingTime.current;
            pendingTime.current = null;
          }} />
        {example.audioCue && <>
          <p>{example.audioCue.label}</p>
          <p className="muted"><a href={example.audioCue.sourceUrl} target="_blank" rel="noreferrer">{example.audioCue.credit}</a></p>
        </>}
        <p className="muted">합성 영상의 아래 장면을 누르면 그 시각의 모습과 대응 예시를 함께 볼 수 있어요.</p>
        <ObservationCard observation={example.observation} variant="row" example onMomentSelect={seek} />
      </>}
    </details>
  );
}
