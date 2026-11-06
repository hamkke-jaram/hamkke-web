import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, errorMessage } from '../../api/client';
import type { SaveRecordResponse } from '../../api/types';
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
import { CoachingCardView, ErrorText, SupportList, formatDuration } from '../../components/ui';

type Phase =
  | { kind: 'guide' }
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

  useEffect(() => {
    preloadModel();
    return () => abortRef.current?.abort();
  }, []);

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
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setPhase({ kind: 'analyzing', stage: 'loading-model', ratio: 0 });
    try {
      const metrics = await analyzeVideo(file, (stage, ratio) => setPhase({ kind: 'analyzing', stage, ratio }), {
        signal: ctrl.signal,
        runAudio: runAudioInWorker,
      });
      await send(metrics, crypto.randomUUID());
    } catch (err) {
      const message =
        err instanceof AnalysisError
          ? err.message
          : `분석하지 못했어요. 다른 영상으로 다시 시도해 주세요. (${errorMessage(err)})`;
      setPhase({ kind: 'failed', message });
    }
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
        <p className="lead">영상은 이 폰 안에서만 분석하고, 서버에는 숫자 3개만 보내요.</p>
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
          처음 분석할 때는 분석 도구(약 6MB)를 내려받아요. 와이파이 연결을 권해요. 분석하는 동안 화면을 켜 두세요.
        </p>
      </div>
    );
  }

  if (phase.kind === 'analyzing') {
    const p = overallProgress(phase.stage, phase.ratio);
    return (
      <div>
        <h1>살펴보는 중이에요</h1>
        <p className="lead">영상은 이 폰 밖으로 나가지 않아요.</p>
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
        <button
          className="btn secondary block"
          onClick={() => {
            abortRef.current?.abort();
          }}
        >
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

      <Link to={`/p/children/${id}`} className="btn block">
        확인했어요
      </Link>
    </div>
  );
}
