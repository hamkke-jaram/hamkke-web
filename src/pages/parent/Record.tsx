import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import ObservationCard from '../../ai/ObservationCard';
import ObservationRunStatus from '../../ai/ObservationRunStatus';
import { MAX_FRAMES, sampleFramesFromFile } from '../../ai/frames';
import { healthNotice, useAiHealth } from '../../ai/health';
import { useObservationRun } from '../../ai/useObservationRun';
import { api, errorMessage } from '../../api/client';
import type { AiConsent, Child, SaveRecordResponse } from '../../api/types';
import { recordIdForFile } from '../../api/uuid';
import { FALLBACK_DISCLAIMER, useAuth } from '../../auth/AuthContext';
import {
  AnalysisError,
  MODEL_VERSION,
  SPEC_VERSION,
  analyzeVideo,
  preloadModel,
  type DeviceMetrics,
  type Stage,
} from '@hamkke-jaram/analysis';
import { runAudioInWorker } from '../../analysis/runAudioInWorker';
import Mascot from '../../components/Mascot';
import SubHead from '../../components/SubHead';
import { useReviewAccess } from '../../ai/ReviewResult';
import { refocus } from '../../components/feedback';
import { ErrorText, SupportList, formatDuration, useLoad } from '../../components/ui';
import { firstSentence } from './coachText';
import { ChevronIcon } from './icons';
import { useCueOnce } from './parentMotion';
import './parent.css';

type Phase =
  | { kind: 'guide'; notice?: string }
  | { kind: 'analyzing'; stage: Stage; ratio: number }
  | { kind: 'sending'; metrics: DeviceMetrics; clientRecordId: string; error?: unknown }
  | { kind: 'result'; data: SaveRecordResponse }
  | { kind: 'failed'; message: string };

const STAGE_LABEL: Record<Stage, string> = {
  'loading-model': '분석 준비 중',
  'reading-audio': '소리 살펴보는 중',
  'analyzing-video': '함께한 모습 살펴보는 중',
  done: '마무리 중',
};

/** 분석 단계 목록(진행 순서대로). 'done'이 오면 모두 끝난 것으로 본다. */
const STAGE_STEPS: { stage: Stage; label: string }[] = [
  { stage: 'loading-model', label: '분석 준비' },
  { stage: 'reading-audio', label: '소리 살펴보기' },
  { stage: 'analyzing-video', label: '함께한 모습 살펴보기' },
];

const SUB_STYLE = { color: 'var(--ink-2)' } as const;

const STOP_NOTICE ='분석을 멈췄어요. 아무것도 저장하거나 보내지 않았어요. 언제든 다시 시작할 수 있어요.';

const TREND_MESSAGE: Record<string, { title: string; body: string }> = {
  FIRST_RECORD: { title: '첫 기록을 남겼어요!', body: '다음 기록부터 우리 집의 변화를 함께 볼 수 있어요.' },
  GROWING: { title: '좋은 변화가 보여요', body: '부모님이 함께해 주신 시간이 기록에 담겼어요.' },
  STEADY: { title: '꾸준히 이어가고 있어요', body: '변화가 잠시 머무는 때도 있어요. 지금처럼 이어가 주세요.' },
  NEEDS_ATTENTION: { title: '오늘도 기록해 주셔서 고마워요', body: '' },
};

function overallProgress(stage: Stage, ratio: number) {
  switch (stage) {
    case 'loading-model':
      return 0.03;
    case 'reading-audio':
      return 0.08;
    case 'analyzing-video':
      return 0.1 + ratio * 0.88;
    default:
      return 1;
  }
}

export default function Record() {
  const { childId } = useParams();
  const { user } = useAuth();
  return <ChildRecord key={`${user?.id}-${childId}`} id={Number(childId)} />;
}

function ChildRecord({ id }: { id: number }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'guide' });
  const abortRef = useRef<AbortController | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const messageRef = useRef<HTMLParagraphElement>(null);

  // 누구를 기록하는지 보여 주고 뒤로 줄에 이름을 쓰려고만 불러온다. 못 불러와도 기록은 그대로 할 수 있다.
  const child = useLoad(() => api<Child>('GET', `/children/${id}`), [id]);
  const nickname = child.data?.id === id ? child.data.nickname : undefined;

  // 단계가 바뀌면 방금 누른 버튼(지금 촬영하기·멈추기·다시 보내기)이 사라진다. 초점을 멈춤·실패 문장(없으면 그 단계의
  // 제목)으로 옮겨 화면이 바뀐 것과 그 이유가 읽히게 한다. 처음 열 때는 화면 이동(useRouteFocus)이 맡는다.
  // 분석·저장·결과 화면은 같은 h1 노드를 다시 쓰므로(글자만 바뀐다) refocus로 이미 초점이 있어도 다시 읽히게 한다.
  const viewKey = phase.kind === 'sending' && phase.error ? 'sending-error' : phase.kind;
  const prevViewKey = useRef(viewKey);
  useEffect(() => {
    if (prevViewKey.current === viewKey) return;
    prevViewKey.current = viewKey;
    const target = messageRef.current ?? headingRef.current;
    if (!target) return;
    // 맨 위로 먼저 올린 뒤 초점을 준다. 초점 대상이 화면 밖이면 브라우저가 그 문장까지만 내려 준다.
    window.scrollTo(0, 0);
    refocus(target);
  }, [viewKey]);

  // AI 관찰 기록: 보호자가 이 아이에 대해 켜 두었고 AI 서버가 설정된 경우에만 쓴다.
  // 동의 여부를 확인하지 못하면 꺼진 것으로 보고 사진을 한 장도 보내지 않는다.
  const { policies } = useAuth();
  const aiOn = policies?.aiObservationEnabled === true;
  const consent = useLoad(
    () => (aiOn ? api<AiConsent>('GET', `/children/${id}/ai-consent`).catch(() => null) : Promise.resolve(null)),
    [id, aiOn],
  );
  const aiAgreed = aiOn && consent.data?.agreed === true;
  // AI 서버가 지금 관찰 기록을 만들 수 있는지 미리 확인한다. 준비되지 않았으면 숫자 기록만 남기고 사진은 보내지 않는다.
  const { health: aiHealth, recheck: recheckAi } = useAiHealth(aiAgreed);
  // '다시 확인'을 누른 동안에는 앞선 안내와 버튼을 그대로 둔다(버튼이 사라지면 초점을 잃는다).
  const lastAiNotice = useRef<string | null>(null);
  if (aiHealth.kind !== 'checking') lastAiNotice.current = healthNotice(aiHealth);
  const settledAiNotice = aiHealth.kind === 'checking' ? lastAiNotice.current : healthNotice(aiHealth);
  const aiNotice = aiAgreed ? settledAiNotice : null;
  /** 결과 화면에서 AI 서버가 준비되지 않아 관찰 기록을 만들지 않았다. */
  const [aiSkipped, setAiSkipped] = useState(false);
  const ai = useObservationRun(id);
  const reviewAccess = useReviewAccess(ai.state.kind === 'done' && ai.state.data.observation.reviewStatus === 'PENDING' ? id : null);
  /** 분석을 시작한 횟수. 모찌에게 '생각' 신호를 분석 한 번에 한 번만 보내는 데 쓴다. */
  const runSeq = useRef(0);
  const { start: startAi, reset: resetAi } = ai;
  /** 방금 분석한 영상(메모리에만 둔다). 같은 영상에서 장면 사진을 뽑을 때만 쓴다. */
  const fileRef = useRef<File | null>(null);
  const aiStartedRef = useRef(false);

  useEffect(() => {
    preloadModel();
    return () => {
      abortRef.current?.abort();
      fileRef.current = null;
    };
  }, []);

  /** 같은 영상에서 장면 사진을 뽑아 AI 관찰 기록을 만든다. 실패해도 이미 저장된 지표 기록에는 영향이 없다. */
  const makeObservation = useCallback(
    (recordedAt: string) => {
      const file = fileRef.current;
      if (!file) return;
      void startAi(async (signal) => {
        const sampled = await sampleFramesFromFile(file, MAX_FRAMES, signal);
        return { frames: sampled.frames, durationSec: sampled.durationSec, recordedAt };
      });
    },
    [startAi],
  );

  /** 사진을 뽑기 직전에 AI 서버를 다시 확인하고, 준비되었을 때만 관찰 기록을 만든다. */
  const tryObservation = useCallback(
    async (recordedAt: string) => {
      // '다시 확인' 버튼(누른 자리)은 확인하는 동안에도 그대로 둔다. 준비되었을 때만 안내를 거둔다.
      const file = fileRef.current;
      const h = await recheckAi();
      // 확인하는 사이 다른 영상을 고르면(또는 화면을 나가면) 그 영상에서 사진을 뽑지 않는다.
      if (!file || fileRef.current !== file) return;
      if (h.kind !== 'ready') {
        setAiSkipped(true);
        return;
      }
      setAiSkipped(false);
      makeObservation(recordedAt);
    },
    [recheckAi, makeObservation],
  );

  // 지표 기록이 저장되어 결과가 보인 뒤에만, 그리고 AI 동의가 있을 때만 한 번 시작한다.
  const savedRecordedAt = phase.kind === 'result' ? phase.data.record.recordedAt : null;
  useEffect(() => {
    if (!savedRecordedAt || !aiAgreed || aiStartedRef.current) return;
    aiStartedRef.current = true;
    void tryObservation(savedRecordedAt);
  }, [savedRecordedAt, aiAgreed, tryObservation]);

  // 돌아다니는 모찌(꾸밈): 분석을 시작하면 생각하는 모습, 기록이 저장되면 손을 흔들어 고마움을 전한다.
  // 저장이라는 보호자의 일에 반응할 뿐, 기록 숫자나 추이(카드·상담 안내)에 따라 다르게 반응하지 않는다.
  // 'celebrate'(폴짝·하트)가 아니라 'wave'인 까닭: 결과 화면에는 상담·긴급 연락처 안내가 함께 나올 수 있어서,
  // 어떤 결과에도 어울리는 차분한 반응 하나로 똑같이 한다.
  useCueOnce('think', phase.kind === 'analyzing' ? runSeq.current : null);
  useCueOnce('wave', phase.kind === 'result' ? phase.data.record.id : null);

  // 관찰 기록이 저장되면 영상을 더 쥐고 있을 이유가 없다.
  const aiDone = ai.state.kind === 'done' || ai.state.kind === 'saved';
  useEffect(() => {
    if (aiDone) fileRef.current = null;
  }, [aiDone]);

  async function send(metrics: DeviceMetrics, clientRecordId: string) {
    setPhase({ kind: 'sending', metrics, clientRecordId });
    try {
      const data = await api<SaveRecordResponse>('POST', `/children/${id}/interaction-records`, {
        clientRecordId,
        ...(aiAgreed ? { awaitingAiReview: true } : {}),
        recordedAt: metrics.recordedAt,
        analyzedSeconds: metrics.analyzedSeconds,
        jointPlaySeconds: metrics.jointPlaySeconds,
        responseLatencySec: metrics.responseLatencySec,
        childBidCount: metrics.childBidCount,
        respondedBidCount: metrics.respondedBidCount,
        distressEpisodeCount: metrics.distressEpisodeCount,
        modelVersion: MODEL_VERSION,
        specVersion: SPEC_VERSION,
      });
      setPhase({ kind: 'result', data });
    } catch (error) {
      setPhase({ kind: 'sending', metrics, clientRecordId, error });
    }
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    abortRef.current?.abort();
    resetAi();
    setAiSkipped(false);
    aiStartedRef.current = false;
    fileRef.current = file;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    // 멈춘 분석(또는 새 분석으로 바뀐 분석)은 진행 상황도 결과도 화면에 반영하지 않고, 서버로도 보내지 않는다.
    const stopped = () => ctrl.signal.aborted || abortRef.current !== ctrl;
    runSeq.current += 1;
    setPhase({ kind: 'analyzing', stage: 'loading-model', ratio: 0 });
    try {
      const metrics = await analyzeVideo(
        file,
        (stage, ratio) => {
          if (!stopped()) setPhase({ kind: 'analyzing', stage, ratio });
        },
        { signal: ctrl.signal, runAudio: runAudioInWorker },
      );
      if (stopped()) return;
      // 같은 영상을 다시 고르면 같은 id가 되어, 서버가 새로 저장하지 않고 처음 기록을 돌려준다.
      await send(metrics, recordIdForFile(id, file));
    } catch (err) {
      if (stopped()) return;
      const message =
        err instanceof AnalysisError
          ? err.message
          : `분석하지 못했어요. 다른 영상으로 다시 시도해 주세요. (${errorMessage(err)})`;
      fileRef.current = null;
      setPhase({ kind: 'failed', message });
    }
  }

  // 어느 단계에서든 바로 멈출 수 있게, 분석이 신호를 확인하기를 기다리지 않고 화면을 먼저 되돌린다.
  function stop() {
    abortRef.current?.abort();
    resetAi();
    fileRef.current = null;
    setPhase({ kind: 'guide', notice: STOP_NOTICE });
  }

  const fileInputs = (
    <>
      <input
        ref={cameraRef}
        type="file"
        accept="video/*"
        capture="environment"
        hidden
        data-demo="record-camera-input"
        onChange={onFile}
      />
      <input ref={galleryRef} type="file" accept="video/*" hidden data-demo="record-gallery-input" onChange={onFile} />
    </>
  );

  if (phase.kind === 'guide' || phase.kind === 'failed') {
    return (
      <div className="rec-page">
        <SubHead title="영상 기록하기" titleRef={headingRef} fallback={`/p/children/${id}`} />
        {fileInputs}
        {/* Figma '기록하기': 포옹하는 두 모찌 → 큰 한 줄 → 부제 → 크림 단계 상자 → 두 버튼 → 작은 안내 */}
        <div className="rec-hero">
          <img src={`${import.meta.env.BASE_URL}art/mochi-hug.webp`} alt="" width={180} height={177} decoding="async" />
          <h2 className="rec-hero-title">평소처럼 함께 놀아 주세요</h2>
          <p className="rec-hero-sub">
            휴대폰을 세워 두고 두 사람이 함께 나오게 해 주세요.
            {nickname && <span className="rec-who"> 기록할 아이: {nickname}</span>}
          </p>
        </div>
        {aiNotice && (
          // 숫자 기록은 그대로 할 수 있다. AI 관찰 기록만 이번에는 만들지 않을 수 있다는 안내.
          <div className="notice" role="status" style={{ margin: '0 0 14px' }}>
            <p style={{ margin: 0 }}>
              {aiNotice} 숫자 기록은 지금도 그대로 남길 수 있어요. 그때까지 준비되지 않으면 장면 사진은 보내지 않아요.
            </p>
            <button
              type="button"
              className="btn small secondary"
              style={{ marginTop: 8 }}
              data-demo="record-ai-recheck"
              aria-disabled={aiHealth.kind === 'checking' || undefined}
              onClick={() => {
                if (aiHealth.kind !== 'checking') void recheckAi();
              }}
            >
              {aiHealth.kind === 'checking' ? '확인하는 중…' : 'AI 서버 다시 확인'}
            </button>
          </div>
        )}
        {phase.kind === 'guide' && phase.notice && (
          <p ref={messageRef} className="notice" role="status" tabIndex={-1} style={{ margin: '0 0 14px' }}>
            {phase.notice}
          </p>
        )}
        {phase.kind === 'failed' && (
          // role="alert"는 두지 않는다. 단계가 바뀌면 초점이 이 문장으로 와서 한 번만 읽힌다.
          <p ref={messageRef} className="error" tabIndex={-1} style={{ margin: '0 0 14px' }}>
            {phase.message}
          </p>
        )}
        <section className="rec-steps" aria-labelledby="record-steps-title">
          <h2 id="record-steps-title" className="sr-only">
            이렇게 찍어 주세요
          </h2>
          <ol>
            <li>휴대폰을 선반이나 거치대에 세워 두세요</li>
            <li>조용하고 밝은 곳에서 1~3분 함께 놀아요</li>
            <li>영상은 기기 안에서만 분석돼요</li>
          </ol>
        </section>
        <div className="rec-actions">
          <button type="button" className="btn block" data-demo="record-camera" onClick={() => cameraRef.current?.click()}>
            지금 촬영하기
          </button>
          <button
            type="button"
            className="btn block secondary"
            data-demo="record-gallery"
            onClick={() => galleryRef.current?.click()}
          >
            앨범에서 영상 고르기
          </button>
        </div>
        {/* 무엇이 기기 밖으로 나가는지와 데이터 안내. 시연이 이 문장을 가리킨다(record-lead). */}
        <p className="rec-note" data-demo="record-lead">
          {aiAgreed
            ? '영상 원본과 소리는 이 기기에서 분석해요. 숫자 3개를 저장하고, 장면 사진 최대 6장을 AI 서버로 보내 살펴본 뒤 지워요. 가정의 AI 관찰 기록을 공유하면 연결된 선생님이 관찰 문장과 대응 근거를 검토해 보내요.'
            : '영상은 이 폰 안에서만 분석하고, 서버에는 숫자 3개만 보내요.'}{' '}
          처음 분석할 때는 분석 도구(약 17MB)를 내려받아요. 와이파이 연결을 권해요. 분석하는 동안 화면을 켜 두세요.
        </p>
      </div>
    );
  }

  if (phase.kind === 'analyzing') {
    const p = overallProgress(phase.stage, phase.ratio);
    const pct = Math.round(p * 100);
    const label = STAGE_LABEL[phase.stage];
    // 'done'은 목록에 없으므로 모두 끝난 것으로 센다.
    const nowIndex = phase.stage === 'done' ? STAGE_STEPS.length : STAGE_STEPS.findIndex((s) => s.stage === phase.stage);
    return (
      <div className="rec-page rec-analyzing">
        {/* Figma '기록 분석 중': 포옹하는 두 모찌 + 돋보기 → 큰 한 줄 → 노란 진행 막대 → 분석 중단 */}
        <div className="rec-hero">
          <span className="rec-hero-art">
            <img src={`${import.meta.env.BASE_URL}art/mochi-hug.webp`} alt="" width={180} height={177} decoding="async" />
            <img className="rec-lens" src={`${import.meta.env.BASE_URL}art/magnifier.webp`} alt="" width={80} height={85} decoding="async" />
          </span>
          <h1 ref={headingRef} tabIndex={-1} className="rec-hero-title">
            함께한 순간을 살펴보고 있어요
          </h1>
          <p className="rec-hero-sub">
            앱을 닫지 않고 잠시만 기다려 주세요.{' '}
            {aiAgreed
              ? '영상 원본과 소리는 이 폰 밖으로 나가지 않아요. 분석이 끝나면 장면 사진만 AI 서버로 보내요.'
              : '영상은 이 폰 밖으로 나가지 않아요.'}
          </p>
        </div>
        {/* 단계가 바뀔 때만 읽히게, 단계 이름만 담는다(퍼센트마다 읽지 않는다). */}
        <p className="sr-only" role="status">
          {label}
        </p>
        <section className="rec-progress">
          {/* 진행 막대 위를 따라 걷는 작은 모찌(꾸밈). 움직임이 꺼져 있으면 제자리에 서 있다(parent-motion.css). */}
          <div className="rec-walk" aria-hidden="true" style={{ ['--p' as string]: p }}>
            <span className="rec-walk-mover">
              <span className="rec-walk-bob">
                <Mascot name="dome" size={44} />
              </span>
            </span>
          </div>
          <div
            className="progress"
            role="progressbar"
            aria-label="분석 진행"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-valuetext={`${label} ${pct}%`}
          >
            <div style={{ width: `${p * 100}%` }} />
          </div>
          <div className="rec-progress-meta">
            <span>{label}</span>
            <span aria-hidden="true">{pct}%</span>
          </div>
          <ol className="stage-list" data-demo="record-stages">
            {STAGE_STEPS.map((s, i) => {
              const state = i < nowIndex ? 'done' : i === nowIndex ? 'now' : undefined;
              return (
                <li key={s.stage} className={state} aria-current={state === 'now' ? 'step' : undefined}>
                  <span>
                    {/* 끝난 단계에는 ✓가 톡 나타난다(꾸밈, 뜻은 '끝났어요'가 전한다). */}
                    {state === 'done' && (
                      <span className="stage-check" aria-hidden="true">
                        ✓
                      </span>
                    )}
                    {s.label}
                  </span>
                  <span>{state === 'done' ? '끝났어요' : state === 'now' ? '살펴보는 중' : ''}</span>
                </li>
              );
            })}
          </ol>
        </section>
        <button type="button" className="btn secondary block" data-demo="record-stop" onClick={stop}>
          분석 중단
        </button>
      </div>
    );
  }

  if (phase.kind === 'sending') {
    return (
      <div>
        <h1 ref={headingRef} tabIndex={-1}>
          {phase.error ? '기록을 저장하지 못했어요' : '기록을 저장하는 중이에요'}
        </h1>
        {phase.error ? (
          <>
            <ErrorText error={phase.error} />
            <p className="muted">
              분석한 숫자는 이 화면에 남아 있어요. 연결을 확인하고 다시 보내 주세요. 화면을 나가면 이번 분석 숫자는
              저장되지 않아요.
            </p>
            <div className="stack">
              <button type="button" className="btn block" onClick={() => void send(phase.metrics, phase.clientRecordId)}>
                다시 보내기
              </button>
              <Link to={`/p/children/${id}`} className="btn block ghost">
                저장하지 않고 아이 홈으로
              </Link>
            </div>
          </>
        ) : (
          <>
            <div className="spinner" role="status" aria-label="저장하는 중" />
            <p className="muted" style={{ margin: 0 }}>
              분석한 숫자 3개만 보내고 있어요.
            </p>
          </>
        )}
      </div>
    );
  }

  const { record, coaching } = phase.data;
  const msg = aiAgreed ? { title: '영상의 수치 기록을 남겼어요', body: '' } : TREND_MESSAGE[record.changeTrend];
  return (
    // rec-result: 제목 → 숫자 → 안내 → 코칭 순서대로 떠오른다(parent-motion.css, 움직임이 켜져 있을 때만).
    <div className="rec-page rec-result">
      <SubHead title="분석 결과" fallback={`/p/children/${id}`} />
      <h2 ref={headingRef} tabIndex={-1} className="rec-result-title">
        {msg.title}
      </h2>
      {msg.body && <p className="rec-hero-sub" style={{ textAlign: 'left' }}>{msg.body}</p>}

      {/* Figma '분석 결과': 크림 숫자 칸 셋 → 회색 안내 상자 → 보랏빛 오늘의 코칭 → 확인하고 홈으로 */}
      <section aria-labelledby="record-today-title" data-demo="record-result">
        <h3 id="record-today-title" className="sr-only">
          오늘의 기록
        </h3>
        <div className="metrics rec-metrics">
          <div className="metric">
            <div className="label">함께한 시간</div>
            <div className="value">{formatDuration(record.jointPlaySeconds)}</div>
            {/* 들어간 면(surface-2) 위의 문장이라 ink-2로 읽기 쉽게 */}
            <div className="sub" style={SUB_STYLE}>
              {formatDuration(record.analyzedSeconds)} 중 {Math.round(record.jointPlayRatio * 100)}%
            </div>
          </div>
          <div className="metric">
            <div className="label">아이 소리에 답하기까지</div>
            <div className="value">{record.responseLatencySec != null ? `${record.responseLatencySec}초` : '–'}</div>
            <div className="sub" style={SUB_STYLE}>
              {record.responseLatencySec != null
                ? `${record.respondedBidCount}번 주고받았어요`
                : '이번 영상에선 살펴보기 어려웠어요'}
            </div>
          </div>
          <div className="metric">
            <div className="label">크게 운 횟수</div>
            <div className="value">{record.distressEpisodeCount}번</div>
            <div className="sub" style={SUB_STYLE}>
              영상 전체에서
            </div>
          </div>
        </div>
        <div className="rec-gray-note">
          <p>이 수치는 같은 아이의 기록 변화를 살펴보기 위한 참고 정보예요. 다른 아이와 비교하지 않아요.</p>
          {/* DS 규칙: 주의 문구는 화면 하단과 함께 결과 화면의 숫자 곁에도 그대로 싣는다. */}
          <p>{policies?.disclaimer ?? FALLBACK_DISCLAIMER}</p>
        </div>
      </section>

      {!aiAgreed && coaching.delivery && (
        <Link
          to={`/p/children/${id}/coaching/${coaching.delivery.id}`}
          state={{ delivery: coaching.delivery }}
          className="rec-coach-link"
        >
          <span className="rec-coach-label">오늘의 코칭</span>
          <strong>{coaching.delivery.card.title}</strong>
          <span className="rec-coach-line">{firstSentence(coaching.delivery.card.body)}</span>
          <ChevronIcon size={22} />
        </Link>
      )}

      {!aiAgreed && coaching.guidance && (
        <section className="card warm" data-demo="record-guidance">
          <p style={{ marginTop: 0 }}>{coaching.guidance.message}</p>
          <SupportList resources={coaching.guidance.resources} />
        </section>
      )}

      {/* AI 관찰 기록: 위의 지표 기록은 이미 저장되었다. 여기서 실패하거나 멈춰도 그 기록은 그대로 남는다. */}
      {ai.state.kind === 'done' ? (
        <>
          <h2>AI 관찰 기록</h2>
          <ObservationCard observation={ai.state.data.observation} childId={id} reviewAccess={reviewAccess} />
        </>
      ) : aiSkipped && ai.state.kind === 'idle' ? (
        <section className="card" aria-label="AI 관찰 기록">
          <p role="status" style={{ marginTop: 0 }}>
            {settledAiNotice ?? 'AI 서버를 확인하지 못했어요.'} 그래서 이번에는 AI 관찰 기록을 만들지 않았고, 장면
            사진도 보내지 않았어요. 오늘의 기록(숫자 3개)은 이미 저장되어 있어요.
          </p>
          {fileRef.current && (
            <button
              type="button"
              className="btn secondary block"
              data-demo="record-ai-retry"
              // 초점을 잃지 않게 disabled 대신 aria-disabled.
              aria-disabled={aiHealth.kind === 'checking' || undefined}
              onClick={() => {
                if (aiHealth.kind !== 'checking') void tryObservation(record.recordedAt);
              }}
            >
              {aiHealth.kind === 'checking' ? '확인하는 중…' : '다시 확인하고 관찰 기록 만들기'}
            </button>
          )}
        </section>
      ) : (
        <ObservationRunStatus
          state={ai.state}
          workingTitle="AI 관찰 기록을 만드는 중이에요 (1~2분 걸릴 수 있어요)"
          reassurance="오늘의 기록(숫자 3개)은 이미 저장되어 있어요."
          onStop={ai.stop}
          onRetry={fileRef.current ? () => makeObservation(record.recordedAt) : undefined}
        />
      )}

      {/* replace: 저장을 마친 기록 화면은 방문 기록에서 뺀다(앱의 뒤로 가기가 끝난 기록 화면으로 돌아가지 않게). */}
      <Link to={`/p/children/${id}`} replace className="btn block" data-demo="record-done">
        확인하고 홈으로
      </Link>
    </div>
  );
}
