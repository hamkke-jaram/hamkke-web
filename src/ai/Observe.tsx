import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import type { AiConsent, Child, SharedSummary } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { CoachingCardView, ErrorText, Loading, useLoad } from '../components/ui';
import ObservationCard from './ObservationCard';
import ObservationRunStatus from './ObservationRunStatus';
import { MAX_FRAMES, captureFrame, discardFrames, type Frame } from './frames';
import { formatClock } from './labels';
import { useObservationRun } from './useObservationRun';
import './ai.css';

/**
 * 실시간 카메라로 관찰 기록하기 (/p/children/:childId/observe, /t/children/:childId/observe).
 *
 * - 카메라 화면은 이 기기에서 미리보기로만 쓴다. 영상은 녹화하지도 저장하지도 않고, 소리는 아예 받지 않는다(audio: false).
 * - '시작'을 누르면 고른 시간 동안 고른 간격으로 장면 사진 6장을 찍고, 다 찍으면 카메라를 끈 뒤 AI 서버로 보낸다.
 * - 촬영 중에는 '지금 장면 사진을 찍고 있어요' 표시가 계속 보인다. 멈추면 찍은 사진을 버리고 아무것도 보내지 않는다.
 * - 화면을 떠나거나 가리면(다른 앱·탭) 카메라를 끈다.
 */

type Facing = 'environment' | 'user';
type CameraProblem = 'insecure' | 'unsupported' | 'denied' | 'none' | 'busy' | 'unknown';
type Camera =
  | { status: 'off'; notice?: string }
  | { status: 'starting' }
  | { status: 'on' }
  | { status: 'problem'; problem: CameraProblem };
type Phase = 'setup' | 'capturing' | 'review';

interface Choice {
  deviceId?: string;
  facing: Facing;
}

const SHOTS = MAX_FRAMES;
const DURATIONS = [
  { sec: 30, label: '30초' },
  { sec: 60, label: '1분' },
  { sec: 120, label: '2분' },
];
const DEFAULT_DURATION = 60;
const TICK_MS = 250;
/** 정해진 시간이 지나고도 사진이 모자라면 이만큼만 더 기다린 뒤 찍힌 것만으로 마무리한다. */
const GRACE_SEC = 5;

const PROBLEM_TEXT: Record<CameraProblem, string> = {
  insecure:
    '카메라는 보안 연결(주소가 https로 시작)이나 이 기기 자체(localhost)에서 열었을 때만 켤 수 있어요. 주소를 확인해 주세요.',
  unsupported: '이 브라우저에서는 카메라를 켤 수 없어요. 최신 크롬·사파리·삼성 인터넷에서 열어 주세요.',
  denied:
    '카메라 사용이 허용되지 않았어요. 주소창 옆 자물쇠(사이트 설정)에서 카메라를 허용한 뒤 다시 눌러 주세요.',
  none: '연결된 카메라를 찾지 못했어요. 카메라가 있는 폰·태블릿에서 열거나 웹캠을 연결한 뒤 다시 눌러 주세요.',
  busy: '카메라를 켜지 못했어요. 다른 앱이나 탭이 카메라를 쓰고 있다면 닫고 다시 눌러 주세요.',
  unknown: '카메라를 켜지 못했어요. 잠시 후 다시 눌러 주세요.',
};

function problemOf(e: unknown): CameraProblem {
  const name = e instanceof Error ? e.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return 'denied';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') return 'none';
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') return 'busy';
  return 'unknown';
}

function constraintsFor(c: Choice): MediaStreamConstraints {
  const size = { width: { ideal: 1280 }, height: { ideal: 720 } };
  return {
    audio: false, // 소리는 받지 않는다
    video: c.deviceId ? { deviceId: { exact: c.deviceId }, ...size } : { facingMode: { ideal: c.facing }, ...size },
  };
}

/** 카메라를 쓸 수 없는 환경이면 그 이유를, 쓸 수 있으면 null을 돌려준다. */
function environmentProblem(): CameraProblem | null {
  if (typeof window === 'undefined') return 'unsupported';
  if (!window.isSecureContext) return 'insecure';
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') return 'unsupported';
  return null;
}

export default function Observe() {
  const { childId } = useParams();
  const id = Number(childId);
  const { user, policies, policiesError } = useAuth();
  const isTeacher = user?.role === 'TEACHER';
  const home = `${isTeacher ? '/t' : '/p'}/children/${id}`;
  const aiOn = policies?.aiObservationEnabled === true;

  // 이 아이를 지금 기록해도 되는지: 보호자는 AI 동의, 선생님은 보호자가 켠 '기관 촬영'.
  // 최종 확인은 분석 토큰을 줄 때 서버가 다시 한다.
  const access = useLoad(async () => {
    if (!aiOn) return null;
    if (isTeacher) {
      const s = await api<SharedSummary>('GET', `/teacher/children/${id}/shared-summary?weeks=8`);
      return { childId: id, nickname: s.child.nickname, allowed: s.sharedItems.includes('INSTITUTION_CAPTURE') };
    }
    const [child, consent] = await Promise.all([
      api<Child>('GET', `/children/${id}`),
      api<AiConsent>('GET', `/children/${id}/ai-consent`),
    ]);
    return { childId: id, nickname: child.nickname, allowed: consent?.agreed === true };
  }, [id, isTeacher, aiOn]);
  // useLoad는 조건이 바뀐 직후 한 번은 앞선 결과를 그대로 들고 있다(주소로 바로 들어오면 policies가 도착하기 전의
  // '확인 안 함(null)'이 남아 있다). 이 아이에 대한 확인이 아직 끝나지 않았으면 오류가 아니라 불러오는 중으로 본다.
  const accessPending = access.loading || (!access.error && access.data?.childId !== id);

  const run = useObservationRun(id);
  const startRun = run.start;

  const [phase, setPhase] = useState<Phase>('setup');
  const [camera, setCamera] = useState<Camera>({ status: 'off' });
  const [choice, setChoice] = useState<Choice>({ facing: 'environment' });
  const [active, setActive] = useState<{ deviceId: string; facing?: Facing }>({ deviceId: '' });
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [duration, setDuration] = useState(DEFAULT_DURATION);
  const [shots, setShots] = useState(0);
  const [remaining, setRemaining] = useState(DEFAULT_DURATION);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const seqRef = useRef(0);
  const framesRef = useRef<Frame[]>([]);
  const phaseRef = useRef<Phase>('setup');
  const captureInfo = useRef({ startedAt: '', seconds: 0 });
  const wakeRef = useRef<WakeLockSentinel | null>(null);
  phaseRef.current = phase;

  const coarse = useMemo(
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches,
    [],
  );
  const envProblem = useMemo(environmentProblem, []);

  const releaseScreen = useCallback(() => {
    const lock = wakeRef.current;
    wakeRef.current = null;
    if (lock) void lock.release().catch(() => undefined);
  }, []);

  /** 촬영하는 동안 화면이 꺼지지 않게 한다(지원하는 브라우저에서만). */
  const holdScreen = useCallback(async () => {
    try {
      if (!('wakeLock' in navigator)) return;
      const lock = await navigator.wakeLock.request('screen');
      // 받는 사이에 촬영이 끝났거나 멈췄다면 바로 놓는다.
      if (phaseRef.current === 'capturing') wakeRef.current = lock;
      else void lock.release().catch(() => undefined);
    } catch {
      /* 화면 켜 두기를 못 해도 촬영은 할 수 있다 */
    }
  }, []);

  /** 카메라를 끈다: 모든 트랙을 멈추고 미리보기에서 떼어 낸다. */
  const stopCamera = useCallback(() => {
    seqRef.current++; // 켜는 중이던 요청이 뒤늦게 끝나도 바로 끄게 한다
    const stream = streamRef.current;
    streamRef.current = null;
    stream?.getTracks().forEach((t) => t.stop());
    const video = videoRef.current;
    if (video) video.srcObject = null;
  }, []);

  const refreshDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices(all.filter((d) => d.kind === 'videoinput' && d.deviceId));
    } catch {
      setDevices([]);
    }
  }, []);

  /** 촬영을 그만두고 처음으로 돌아간다. 찍은 사진은 버리고 아무것도 보내지 않는다. */
  const abortCapture = useCallback(
    (notice: string) => {
      releaseScreen();
      stopCamera();
      discardFrames(framesRef.current);
      setShots(0);
      setPhase('setup');
      setCamera({ status: 'off', notice });
    },
    [releaseScreen, stopCamera],
  );

  const startCamera = useCallback(
    async (next: Choice) => {
      setChoice(next);
      stopCamera();
      const blocked = environmentProblem();
      if (blocked) {
        setCamera({ status: 'problem', problem: blocked });
        return;
      }
      const seq = ++seqRef.current;
      setCamera({ status: 'starting' });
      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraintsFor(next));
        } catch (e) {
          // 고른 카메라가 빠졌거나 조건에 맞는 카메라가 없으면, 조건 없이 아무 카메라나 한 번 더 찾는다.
          const name = e instanceof Error ? e.name : '';
          if (name !== 'OverconstrainedError' && !(next.deviceId && name === 'NotFoundError')) throw e;
          stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
        }
        if (seq !== seqRef.current) {
          stream.getTracks().forEach((t) => t.stop()); // 그사이 화면을 떠났거나 다른 카메라를 골랐다
          return;
        }
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        // 카메라가 뽑히거나 권한이 거둬지면 트랙이 끝난다.
        track?.addEventListener('ended', () => {
          if (streamRef.current !== stream) return;
          if (phaseRef.current === 'capturing') {
            abortCapture('카메라 연결이 끊겨서 촬영을 멈췄어요. 찍은 사진은 버렸고 아무것도 보내지 않았어요.');
          } else {
            stopCamera();
            setCamera({ status: 'off', notice: '카메라 연결이 끊겼어요. 다시 켜 주세요.' });
          }
        });
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
        }
        if (seq !== seqRef.current) return;
        const settings = track?.getSettings() ?? {};
        const facing = settings.facingMode === 'user' || settings.facingMode === 'environment' ? settings.facingMode : undefined;
        setActive({ deviceId: settings.deviceId ?? '', facing: facing ?? (next.deviceId ? undefined : next.facing) });
        setCamera({ status: 'on' });
        void refreshDevices(); // 허용한 뒤에야 카메라 이름이 보인다
      } catch (e) {
        if (seq !== seqRef.current) return;
        setCamera({ status: 'problem', problem: problemOf(e) });
      }
    },
    [abortCapture, refreshDevices, stopCamera],
  );

  // 화면을 떠날 때: 카메라를 끄고, 찍어 둔 사진을 버린다.
  useEffect(
    () => () => {
      releaseScreen();
      stopCamera();
      discardFrames(framesRef.current);
    },
    [releaseScreen, stopCamera],
  );

  // 화면이 가려지면(다른 앱·탭, 화면 꺼짐) 카메라를 끈다. 촬영 중이었다면 아무것도 보내지 않는다.
  useEffect(() => {
    const hide = () => {
      if (phaseRef.current === 'capturing') {
        abortCapture('화면이 가려져서 촬영을 멈췄어요. 찍은 사진은 버렸고 아무것도 보내지 않았어요.');
      } else {
        // 켜는 중이던 요청도 함께 거둔다(가려진 뒤에 카메라가 켜지지 않게).
        stopCamera();
        setCamera((c) =>
          c.status === 'on' || c.status === 'starting'
            ? { status: 'off', notice: '화면이 가려져서 카메라를 껐어요. 준비되면 다시 켜 주세요.' }
            : c,
        );
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') hide();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', hide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', hide);
    };
  }, [abortCapture, stopCamera]);

  // 카메라를 꽂거나 뽑으면 목록을 새로 읽는다.
  useEffect(() => {
    const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    if (!md || typeof md.addEventListener !== 'function') return;
    const onChange = () => void refreshDevices();
    md.addEventListener('devicechange', onChange);
    return () => md.removeEventListener('devicechange', onChange);
  }, [refreshDevices]);

  const send = useCallback(() => {
    const frames = framesRef.current;
    const info = captureInfo.current;
    void startRun(async () => ({ frames, durationSec: info.seconds, recordedAt: info.startedAt }));
  }, [startRun]);

  /** 다 찍었을 때: 카메라를 먼저 끄고, 찍은 사진을 AI 서버로 보낸다. */
  const finishCapture = useCallback(
    (elapsedSec: number) => {
      releaseScreen();
      stopCamera();
      if (framesRef.current.length === 0) {
        setPhase('setup');
        setCamera({ status: 'off', notice: '장면 사진을 찍지 못했어요. 카메라 화면이 보이는지 확인하고 다시 해 주세요.' });
        return;
      }
      captureInfo.current.seconds = Math.round(elapsedSec);
      setCamera({ status: 'off' });
      setPhase('review');
      send();
    },
    [releaseScreen, send, stopCamera],
  );
  const finishRef = useRef(finishCapture);
  finishRef.current = finishCapture;

  // 촬영: 고른 시간을 5등분한 시각마다 한 장씩, 모두 6장. 첫 장은 시작하자마자, 마지막 장은 끝날 때 찍는다.
  useEffect(() => {
    if (phase !== 'capturing') return;
    let cancelled = false;
    let busy = false;
    const total = duration;
    const began = performance.now();
    const times = Array.from({ length: SHOTS }, (_, i) => (total * i) / (SHOTS - 1));

    const tick = async () => {
      if (cancelled) return;
      const elapsed = (performance.now() - began) / 1000;
      setRemaining(Math.max(0, Math.ceil(total - elapsed)));
      const taken = framesRef.current.length;
      const video = videoRef.current;
      if (!busy && video && taken < SHOTS && elapsed >= times[taken]) {
        busy = true;
        try {
          const frame = await captureFrame(video, elapsed);
          if (!cancelled) {
            framesRef.current.push(frame);
            setShots(framesRef.current.length);
          }
        } catch {
          /* 화면이 잠깐 준비되지 않았을 수 있다. 다음 차례에 다시 찍는다. */
        } finally {
          busy = false;
        }
      }
      if (cancelled) return;
      if (framesRef.current.length >= SHOTS || (!busy && elapsed > total + GRACE_SEC)) {
        cancelled = true;
        clearInterval(timer);
        finishRef.current(elapsed);
      }
    };
    const timer = setInterval(() => void tick(), TICK_MS);
    void tick();
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [phase, duration]);

  // 관찰 기록이 저장되면 사진은 더 필요 없다.
  useEffect(() => {
    if (run.state.kind === 'done' || run.state.kind === 'saved') discardFrames(framesRef.current);
  }, [run.state.kind]);

  function begin() {
    if (camera.status !== 'on' || !streamRef.current) return;
    discardFrames(framesRef.current);
    captureInfo.current = { startedAt: new Date().toISOString(), seconds: duration };
    setShots(0);
    setRemaining(duration);
    setPhase('capturing');
    void holdScreen();
  }

  function startOver() {
    run.reset();
    discardFrames(framesRef.current);
    setShots(0);
    setPhase('setup');
    setCamera({ status: 'off' });
  }

  /* ── 들어올 수 있는지 확인 ── */

  if (!policies) {
    if (!policiesError) return <Loading />;
    return (
      <div>
        <h1>실시간 카메라로 관찰 기록하기</h1>
        <ErrorText error={policiesError} />
        <Link to={home} className="btn block secondary">
          돌아가기
        </Link>
      </div>
    );
  }
  if (!aiOn) {
    return (
      <div>
        <h1>실시간 카메라로 관찰 기록하기</h1>
        <p className="notice">지금은 AI 관찰 기록을 쓸 수 없어요. 다른 기록은 그대로 쓸 수 있어요.</p>
        <Link to={home} className="btn block secondary" style={{ marginTop: 12 }}>
          돌아가기
        </Link>
      </div>
    );
  }
  if (accessPending) return <Loading />;
  if (access.error || !access.data) {
    return (
      <div>
        <h1>실시간 카메라로 관찰 기록하기</h1>
        <ErrorText error={access.error ?? new Error('아이 정보를 찾을 수 없어요.')} />
        <button type="button" className="btn block secondary" onClick={access.reload}>
          다시 불러오기
        </button>
      </div>
    );
  }
  const { nickname, allowed } = access.data;
  if (!allowed) {
    return (
      <div>
        <h1>실시간 카메라로 관찰 기록하기</h1>
        <p className="notice">
          {isTeacher
            ? `보호자가 '기관에서 촬영해 관찰 기록 남기기'를 켜 둔 아이만 기록할 수 있어요. ${nickname}의 보호자에게 먼저 이야기해 주세요.`
            : `${nickname}의 AI 관찰 기록이 꺼져 있어요. 아이 홈에서 동의 내용을 읽고 켠 뒤에 기록할 수 있어요.`}
        </p>
        <Link to={home} className="btn block secondary" style={{ marginTop: 12 }}>
          돌아가기
        </Link>
      </div>
    );
  }

  /* ── 살펴보는 중 · 결과 ── */

  if (phase === 'review') {
    if (run.state.kind === 'done') {
      const { observation, coaching } = run.state.data;
      return (
        <div>
          <h1>관찰 기록을 남겼어요</h1>
          <p className="lead">보낸 장면 사진은 살펴본 직후 지워져요. 아래 글만 저장했어요.</p>
          <ObservationCard observation={observation} />
          {!isTeacher && coaching?.delivery && <CoachingCardView card={coaching.delivery.card} />}
          <div className="stack">
            <Link to={home} className="btn block">
              확인했어요
            </Link>
            <button type="button" className="btn block ghost" onClick={startOver}>
              한 번 더 기록하기
            </button>
          </div>
        </div>
      );
    }
    return (
      <div>
        <h1>{nickname} 관찰 기록</h1>
        <p className="lead">장면 사진 {framesRef.current.length || shots}장을 찍었어요. 카메라는 껐어요.</p>
        <ObservationRunStatus
          state={run.state}
          workingTitle="이 사진들을 AI 서버로 보내 살펴볼게요 (1~2분 걸릴 수 있어요)"
          onStop={run.stop}
          onRetry={framesRef.current.length > 0 ? send : undefined}
        />
        {run.state.kind !== 'working' && (
          <div className="stack">
            <button type="button" className="btn block secondary" onClick={startOver}>
              새로 촬영하기
            </button>
            <Link to={home} className="btn block ghost">
              돌아가기
            </Link>
          </div>
        )}
      </div>
    );
  }

  /* ── 준비 · 촬영 ── */

  const capturing = phase === 'capturing';
  const cameraOn = camera.status === 'on';
  const problem: CameraProblem | null = camera.status === 'problem' ? camera.problem : envProblem;
  const starting = camera.status === 'starting';
  // 카메라를 바꾸는 동안에도 고르는 칸이 사라지지 않게 한다(그동안은 눌리지 않는다).
  const pickable = !capturing && (cameraOn || (starting && devices.length > 0));
  // 폰·태블릿은 앞/뒤로 고르고, 카메라가 여러 대 연결된 기기는 이름으로 고른다.
  const showFacing = pickable && coarse;
  const showSelect = pickable && devices.length > 1 && (!coarse || devices.length > 2);
  const durationLabel = DURATIONS.find((d) => d.sec === duration)?.label ?? `${duration}초`;

  return (
    <div>
      <h1>{capturing ? `${nickname}의 모습을 담고 있어요` : '실시간 카메라로 관찰 기록하기'}</h1>
      {!capturing && (
        <p className="lead">
          카메라 화면에서 장면 사진 {SHOTS}장을 찍어 AI 서버로 보내면, AI가 본 모습을 짧은 글로 적어 드려요. 영상은
          녹화하거나 저장하지 않고, 소리도 담지 않아요.
        </p>
      )}

      {isTeacher && <p className="notice" style={{ marginBottom: 12 }}>다른 아이가 함께 찍히지 않게 이 아이만 화면에 담아 주세요.</p>}

      {capturing && (
        <>
          <div className="ai-capture-indicator">
            <span className="ai-dot" aria-hidden="true" />
            <span role="status" aria-live="polite">
              지금 장면 사진을 찍고 있어요 ({shots}/{SHOTS})
            </span>
            <span className="ai-remaining" role="timer" aria-label={`남은 시간 ${remaining}초`}>
              남은 시간 {formatClock(remaining)}
            </span>
          </div>
          <div className="ai-shots" aria-hidden="true">
            {Array.from({ length: SHOTS }, (_, i) => (
              <span key={i} className={i < shots ? 'taken' : undefined} />
            ))}
          </div>
        </>
      )}

      <div className="ai-preview">
        <video
          ref={videoRef}
          className={active.facing === 'user' ? 'mirrored' : undefined}
          playsInline
          muted
          autoPlay
          aria-label="카메라 미리보기"
        />
        {!cameraOn && (
          <div className="ai-preview-empty">
            {starting ? (
              <span role="status">카메라를 켜는 중이에요…</span>
            ) : (
              <span>카메라가 꺼져 있어요</span>
            )}
          </div>
        )}
      </div>

      {capturing ? (
        <>
          <p className="muted">
            영상은 녹화하지 않아요. 화면을 켜 둔 채로 평소처럼 지내 주세요. 화면을 가리거나 다른 앱으로 가면 촬영을
            멈추고 아무것도 보내지 않아요.
          </p>
          <button
            type="button"
            className="btn secondary block"
            onClick={() => abortCapture('촬영을 멈췄어요. 찍은 사진은 버렸고 아무것도 보내지 않았어요.')}
          >
            멈추기
          </button>
        </>
      ) : (
        <>
          {camera.status === 'off' && camera.notice && (
            <p className="notice" role="status" style={{ marginBottom: 12 }}>
              {camera.notice}
            </p>
          )}

          {problem && (
            <div className="notice" role="status" style={{ marginBottom: 12 }}>
              <p style={{ margin: 0 }}>{PROBLEM_TEXT[problem]}</p>
              {!isTeacher && (problem === 'insecure' || problem === 'unsupported' || problem === 'none') && (
                <p style={{ margin: '8px 0 0' }}>
                  대신 <Link to={`${home}/record`}>영상을 찍어서 기록하기</Link>로도 AI 관찰 기록을 만들 수 있어요.
                </p>
              )}
            </div>
          )}

          {!cameraOn && !starting && !envProblem && (
            <button type="button" className="btn block" onClick={() => void startCamera(choice)}>
              {camera.status === 'problem' ? '다시 켜 보기' : '카메라 켜기'}
            </button>
          )}

          {showFacing && (
            <div style={{ marginBottom: 4 }}>
              <span className="ai-field-label" id="ai-facing-label">
                카메라 방향
              </span>
              <div className="tabs" role="group" aria-labelledby="ai-facing-label">
                <button
                  type="button"
                  aria-pressed={active.facing === 'environment'}
                  disabled={starting}
                  onClick={() => void startCamera({ facing: 'environment' })}
                >
                  뒤 카메라
                </button>
                <button
                  type="button"
                  aria-pressed={active.facing === 'user'}
                  disabled={starting}
                  onClick={() => void startCamera({ facing: 'user' })}
                >
                  앞 카메라
                </button>
              </div>
            </div>
          )}

          {showSelect && (
            <label className="field">
              <span>연결된 카메라 고르기</span>
              <select
                value={devices.some((d) => d.deviceId === active.deviceId) ? active.deviceId : ''}
                disabled={starting}
                onChange={(e) => e.target.value && void startCamera({ deviceId: e.target.value, facing: choice.facing })}
              >
                {!devices.some((d) => d.deviceId === active.deviceId) && <option value="">카메라를 골라 주세요</option>}
                {devices.map((d, i) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `카메라 ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div style={{ marginTop: 12 }}>
            <span className="ai-field-label" id="ai-duration-label">
              기록할 시간
            </span>
            <div className="tabs" role="group" aria-labelledby="ai-duration-label">
              {DURATIONS.map((d) => (
                <button key={d.sec} type="button" aria-pressed={duration === d.sec} onClick={() => setDuration(d.sec)}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <button type="button" className="btn block" disabled={!cameraOn} onClick={begin}>
            시작하기
          </button>
          <p className="muted">
            '시작하기'를 누르면 {durationLabel} 동안 장면 사진 {SHOTS}장을 찍어요. 누르기 전에는 아무것도 찍거나 보내지
            않고, 찍는 동안에는 언제든 멈출 수 있어요.
          </p>

          <section className="card soft">
            <h2>이렇게 해 주세요</h2>
            <ol className="steps">
              <li>폰·태블릿을 세워 두거나 웹캠 방향을 맞춰 주세요.</li>
              <li>아이와 함께 있는 어른이 화면에 같이 나오게 해 주세요.</li>
              <li>평소처럼 놀거나 지내 주세요. 잘 보이려고 애쓰지 않아도 괜찮아요.</li>
            </ol>
          </section>

          <Link to={home} className="btn block ghost">
            돌아가기
          </Link>
        </>
      )}
    </div>
  );
}
