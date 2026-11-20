import { useRef, useState } from 'react';
import type { AiObservation } from '../api/types';
import sampleVideo from '../demo/teacher-review/media/block-play.mp4';
import samplePoster from '../demo/teacher-review/media/block-play.jpg';
import ObservationCard from './ObservationCard';

const example: AiObservation = {
  id: 0, source: 'HOME', modelVersion: 'illustrated-example', recordedAt: '', createdAt: '',
  summary: '손이 블록을 하나씩 들어 올려 쌓아요.', peopleCount: -1, childStates: [], adultResponses: [],
  moments: [
    { t: 0.8, note: '파란 블록, 노란 블록, 분홍 블록이 바닥에 놓여 있어요.' },
    { t: 3.7, note: '손이 노란 블록을 들어 올려요.' },
    { t: 6.6, note: '노란 블록이 파란 블록 위에 놓여 있어요.' },
    { t: 9.4, note: '손이 분홍 블록을 들어 올려요.' },
  ],
};

export default function DemoObservationExample() {
  const [open, setOpen] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const pendingTime = useRef<number | null>(null);
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
        <video ref={video} controls playsInline preload="metadata" src={sampleVideo} poster={samplePoster}
          aria-label="블록 놀이 합성 영상" onLoadedMetadata={() => {
            if (video.current && pendingTime.current !== null) video.current.currentTime = pendingTime.current;
            pendingTime.current = null;
          }} />
        <p className="muted">16초 합성 영상이에요. 아래 장면을 누르면 그 시각의 모습과 대응 예시를 함께 볼 수 있어요.</p>
        <ObservationCard observation={example} variant="row" example onMomentSelect={seek} />
      </>}
    </details>
  );
}
