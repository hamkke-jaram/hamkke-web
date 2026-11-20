import { useRef, useState } from 'react';
import { BackLink } from '../components/feedback';
import './serviceFilm.css';

const chapters = [
  [0, '보호자가 기록 시작하기'],
  [18.1, '앨범에서 영상 고르기'],
  [28.566666666666666, '관찰 결과와 대응 읽기'],
  [53.63333333333333, '선생님이 이야기 보내기'],
  [73.23333333333333, '보호자가 읽고 답장하기'],
  [90.06666666666666, '교사 검토와 전달 · 로컬 시연'],
] as const;

export default function ServiceFilm() {
  const player = useRef<HTMLVideoElement>(null);
  const [current, setCurrent] = useState(0);
  const [failed, setFailed] = useState(false);
  const [started, setStarted] = useState(false);
  const base = import.meta.env.BASE_URL + 'media/';
  const media = base + 'sinabro-touch-v4.mp4';

  function showScreen(video: HTMLVideoElement) {
    if (document.fullscreenElement || !window.matchMedia('(max-width: 560px) and (orientation: portrait)').matches) return;
    const screen = video.getBoundingClientRect();
    if (screen.top < 0 || screen.bottom > window.innerHeight) {
      video.scrollIntoView({ block: 'start' });
    }
  }

  function jump(time: number) {
    const video = player.current;
    if (!video) return;
    video.currentTime = time;
    video.focus({ preventScroll: true });
    video.scrollIntoView({ block: 'nearest' });
    void video.play().catch(() => {
      // 브라우저가 재생을 보류해도 선택한 장면에서 재생 버튼을 누를 수 있다.
    });
  }

  return (
    <div className="service-film">
      <div className="service-film-heading">
        <BackLink />
        <h1>휴대폰으로 보는 시나브로</h1>
      </div>
      <div className="service-film-player">
        <video ref={player} aria-label="시나브로 서비스 시연 영상" controls playsInline preload="metadata"
          poster={base + 'sinabro-touch-v4-cover.webp'} src={media}
          width={780} height={1688}
          onPlay={(event) => { setStarted(true); showScreen(event.currentTarget); }}
          onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)} onError={() => setFailed(true)}>
          <track kind="captions" src={base + 'sinabro-touch-v4.ko.vtt'} srcLang="ko" label="한국어" default />
        </video>
        {!started && !failed && (
          <button type="button" className="service-film-start" onClick={() => jump(0)}>
            <span aria-hidden="true">▶</span> 시연 재생
          </button>
        )}
      </div>
      {failed && <p role="alert">영상을 불러오지 못했어요. <a href={media}>영상 파일 열기</a></p>}
      <section aria-label="시연 영상 장면 선택">
        <h2>장면 선택</h2>
        <ol>
          {chapters.map(([time, title], i) => (
            <li key={time}>
              <button type="button" onClick={() => jump(time)}
                aria-current={current >= time && current < (chapters[i + 1]?.[0] ?? Infinity) ? 'time' : undefined}>
                <span>{Math.floor(time / 60)}:{String(Math.floor(time % 60)).padStart(2, '0')}</span>
                {title}
              </button>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
