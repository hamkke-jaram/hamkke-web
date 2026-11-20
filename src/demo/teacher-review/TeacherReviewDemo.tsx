import { useEffect, useRef, useState, type ReactNode, type RefObject, type SyntheticEvent } from 'react';
import { Link } from 'react-router-dom';
import { MAX_FRAMES, sampleFramesFromFile, type VideoRange } from '../../ai/frames';
import { formatClock } from '../../ai/labels';
import { guidanceOptionsFor } from '../../ai/momentGuidance.mjs';
import type { ObservationContent } from '../../api/types';
import type { TeacherGuidance as Guidance, TeacherSupport as Support } from '../../../scripts/teacher-review/recheck.mjs';
import BrandMark from '../../components/BrandMark';
import { TextAreaField } from '../../components/feedback';
import VIDEO from './media/block-play.mp4?url';
import POSTER from './media/block-play.jpg?url';
import './teacherReviewDemo.css';

const ENDPOINT = '/__demo/teacher-review';
const RECIPIENT = '시연 담당 선생님';

type Stage = 'parent' | 'teacher' | 'published';
type ShareMode = 'whole' | 'clip';
type Analysis = {
  observation: ObservationContent;
  modelVersion: string;
  promptVersion: string;
  frames: number[];
};
type Case = Analysis & { range: VideoRange; mode: ShareMode };
type Evidence = { observations: { timeSec: number; note: string }[]; observationSummary?: string };
type CheckKind = 'SUPPORTED' | 'NEEDS_EVIDENCE' | 'TEACHER_CONTEXT' | 'WORDING';
type ReviewResult = {
  model: string;
  source: 'ollama';
  summary: string;
  checks: { kind: CheckKind; detail: string; timeSec: number | null }[];
};
type Draft = { observation: string; teacherContext: string; support: string };
const EMPTY_DRAFT: Draft = { observation: '', teacherContext: '', support: '' };
const RESPONSE_LABEL: Record<Guidance['decision'], string> = {
  WAIT: '먼저 기다려 보기',
  OFFER: '도움 제안하기',
  CHECK: '상황 먼저 확인하기',
  SAFETY: '먼저 안전 확보',
};
const CHECK_LABEL: Record<CheckKind, string> = {
  SUPPORTED: 'AI 기록의 문장과 일치',
  NEEDS_EVIDENCE: '근거 확인',
  TEACHER_CONTEXT: '교사 관찰',
  WORDING: '표현 제안',
};

function clock(seconds: number) {
  const tenth = Math.round(Math.max(0, seconds) * 10);
  return formatClock(Math.floor(tenth / 10)) + (tenth % 10 === 0 ? '' : '.' + (tenth % 10));
}

function evidenceOf(record: Analysis): Evidence {
  return {
    observations: record.observation.moments.map(({ t, note }) => ({ timeSec: t, note })),
    observationSummary: record.observation.summary ?? undefined,
  };
}

function guidanceForDraft(row: Guidance) {
  const moment = row.timeSec === null ? '' : clock(row.timeSec) + ' · ';
  return moment + RESPONSE_LABEL[row.decision] + '\n' + row.action + '\n다음에 살펴볼 점 · ' + row.watchFor;
}

function initialGuidanceIndex(rows: Guidance[]) {
  return Math.max(0, rows.findIndex((row) => row.decision === 'SAFETY'));
}

function draftMomentAt(row: Guidance, observation: string, guidance: Guidance[]) {
  if (row.timeSec === null) return { edited: Boolean(row.evidence) && observation.trim() !== row.evidence.trim(), replacement: null };
  const lines = observation.split('\n').map((line) => line.trim()).filter(Boolean);
  const entries = lines.map((line) => {
    const match = /^(\d+):([0-5]\d(?:\.\d+)?)\s+(.+)$/.exec(line);
    return match ? { time: Number(match[1]) * 60 + Number(match[2]), note: match[3].trim() } : null;
  });
  const matches = entries.filter((entry) => entry !== null && entry.time === row.timeSec);
  const originalCount = guidance.filter((original) => original.timeSec === row.timeSec).length;
  const unique = originalCount === 1 && matches.length === 1;
  const entry = matches[0];
  const nextLine = entry && entries[entries.indexOf(entry) + 1];
  if (unique && entry && nextLine !== null) {
    return { edited: entry.note !== row.evidence, replacement: entry.note !== row.evidence ? entry.note : null };
  }
  return { edited: originalCount === 1 || !matches.some((match) => match?.note === row.evidence), replacement: null };
}

async function demoRequest<T>(action: string, body: object, signal: AbortSignal): Promise<T> {
  const response = await fetch(ENDPOINT + '/' + action, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) {
    const text = typeof result?.message === 'string' ? result.message : null;
    if (result?.code === 'DEMO_BUSY' || response.status === 429) {
      throw new Error('이 PC에서 이미 AI 요청을 처리하고 있어요. 잠시 후 다시 시도해 주세요.');
    }
    throw new Error(text ?? '로컬 AI에 연결하지 못했어요. Ollama가 실행 중인지 확인하고 다시 시도해 주세요.');
  }
  return result as T;
}

function VideoEvidence({ range, initialTime, onDuration, onPosition, videoRef, children }: {
  range?: VideoRange;
  initialTime?: number;
  onDuration?: (duration: number) => void;
  onPosition?: (seconds: number) => void;
  videoRef?: RefObject<HTMLVideoElement>;
  children?: (jump: (seconds: number) => void, position: number) => ReactNode;
}) {
  const ownRef = useRef<HTMLVideoElement>(null);
  const player = videoRef ?? ownRef;
  const [position, setPosition] = useState(range?.start ?? 0);
  const start = range?.start ?? 0;
  const end = range?.end ?? Infinity;
  const startTime = Math.max(0, start);
  const clipEnd = Number.isFinite(end);

  function reportPosition(seconds: number) {
    setPosition(seconds);
    onPosition?.(seconds);
  }

  function seek(seconds: number) {
    const video = player.current;
    if (!video) return;
    const target = Math.max(startTime, Math.min(end, seconds));
    video.currentTime = target;
    reportPosition(target);
  }

  function keepInRange(event: SyntheticEvent<HTMLVideoElement>) {
    const video = event.currentTarget;
    if (!clipEnd) {
      reportPosition(video.currentTime);
      return;
    }
    if (video.currentTime < startTime) {
      seek(startTime);
    } else if (video.currentTime >= end) {
      video.pause();
      if (video.currentTime > end) seek(end);
      else reportPosition(end);
    } else {
      reportPosition(video.currentTime);
    }
  }

  return (
    <>
      <div className="review-player">
        <video
          ref={player}
          src={VIDEO}
          poster={range?.start ? undefined : POSTER}
          aria-label="예제 블록 쌓기 관찰 영상"
          controls
          muted
          playsInline
          preload="metadata"
          onLoadedMetadata={(event) => {
            onDuration?.(event.currentTarget.duration);
            if (initialTime !== undefined || startTime > 0) seek(initialTime ?? startTime);
          }}
          onTimeUpdate={keepInRange}
          onSeeking={keepInRange}
          onPlay={(event) => {
            if (clipEnd && event.currentTarget.currentTime >= end) seek(startTime);
          }}
        />
        <div className="review-player-legend">
          <span>{range ? '공유 재생 구간' : '예제 영상'}</span>
          <span className="review-clock">
            {clock(position)}{range && '  /  ' + clock(startTime) + '–' + clock(end)}
          </span>
        </div>
      </div>
      {children?.(seek, position)}
    </>
  );
}

function ReportField({ title, text }: { title: string; text: string }) {
  if (!text.trim()) return null;
  return (
    <section className="review-report-field">
      <h3>{title}</h3>
      <p>{text}</p>
    </section>
  );
}

export default function TeacherReviewDemo() {
  const [stage, setStage] = useState<Stage>('parent');
  const [mode, setMode] = useState<ShareMode>('whole');
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState('4');
  const [end, setEnd] = useState('12');
  const [record, setRecord] = useState<Case | null>(null);
  const [suggestions, setSuggestions] = useState<Support | null>(null);
  const [guidanceIndex, setGuidanceIndex] = useState(0);
  const [correctedGuidance, setCorrectedGuidance] = useState<Record<number, Guidance>>({});
  const [copiedGuidance, setCopiedGuidance] = useState<Guidance[]>([]);
  const guidanceHeading = useRef<HTMLHeadingElement>(null);
  const teacherPlayer = useRef<HTMLVideoElement>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [review, setReview] = useState<{ snapshot: Draft; result: ReviewResult } | null>(null);
  const [publication, setPublication] = useState<Draft | null>(null);
  const [task, setTask] = useState<'frames' | 'analysis' | 'support' | 'review' | null>(null);
  const [problem, setProblem] = useState('');
  const [supportProblem, setSupportProblem] = useState('');
  const currentRequest = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => () => currentRequest.current?.abort(), []);
  useEffect(() => { heading.current?.focus(); }, [stage]);

  const range = mode === 'whole' ? { start: 0, end: duration } : { start: Number(start), end: Number(end) };
  const validRange = duration > 0 && Number.isFinite(range.start) && Number.isFinite(range.end) &&
    range.start >= 0 && range.end <= duration && range.end - range.start >= 2 &&
    (mode === 'whole' || (!!start.trim() && !!end.trim()));
  const currentReview = review?.snapshot === draft ? review.result : null;
  const guidance = suggestions?.guidance ?? [];
  const activeGuidance = guidance[guidanceIndex];
  const draftMoments = guidance.map((row) => draftMomentAt(row, draft.observation, guidance));
  const activeEdit = draftMoments[guidanceIndex];
  const corrected = correctedGuidance[guidanceIndex];
  const applicable = activeEdit?.edited ? (corrected?.evidence === activeEdit.replacement ? corrected : null) : activeGuidance;
  const suggestedText = applicable ? guidanceForDraft(applicable) : '';
  const supportParagraphs = draft.support.split('\n\n');
  const outdatedCopies = copiedGuidance.filter((row) => supportParagraphs.includes(guidanceForDraft(row)) &&
    draftMomentAt(row, draft.observation, guidance).edited);
  const previousCopy = applicable && guidance.filter((row) => row.timeSec === applicable.timeSec).length === 1
    ? outdatedCopies.find((row) => row.timeSec === applicable.timeSec) : undefined;
  const previousText = previousCopy && guidanceForDraft(previousCopy);
  const supportWithSuggestion = previousText
    ? supportParagraphs.map((text) => text === previousText ? suggestedText : text).join('\n\n')
    : [draft.support, suggestedText].filter((text) => text.trim()).join('\n\n');
  const alreadyCopied = supportParagraphs.includes(suggestedText) && !previousCopy;
  const readyForReview = Boolean(draft.observation.trim() && draft.support.trim());
  const busyMessage = task === 'frames'
    ? '선택한 영상에서 장면 사진을 고르고 있어요.'
    : task === 'analysis'
      ? '이 PC의 AI가 장면 사진을 살펴보고 있어요.'
      : task === 'support'
        ? '각 장면에서 어른이 해볼 일과 다음에 살펴볼 점을 정리하고 있어요.'
        : task === 'review'
          ? 'LLM이 선생님의 수정본을 관찰 기록과 대조하고 있어요.'
          : '';

  function changeSelection() {
    setRecord(null);
    setSuggestions(null);
    setGuidanceIndex(0);
    setCorrectedGuidance({});
    setCopiedGuidance([]);
    setSupportProblem('');
    setProblem('');
  }

  async function loadSupport(analysis: Analysis, signal: AbortSignal) {
    setTask('support');
    setSupportProblem('');
    try {
      const response = await demoRequest<Support>('suggest', evidenceOf(analysis), signal);
      if (!Array.isArray(response.guidance) || !response.guidance.length) {
        throw new Error('장면별 대응 제안을 받지 못했어요.');
      }
      if (!signal.aborted) {
        setSuggestions(response);
        selectGuidance(initialGuidanceIndex(response.guidance), response.guidance);
      }
    } catch (error) {
      if (!signal.aborted) setSupportProblem(error instanceof Error ? error.message : '지원 제안을 받지 못했어요.');
    }
  }

  async function analyze() {
    if (task || !validRange) return;
    const controller = new AbortController();
    currentRequest.current = controller;
    setTask('frames');
    changeSelection();
    try {
      const response = await fetch(VIDEO, { signal: controller.signal });
      if (!response.ok) throw new Error('예제 영상을 불러오지 못했어요.');
      const video = new File([await response.blob()], 'block-play.mp4', { type: 'video/mp4' });
      const sampled = await sampleFramesFromFile(video, MAX_FRAMES, controller.signal, mode === 'clip' ? range : undefined);
      setTask('analysis');
      const analysis = await demoRequest<Analysis>('analyze', sampled, controller.signal);
      if (controller.signal.aborted) return;
      setRecord({ ...analysis, range, mode });
      await loadSupport(analysis, controller.signal);
    } catch (error) {
      if (!controller.signal.aborted) setProblem(error instanceof Error ? error.message : '관찰 기록을 만들지 못했어요.');
    } finally {
      if (!controller.signal.aborted) setTask(null);
      if (currentRequest.current === controller) currentRequest.current = null;
    }
  }

  async function retrySupport() {
    if (!record || task) return;
    const controller = new AbortController();
    currentRequest.current = controller;
    await loadSupport(record, controller.signal);
    if (!controller.signal.aborted) setTask(null);
    if (currentRequest.current === controller) currentRequest.current = null;
  }

  function requestTeacherReview() {
    if (!record || task) return;
    setDraft({
      observation: record.observation.moments.length
        ? record.observation.moments.map(({ t, note }) => clock(t) + ' ' + note).join('\n')
        : record.observation.summary ?? '',
      teacherContext: '',
      support: '',
    });
    setProblem('');
    setStage('teacher');
  }

  function followVideo(seconds: number) {
    const currentMoment = guidance.reduce<number | null>((previous, row) =>
      row.timeSec !== null && row.timeSec <= seconds && (previous === null || row.timeSec > previous)
        ? row.timeSec : previous, null);
    setGuidanceIndex((selected) => {
      if (guidance[selected]?.timeSec === currentMoment) return selected;
      return Math.max(0, guidance.findIndex((row) => row.timeSec === currentMoment));
    });
  }

  function selectGuidance(index: number, rows = guidance) {
    const row = rows[index];
    if (!row) return;
    setGuidanceIndex(index);
    if (teacherPlayer.current && teacherPlayer.current.readyState >= 1 && row.timeSec !== null) {
      teacherPlayer.current.pause();
      teacherPlayer.current.currentTime = row.timeSec;
    }
  }

  function showCorrectedGuidance(index: number) {
    const note = draftMoments[index]?.replacement;
    if (!note) return;
    const row = { ...guidanceOptionsFor(note)[0], timeSec: guidance[index].timeSec, evidence: note };
    setCorrectedGuidance({ ...correctedGuidance, [index]: row });
    selectGuidance(index);
    guidanceHeading.current?.focus();
  }

  function useGuidance() {
    if (!applicable || alreadyCopied || supportWithSuggestion.length > 1000) return;
    setDraft({ ...draft, support: supportWithSuggestion });
    setCopiedGuidance([...copiedGuidance.filter((row) => row !== previousCopy && supportParagraphs.includes(guidanceForDraft(row))), applicable]);
  }

  async function recheck() {
    if (!record || task || !readyForReview) return;
    const controller = new AbortController();
    const snapshot = draft;
    currentRequest.current = controller;
    setTask('review');
    setProblem('');
    setReview(null);
    try {
      const result = await demoRequest<ReviewResult>('recheck', {
        ...evidenceOf(record),
        teacherDraft: snapshot.observation,
        teacherContext: snapshot.teacherContext,
        proposedSupport: snapshot.support,
      }, controller.signal);
      if (!controller.signal.aborted) setReview({ snapshot, result });
    } catch (error) {
      if (!controller.signal.aborted) setProblem(error instanceof Error ? error.message : '수정본을 다시 확인하지 못했어요.');
    } finally {
      if (!controller.signal.aborted) setTask(null);
      if (currentRequest.current === controller) currentRequest.current = null;
    }
  }

  function publish() {
    if (!currentReview || !readyForReview || task) return;
    setPublication(draft);
    setStage('published');
  }

  function restart() {
    changeSelection();
    setMode('whole');
    setStart('4');
    setEnd('12');
    setReview(null);
    setDraft(EMPTY_DRAFT);
    setPublication(null);
    setStage('parent');
  }

  return (
    <div className="review-demo">
      <header className="review-top">
        <Link to="/demo" className="review-brand"><BrandMark /></Link>
        <span>로컬 시연 · 예제 영상</span>
      </header>
      <main className="review-main">
        <ol className="review-steps" aria-label="검토 진행 단계">
          <li aria-current={stage === 'parent' ? 'step' : undefined}>보호자 요청</li>
          <li aria-current={stage === 'teacher' ? 'step' : undefined}>교사 검토</li>
          <li aria-current={stage === 'published' ? 'step' : undefined}>보호자 최종본</li>
        </ol>
        {stage === 'parent' && (
          <>
            <h1 ref={heading} tabIndex={-1}>영상 관찰과 교사 검토</h1>
            <p className="review-lead">영상을 분석하면 선생님이 각 장면을 보며 언제 기다려 주고 어떻게 도와줄지 검토해요.</p>
            <div className="review-grid">
              <section className="review-card">
                <h2>영상 미리보기</h2>
                <VideoEvidence onDuration={(value) => {
                  if (Number.isFinite(value) && value > 0) setDuration(Math.floor(value * 10) / 10);
                }} />
                <p className="review-detail">예제로 제작한 손과 블록 영상이에요. 실제 아동 영상은 사용하지 않아요.</p>
              </section>
              <section className="review-card review-setup">
                <h2>교사에게 보여줄 영상</h2>
                <fieldset className="review-choice" disabled={task !== null}>
                  <legend className="review-visually-hidden">공유 범위</legend>
                  <label>
                    <input type="radio" name="share-range" checked={mode === 'whole'} onChange={() => { changeSelection(); setMode('whole'); }} />
                    <span><strong>영상 전체</strong>{duration > 0 && <small>{clock(0)}–{clock(duration)}</small>}</span>
                  </label>
                  <label>
                    <input type="radio" name="share-range" checked={mode === 'clip'} onChange={() => { changeSelection(); setMode('clip'); }} />
                    <span><strong>선택한 구간만</strong><small>시작·끝 시각을 직접 선택해요</small></span>
                  </label>
                </fieldset>
                {mode === 'clip' && (
                  <div className="review-range">
                    <label className="field">
                      <span>시작 (초)</span>
                      <input type="number" min="0" max={duration} step="0.1" value={start} disabled={task !== null}
                        onChange={(event) => { changeSelection(); setStart(event.target.value); }} />
                    </label>
                    <label className="field">
                      <span>끝 (초)</span>
                      <input type="number" min="0" max={duration} step="0.1" value={end} disabled={task !== null}
                        onChange={(event) => { changeSelection(); setEnd(event.target.value); }} />
                    </label>
                    {duration > 0 && !validRange && <p className="review-error">영상 안에서 2초 이상 구간을 선택해 주세요.</p>}
                  </div>
                )}
                <p className="review-recipient"><span>검토 대상</span> <strong>{RECIPIENT}</strong></p>
                <button type="button" className="btn block" onClick={() => void analyze()} disabled={task !== null || !validRange}>
                  {record ? '다시 분석하기' : 'AI 관찰 분석 시작'}
                </button>
                {busyMessage && <p className="review-callout" role="status">{busyMessage}</p>}
                {problem && <p className="review-error" role="alert">{problem}</p>}
                {record && (
                  <div className="review-ready">
                    <strong>장면 사진 {record.frames.length}장 분석 완료</strong>
                    <p>{record.observation.summary ?? '교사 화면에서 영상을 확인할 수 있어요.'}</p>
                    {suggestions && <p>담당 선생님이 관찰 기록과 대응 제안을 함께 검토할 수 있어요.</p>}
                    {supportProblem && <p className="review-detail">지원 제안은 교사 화면에서 다시 요청할 수 있어요.</p>}
                    <button type="button" className="btn block secondary" disabled={task !== null} onClick={requestTeacherReview}>
                      교사에게 검토 요청
                    </button>
                  </div>
                )}
              </section>
            </div>
          </>
        )}
        {stage === 'teacher' && record && (
          <>
            <h1 ref={heading} tabIndex={-1}>장면을 보고 어떻게 도울지 정해요</h1>
            <p className="review-lead">{RECIPIENT} · {record.mode === 'whole' ? '영상 전체' : '선택 구간'} · {clock(record.range.start)}–{clock(record.range.end)}</p>
            <div className="review-grid">
              <section className="review-card review-evidence">
                <h2>관찰 영상</h2>
                <VideoEvidence range={record.range} videoRef={teacherPlayer}
                  initialTime={guidance[initialGuidanceIndex(guidance)]?.timeSec ?? undefined} onPosition={followVideo}>
                  {(jump, position) => (
                    <details className="review-evidence-details">
                      <summary>분석한 시각과 관찰 원문</summary>
                      <h3>AI가 살펴본 시각</h3>
                      <div className="review-timestamps" aria-label="분석한 장면">
                        {record.frames.map((t) => (
                          <button key={t} type="button" className="btn ghost" onClick={() => jump(t)}>{clock(t)}</button>
                        ))}
                      </div>
                      <h3>시각별 관찰</h3>
                      {record.observation.moments.length ? (
                        <ol className="review-moments">
                          {record.observation.moments.map(({ t, note }, index, items) => (
                            <li key={index}>
                              <button type="button" onClick={() => {
                                const linkedIndex = guidance.findIndex((row) => row.timeSec === t && row.evidence === note);
                                if (linkedIndex >= 0) selectGuidance(linkedIndex);
                                else jump(t);
                              }}
                                aria-current={(activeGuidance
                                  ? activeGuidance.timeSec === t && activeGuidance.evidence === note
                                  : position >= t && position < (items[index + 1]?.t ?? Infinity)) ? 'time' : undefined}>
                                <time>{clock(t)}</time><span>{note}</span>
                              </button>
                            </li>
                          ))}
                        </ol>
                      ) : <p className="review-detail">AI가 남긴 시각별 문장이 없어요. 위 시각을 눌러 영상을 직접 확인해 주세요.</p>}
                      <div className="review-ai-summary">
                        <h3>AI 관찰 초안</h3>
                        <p>{record.observation.summary ?? '요약을 만들지 않았어요.'}</p>
                        <small>{record.modelVersion} · 장면 사진 {record.frames.length}장</small>
                      </div>
                    </details>
                  )}
                </VideoEvidence>
              </section>
              <section className="review-card review-guidance" aria-labelledby="review-guidance-heading">
                <h2 id="review-guidance-heading" tabIndex={-1} ref={guidanceHeading}>이 장면에서 어떻게 도울까요?</h2>
                {activeGuidance && (
                  <>
                    <div className="review-guidance-nav">
                      <button type="button" className="btn ghost small" disabled={guidanceIndex === 0}
                        onClick={() => selectGuidance(guidanceIndex - 1)}>이전 장면</button>
                      <span>장면 {guidanceIndex + 1} / {guidance.length}</span>
                      <button type="button" className="btn ghost small" disabled={guidanceIndex + 1 >= guidance.length}
                        onClick={() => selectGuidance(guidanceIndex + 1)}>다음 장면</button>
                    </div>
                    <div className="review-guidance-evidence">
                      <small>{activeGuidance.timeSec === null ? '관찰 요약' : 'AI 관찰 · ' + clock(activeGuidance.timeSec)}</small>
                      <p>{activeGuidance.evidence || '이 장면에는 AI가 기록한 관찰 문장이 없어요.'}</p>
                    </div>
                    {activeEdit?.replacement && activeGuidance.timeSec !== null && <div className="review-guidance-evidence">
                      <small>교사가 수정한 관찰 · {clock(activeGuidance.timeSec)}</small>
                      <p>{activeEdit.replacement}</p>
                    </div>}
                    {applicable ? (
                      <>
                        <div className="review-response">
                          <span>지금 어른이 해볼 일</span>
                          <h3>{RESPONSE_LABEL[applicable.decision]}</h3>
                          <p>{applicable.action}</p>
                        </div>
                        <h3 className="review-follow-up">다음에 살펴볼 점</h3>
                        <p>{applicable.watchFor}</p>
                        <button type="button" className="btn secondary" disabled={alreadyCopied || supportWithSuggestion.length > 1000}
                          onClick={useGuidance}>
                          {alreadyCopied ? '의견에 담았어요' : previousCopy ? '초안의 이전 대응을 이 제안으로 바꾸기' : '이 대응을 보호자 의견 초안에 담기'}
                        </button>
                        <small className="review-guidance-source">{activeEdit.edited
                          ? '교사가 수정한 관찰에 맞춘 기본 제안이에요.'
                          : suggestions?.source === 'ollama' ? 'AI가 관찰 원문에 맞춰 고른 제안이에요.' : '관찰 원문에 맞춘 기본 제안이에요.'}</small>
                      </>
                    ) : activeEdit?.replacement ? (
                      <button type="button" className="btn secondary" onClick={() => showCorrectedGuidance(guidanceIndex)}>수정한 관찰로 대응 보기</button>
                    ) : <p>수정한 문장과 이 장면의 시각을 짝짓기 어려워요. 영상을 보고 대응을 직접 적어 주세요.</p>}
                  </>
                )}
                {supportProblem && (
                  <div role="alert">
                    <p>{supportProblem} 영상을 확인한 뒤 대응 방법을 직접 적을 수도 있어요.</p>
                    <button type="button" className="btn ghost" disabled={task !== null} onClick={() => void retrySupport()}>지원 제안 다시 요청</button>
                  </div>
                )}
                {task === 'support' && <p role="status">{busyMessage}</p>}
              </section>
              <section className="review-card review-edit">
                <h2>보호자에게 보낼 의견</h2>
                <TextAreaField id="review-draft-observation" label="영상에서 확인한 행동" value={draft.observation}
                  rows={4} maxLength={1000} onChange={(event) => setDraft({ ...draft, observation: event.target.value })} />
                <div className="review-correction-links">
                  {guidance.map((row, index) => draftMoments[index].replacement && row.timeSec !== null && (
                    <button key={index} type="button" className="btn ghost small" onClick={() => showCorrectedGuidance(index)}>
                      {clock(row.timeSec)} 수정한 관찰로 대응 보기
                    </button>
                  ))}
                </div>
                <TextAreaField id="review-draft-context" label="기관에서 직접 본 내용 (선택)" value={draft.teacherContext}
                  rows={3} maxLength={1000} onChange={(event) => setDraft({ ...draft, teacherContext: event.target.value })} />
                <TextAreaField id="review-draft-support" label="가정·기관에서 해볼 대응과 살펴볼 점" value={draft.support}
                  hint={outdatedCopies.length
                    ? '담아 둔 대응의 근거가 된 관찰 문장을 수정했어요. 현재 장면에 맞는 대응인지 다시 살펴봐 주세요.'
                    : '장면에 맞는 제안을 담아 고치거나 직접 적어 주세요. 기다려 주기로 했다면 어떤 반응을 살펴볼지도 함께 적어 주세요.'}
                  rows={4} maxLength={1000} required onChange={(event) => setDraft({ ...draft, support: event.target.value })} />
                <button type="button" className="btn block secondary" onClick={() => void recheck()} disabled={task !== null || !readyForReview}>
                  수정본을 LLM에 재검토 요청
                </button>
                {task === 'review' && <p className="review-callout" role="status">{busyMessage}</p>}
                {problem && <p className="review-error" role="alert">{problem}</p>}
                {review && (
                  <section className="review-recheck">
                    <h3>{currentReview ? 'LLM 재검토 결과' : '이전 수정본의 재검토 결과'}</h3>
                    <p className="review-detail">수정본을 시각별 AI 기록과 대조했어요. 영상에서 확인한 최종 의견은 선생님이 정해요.</p>
                    {!currentReview && <p className="review-detail">의견을 바꿨어요. 전달하기 전에 현재 문장을 다시 검토해 주세요.</p>}
                    <p>{review.result.summary}</p>
                    <ul>
                      {review.result.checks.map(({ kind, detail, timeSec }, index) => (
                        <li key={index}>
                          <strong>{CHECK_LABEL[kind]}{timeSec !== null && ' · ' + clock(timeSec)}</strong>
                          <span>{detail}</span>
                        </li>
                      ))}
                    </ul>
                    <small>{review.result.model} · 선생님이 반영할 내용을 고릅니다.</small>
                  </section>
                )}
                <button type="button" className="btn block review-publish" onClick={publish} disabled={!currentReview || task !== null}>
                  최종 확인 후 보호자에게 전달
                </button>
              </section>
            </div>
          </>
        )}
        {stage === 'published' && publication && (
          <>
            <h1 ref={heading} tabIndex={-1}>선생님이 검토한 의견이 도착했어요</h1>
            <div className="review-report review-card">
              <p className="review-receipt">선생님 이야기 <strong>{RECIPIENT} 확인 완료</strong></p>
              <ReportField title="영상에서 확인한 행동" text={publication.observation} />
              <ReportField title="기관에서 직접 본 내용" text={publication.teacherContext} />
              <ReportField title="어떻게 돕고 무엇을 살펴볼까요?" text={publication.support} />
              <button type="button" className="btn secondary" onClick={restart}>처음부터 시연하기</button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
