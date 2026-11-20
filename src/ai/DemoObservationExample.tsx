import { useEffect, useReducer, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { publishedDemoReview, type ExampleReview } from '../auth/demoLogin';
import { blockPlayEvidence, blockPlayObservation } from '../demo/blockPlayExample';
import sampleVideo from '../demo/teacher-review/media/block-play.mp4';
import samplePoster from '../demo/teacher-review/media/block-play.jpg';
import ObservationCard from './ObservationCard';
import { ReviewedResult } from './ReviewResult';

export function ReviewedExample({ review }: { review: ExampleReview }) {
  return <ReviewedResult summaryLabel="선생님 관찰 메모" recommendationsLabel="블록 놀이 장면에서 해 볼 일"
    guidance={{ summary: review.summary, recommendations: review.includeAction ? [blockPlayEvidence] : [],
      reviewedAt: review.reviewedAt, corpusVersion: 'example-NURI-OBSERVE-PLAY' }} />;
}

export default function DemoObservationExample() {
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
  const review = open && user?.role === 'PARENT' ? publishedDemoReview(user, childId) : null;
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
    <details className="card qr-sample-video" data-demo="qr-example-video" onToggle={e => setOpen(e.currentTarget.open)}>
      <summary>블록 놀이 영상과 관찰 예시</summary>
      {open && <>
        {review && <ReviewedExample review={review} />}
        <video ref={video} controls playsInline preload="metadata" src={sampleVideo} poster={samplePoster}
          aria-label="블록 놀이 합성 영상" onLoadedMetadata={() => {
            if (video.current && pendingTime.current !== null) video.current.currentTime = pendingTime.current;
            pendingTime.current = null;
          }} />
        <p className="muted">16초 합성 영상이에요. 아래 장면을 누르면 그 시각의 모습과 대응 예시를 함께 볼 수 있어요.</p>
        <ObservationCard observation={blockPlayObservation} variant="row" example onMomentSelect={seek} />
      </>}
    </details>
  );
}
