import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import ObservationCard from '../../ai/ObservationCard';
import ObservationRunStatus from '../../ai/ObservationRunStatus';
import { MAX_FRAMES, sampleFramesFromFile } from '../../ai/frames';
import { useObservationRun } from '../../ai/useObservationRun';
import { api, errorMessage } from '../../api/client';
import type { AiConsent, SaveRecordResponse } from '../../api/types';
import { newUuid } from '../../api/uuid';
import { useAuth } from '../../auth/AuthContext';
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
import { CoachingCardView, ErrorText, SupportList, formatDuration, useLoad } from '../../components/ui';

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
  const id = Number(childId);
  const [phase, setPhase] = useState<Phase>({ kind: 'guide' });
  const abortRef = useRef<AbortController | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  // AI 관찰 기록: 보호자가 이 아이에 대해 켜 두었고 AI 서버가 설정된 경우에만 쓴다.
  // 동의 여부를 확인하지 못하면 꺼진 것으로 보고 사진을 한 장도 보내지 않는다.
  const { policies } = useAuth();
  const aiOn = policies?.aiObservationEnabled === true;
  const consent = useLoad(
    () => (aiOn ? api<AiConsent>('GET', `/children/${id}/ai-consent`).catch(() => null) : Promise.resolve(null)),
    [id, aiOn],
  );
  const aiAgreed = aiOn && consent.data?.agreed === true;
  const ai = useObservationRun(id);
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

  // 지표 기록이 저장되어 결과가 보인 뒤에만, 그리고 AI 동의가 있을 때만 한 번 시작한다.
  const savedRecordedAt = phase.kind === 'result' ? phase.data.record.recordedAt : null;
  useEffect(() => {
    if (!savedRecordedAt || !aiAgreed || aiStartedRef.current) return;
    aiStartedRef.current = true;
    makeObservation(savedRecordedAt);
  }, [savedRecordedAt, aiAgreed, makeObservation]);

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
    aiStartedRef.current = false;
    fileRef.current = file;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    // 멈춘 분석(또는 새 분석으로 바뀐 분석)은 진행 상황도 결과도 화면에 반영하지 않고, 서버로도 보내지 않는다.
    const stopped = () => ctrl.signal.aborted || abortRef.current !== ctrl;
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
      await send(metrics, newUuid()); // crypto.randomUUID()는 http 주소(LAN)에서는 없다
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
    setPhase({ kind: 'guide', notice: '분석을 멈췄어요. 아무것도 저장하거나 보내지 않았어요. 준비되면 언제든 다시 해 주세요.' });
  }

  const fileInputs = (
    <>
      <input ref={cameraRef} type="file" accept="video/*" capture="environment" hidden onChange={onFile} />
      <input ref={galleryRef} type="file" accept="video/*" hidden onChange={onFile} />
    </>
  );

  if (phase.kind === 'guide' || phase.kind === 'failed') {
    return (
      <div>
        {fileInputs}
        <h1>함께 논 영상 기록하기</h1>
        <p className="lead">
          {aiAgreed
            ? '영상 원본과 소리는 이 폰 안에서만 분석하고, 서버에는 숫자 3개만 보내요. AI 관찰 기록이 켜져 있어서, 분석이 끝나면 같은 영상의 장면 사진 최대 6장을 AI 서버로 보내 살펴본 뒤 바로 지워요.'
            : '영상은 이 폰 안에서만 분석하고, 서버에는 숫자 3개만 보내요.'}
        </p>
        {phase.kind === 'guide' && phase.notice && (
          <p className="muted" role="status">
            {phase.notice}
          </p>
        )}
        {phase.kind === 'failed' && (
          <p className="error" role="alert">
            {phase.message}
          </p>
        )}
        <section className="card soft">
          <h2>이렇게 찍어 주세요</h2>
          <ol className="steps">
            <li>폰을 선반이나 거치대에 세워 두세요.</li>
            <li>부모님과 아이 두 사람의 상반신이 함께 나오게 맞춰 주세요.</li>
            <li>평소처럼 1~3분 놀아 주세요. 조용한 곳이면 소리를 더 잘 살펴볼 수 있어요.</li>
          </ol>
        </section>
        <div className="stack">
          <button className="btn block" onClick={() => cameraRef.current?.click()}>
            지금 촬영하기
          </button>
          <button className="btn block secondary" onClick={() => galleryRef.current?.click()}>
            앨범에서 영상 고르기
          </button>
        </div>
        <p className="muted" style={{ marginTop: 16 }}>
          처음 분석할 때는 분석 도구(약 17MB)를 내려받아요. 와이파이 연결을 권해요. 분석하는 동안 화면을 켜 두세요.
        </p>
      </div>
    );
  }

  if (phase.kind === 'analyzing') {
    const p = overallProgress(phase.stage, phase.ratio);
    return (
      <div>
        <h1>살펴보는 중이에요</h1>
        <p className="lead">
          {aiAgreed
            ? '영상 원본과 소리는 이 폰 밖으로 나가지 않아요. 분석이 끝나면 장면 사진만 AI 서버로 보내요.'
            : '영상은 이 폰 밖으로 나가지 않아요.'}
        </p>
        <section className="card">
          <div className="row between" style={{ marginBottom: 8 }}>
            <strong>{STAGE_LABEL[phase.stage]}</strong>
            <span className="muted">{Math.round(p * 100)}%</span>
          </div>
          <div
            className="progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(p * 100)}
          >
            <div style={{ width: `${p * 100}%` }} />
          </div>
        </section>
        <button type="button" className="btn secondary block" onClick={stop}>
          멈추기
        </button>
      </div>
    );
  }

  if (phase.kind === 'sending') {
    return (
      <div>
        <h1>기록을 저장하는 중</h1>
        {phase.error ? (
          <>
            <ErrorText error={phase.error} />
            <p className="muted">분석한 숫자는 이 화면에 남아 있어요. 연결을 확인하고 다시 보내 주세요.</p>
            <button className="btn block" onClick={() => void send(phase.metrics, phase.clientRecordId)}>
              다시 보내기
            </button>
          </>
        ) : (
          <div className="spinner" role="status" aria-label="저장하는 중" />
        )}
      </div>
    );
  }

  const { record, coaching } = phase.data;
  const msg = TREND_MESSAGE[record.changeTrend];
  return (
    <div>
      <h1>{msg.title}</h1>
      {msg.body && <p className="lead">{msg.body}</p>}

      <section className="card">
        <h2>오늘의 기록</h2>
        <div className="metrics">
          <div className="metric">
            <div className="label">함께한 시간</div>
            <div className="value">{formatDuration(record.jointPlaySeconds)}</div>
            <div className="sub">
              {formatDuration(record.analyzedSeconds)} 중 {Math.round(record.jointPlayRatio * 100)}%
            </div>
          </div>
          <div className="metric">
            <div className="label">아이 소리에 답하기까지</div>
            <div className="value">{record.responseLatencySec != null ? `${record.responseLatencySec}초` : '–'}</div>
            <div className="sub">
              {record.responseLatencySec != null
                ? `${record.respondedBidCount}번 주고받았어요`
                : '이번 영상에선 살펴보기 어려웠어요'}
            </div>
          </div>
          <div className="metric">
            <div className="label">크게 운 횟수</div>
            <div className="value">{record.distressEpisodeCount}번</div>
            <div className="sub">영상 전체에서</div>
          </div>
        </div>
        <p className="muted" style={{ marginBottom: 0 }}>
          숫자는 같은 집의 변화를 보기 위한 기록이에요. 다른 아이와 비교하지 않아요.
        </p>
      </section>

      {coaching.delivery && <CoachingCardView card={coaching.delivery.card} />}

      {coaching.guidance && (
        <section className="card warm">
          <p style={{ marginTop: 0 }}>{coaching.guidance.message}</p>
          <SupportList resources={coaching.guidance.resources} />
        </section>
      )}

      {/* AI 관찰 기록: 위의 지표 기록은 이미 저장되었다. 여기서 실패하거나 멈춰도 그 기록은 그대로 남는다. */}
      {ai.state.kind === 'done' ? (
        <>
          <h2>AI 관찰 기록</h2>
          <ObservationCard observation={ai.state.data.observation} />
          {ai.state.data.coaching?.delivery && <CoachingCardView card={ai.state.data.coaching.delivery.card} />}
        </>
      ) : (
        <ObservationRunStatus
          state={ai.state}
          workingTitle="AI 관찰 기록을 만드는 중이에요 (1~2분 걸릴 수 있어요)"
          reassurance="오늘의 기록(숫자 3개)은 이미 저장되어 있어요."
          onStop={ai.stop}
          onRetry={fileRef.current ? () => makeObservation(record.recordedAt) : undefined}
        />
      )}

      <Link to={`/p/children/${id}`} className="btn block">
        확인했어요
      </Link>
    </div>
  );
}
