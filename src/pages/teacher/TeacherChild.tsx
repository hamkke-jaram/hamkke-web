import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { Link, useParams } from 'react-router-dom';
import ObservationList from '../../ai/ObservationList';
import { ApiError, api } from '../../api/client';
import type { Delivery, Goal, GoalStatus, Observation, SharedItem, SharedSummary } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { BackLink, DangerAction, Field, TextAreaField, refocus, useToast } from '../../components/feedback';
import { ErrorText, Loading, Section, WeeklyBars, WeeklyTable, formatAge, formatDate, useLoad } from '../../components/ui';

const STATUS_LABEL: Record<GoalStatus, string> = { IN_PROGRESS: '진행 중', ACHIEVED: '이뤘어요', ARCHIVED: '보관' };
/** 상태를 바꾼 뒤 잠깐 보여 줄 알림. 보관한 목표는 보호자 화면(아이 홈)에 보이지 않는다. */
const STATUS_TOAST: Record<GoalStatus, string> = {
  IN_PROGRESS: '다시 진행 중으로 바꿨어요.',
  ACHIEVED: '이룬 목표로 표시했어요.',
  ARCHIVED: '목표를 보관했어요. 보호자 화면에는 보이지 않아요.',
};
/** 주간 요약(숫자)으로 보이는 공유 항목. 카드·AI 관찰 기록·기관 촬영은 여기에 들지 않는다. */
const METRIC_ITEMS: SharedItem[] = ['JOINT_PLAY', 'RESPONSE_LATENCY', 'DISTRESS'];
/** 요약 줄에 보일 공유 항목 이름(보호자의 공유 설정 화면과 같은 이름). 기관 촬영은 허락이라 위의 안내로 따로 알린다. */
const SHARED_NAMES: [SharedItem, string][] = [
  ['JOINT_PLAY', '함께한 시간'],
  ['RESPONSE_LATENCY', '반응까지 걸린 시간'],
  ['DISTRESS', '크게 운 횟수'],
  ['COACHING_CARDS', '받은 코칭 카드'],
  ['AI_OBSERVATIONS', '가정의 AI 관찰 기록'],
];
/** 선생님 화면에 보여 줄 AI 관찰 기록 개수(최신순). */
const AI_LIST_LIMIT = 20;
/** 관찰 메모를 가져오는 개수(최신순). */
const NOTE_LIMIT = 30;

type Tab = 'records' | 'goals' | 'notes';
const TABS: { key: Tab; label: string }[] = [
  { key: 'records', label: '가정 기록' },
  { key: 'goals', label: '목표' },
  { key: 'notes', label: '관찰 메모' },
];

const TITLE_ID = 'tc-title';
const GOALS_HEADING = 'tc-goals-h';
const NOTES_HEADING = 'tc-notes-h';
const goalTitleId = (g: Goal) => `tc-goal-${g.id}-title`;

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function TeacherChild() {
  const { childId } = useParams();
  const id = Number(childId);
  const { user, policies } = useAuth();
  const toast = useToast();
  const aiOn = policies?.aiObservationEnabled === true;
  const summary = useLoad(() => api<SharedSummary>('GET', `/teacher/children/${id}/shared-summary?weeks=8`), [id]);
  const goals = useLoad(() => api<Goal[]>('GET', `/children/${id}/goals`), [id]);
  const notes = useLoad(() => api<Observation[]>('GET', `/children/${id}/observations?limit=${NOTE_LIMIT}`), [id]);
  const sharesCards = summary.data?.sharedItems.includes('COACHING_CARDS') ?? false;
  const cards = useLoad(
    () => (sharesCards ? api<Delivery[]>('GET', `/children/${id}/card-deliveries?limit=5`) : Promise.resolve([] as Delivery[])),
    [id, sharesCards],
  );

  // 탭을 옮겨도 쓰던 목표·메모는 남도록 상태는 화면 전체에 둔다.
  const [tab, setTab] = useState<Tab>('records');

  const [goalTitle, setGoalTitle] = useState('');
  const [goalDesc, setGoalDesc] = useState('');
  const [goalTitleError, setGoalTitleError] = useState<string | null>(null);
  const [goalFormError, setGoalFormError] = useState<unknown>(null);
  const [goalBusy, setGoalBusy] = useState(false);
  const [statusError, setStatusError] = useState<unknown>(null);
  const [statusBusy, setStatusBusy] = useState<number | null>(null);

  const [note, setNote] = useState('');
  const [noteDate, setNoteDate] = useState(today());
  const [noteDateError, setNoteDateError] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [noteFormError, setNoteFormError] = useState<unknown>(null);
  const [noteBusy, setNoteBusy] = useState(false);

  const goalTitleRef = useRef<HTMLInputElement>(null);
  const noteDateRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  /**
   * 누른 버튼이 사라지는 동작(상태 바꾸기·삭제) 뒤에 포커스를 둘 요소의 id.
   * 목록이 새로 그려진 뒤 그 요소가 화면에 있으면 옮긴다. 그사이 다른 탭으로 옮겨 없으면 버린다
   * (남겨 두면 나중에 그 탭을 다시 열 때 포커스를 빼앗는다).
   */
  const focusAfter = useRef<string | null>(null);

  useEffect(() => {
    const target = focusAfter.current;
    if (!target) return;
    focusAfter.current = null;
    document.getElementById(target)?.focus();
  });

  /**
   * '다시 불러오기'를 누르면 불러오는 동안 화면이 바뀌어 누른 버튼이 사라진다.
   * 불러오기가 끝나면(성공이든 실패든) 제목(h1)으로 포커스를 옮겨 새 화면을 읽게 한다.
   */
  const titleAfterReload = useRef(false);
  useEffect(() => {
    if (summary.loading || !titleAfterReload.current) return;
    titleAfterReload.current = false;
    document.getElementById(TITLE_ID)?.focus();
  }, [summary.loading]);

  // 들어온 화면에서도 돌아갈 길과 제목이 있도록, 불러오는 중·실패에도 뒤로 줄을 둔다.
  const back = <BackLink to="/t" label="연결된 아이" />;

  if (summary.loading) {
    return (
      <div>
        {back}
        <Loading />
      </div>
    );
  }
  if (summary.error || !summary.data) {
    // 보호자가 연결을 해제했거나 아이를 지우면 서버는 404를 준다. 다시 불러와도 소용없으니 목록으로 안내한다.
    const gone = summary.error instanceof ApiError && summary.error.status === 404;
    return (
      <div>
        {back}
        {gone ? (
          <>
            <h1 id={TITLE_ID} tabIndex={-1}>
              아이 정보를 볼 수 없어요
            </h1>
            <p className="lead">보호자와의 연결이 끊겼을 수 있어요. 연결된 아이 목록에서 다시 골라 주세요.</p>
            <Link to="/t" className="btn block">
              연결된 아이 목록으로
            </Link>
          </>
        ) : (
          <>
            <h1 id={TITLE_ID} tabIndex={-1}>
              아이 정보를 불러오지 못했어요
            </h1>
            <ErrorText error={summary.error ?? new Error('찾을 수 없어요.')} />
            <button
              type="button"
              className="btn block secondary"
              onClick={() => {
                titleAfterReload.current = true;
                summary.reload();
              }}
            >
              다시 불러오기
            </button>
          </>
        )}
      </div>
    );
  }
  const s = summary.data;
  const metricShared = s.sharedItems.some((i) => METRIC_ITEMS.includes(i));
  // 보호자가 '기관에서 촬영해 관찰 기록 남기기'를 켠 아이만 촬영할 수 있다(서버가 다시 확인한다).
  const canCapture = aiOn && s.sharedItems.includes('INSTITUTION_CAPTURE');
  // AI 서버가 꺼져 있어도 보호자가 공유한 AI 관찰 기록은 아래 목록에 그대로 보이므로 이름에서 빼지 않는다.
  const sharedNames = SHARED_NAMES.filter(([item]) => s.sharedItems.includes(item)).map(([, name]) => name);
  const nothingShared = sharedNames.length === 0;
  const me = user?.id;

  // ---------- 목표 ----------

  async function addGoal(e: FormEvent) {
    e.preventDefault();
    if (goalBusy) return;
    if (!goalTitle.trim()) {
      flushSync(() => {
        setGoalTitleError('목표를 한 줄로 써 주세요.');
        setGoalFormError(null);
      });
      refocus(goalTitleRef.current);
      return;
    }
    setGoalBusy(true);
    setGoalFormError(null);
    try {
      await api('POST', `/children/${id}/goals`, { title: goalTitle, description: goalDesc });
      setGoalTitle('');
      setGoalDesc('');
      toast('목표를 추가했어요.');
      goals.reload();
    } catch (err) {
      setGoalFormError(err);
    } finally {
      setGoalBusy(false);
    }
  }

  async function setStatus(g: Goal, status: GoalStatus) {
    // 한 번에 한 목표만 바꾼다(요청이 겹치면 응답 순서에 따라 상태가 잠깐 틀리게 보일 수 있다).
    if (statusBusy !== null) return;
    setStatusError(null);
    setStatusBusy(g.id);
    try {
      await api('PATCH', `/children/${id}/goals/${g.id}`, { status });
      // 누른 버튼이 사라지므로: 보관하면 목표 카드 제목으로, 아니면 바뀐 목표의 제목으로 포커스를 옮긴다.
      focusAfter.current = status === 'ARCHIVED' ? GOALS_HEADING : goalTitleId(g);
      goals.setData((cur) => (cur ? cur.map((x) => (x.id === g.id ? { ...x, status } : x)) : cur));
      toast(STATUS_TOAST[status]);
      goals.reload();
    } catch (err) {
      // 누른 버튼은 요청 중에 꺼져 포커스를 잃었다. 목표는 그대로 남아 있으니 그 제목으로 돌려 놓는다.
      focusAfter.current = goalTitleId(g);
      setStatusError(err);
    } finally {
      setStatusBusy(null);
    }
  }

  async function removeGoal(g: Goal) {
    // 실패하면 확인 상자 안에 오류가 보인다(DangerAction).
    await api('DELETE', `/children/${id}/goals/${g.id}`);
    focusAfter.current = GOALS_HEADING;
    goals.setData((cur) => (cur ? cur.filter((x) => x.id !== g.id) : cur));
    toast('목표를 삭제했어요.');
    goals.reload();
  }

  // ---------- 관찰 메모 ----------

  async function addNote(e: FormEvent) {
    e.preventDefault();
    if (noteBusy) return;
    const dateError = !noteDate ? '관찰한 날을 골라 주세요.' : noteDate > today() ? '오늘이나 지난 날을 골라 주세요.' : null;
    const textError = note.trim() ? null : '메모를 써 주세요.';
    if (dateError || textError) {
      flushSync(() => {
        setNoteDateError(dateError);
        setNoteError(textError);
        setNoteFormError(null);
      });
      refocus(dateError ? noteDateRef.current : noteRef.current);
      return;
    }
    setNoteBusy(true);
    setNoteFormError(null);
    try {
      await api('POST', `/children/${id}/observations`, { content: note, observedOn: noteDate });
      // 같은 날 메모를 이어 쓰기 쉽도록 날짜는 그대로 둔다.
      setNote('');
      toast('메모를 남겼어요.');
      notes.reload();
    } catch (err) {
      setNoteFormError(err);
    } finally {
      setNoteBusy(false);
    }
  }

  async function removeNote(n: Observation) {
    await api('DELETE', `/children/${id}/observations/${n.id}`);
    focusAfter.current = NOTES_HEADING;
    notes.setData((cur) => (cur ? cur.filter((x) => x.id !== n.id) : cur));
    toast('메모를 삭제했어요.');
    notes.reload();
  }

  // ---------- 그리기 ----------

  /** 처음 불러오는 중·불러오지 못함을 목록 자리에 보여 준다. 둘 다 아니면 null. */
  function loadState(load: { loading: boolean; error: unknown; data: unknown; reload: () => void }): ReactNode {
    if (load.loading && !load.data) return <Loading />;
    if (load.error && !load.data) {
      return (
        <>
          <ErrorText error={load.error} />
          <button type="button" className="btn small secondary" onClick={load.reload}>
            다시 불러오기
          </button>
        </>
      );
    }
    return null;
  }

  function goalRow(g: Goal) {
    const titleId = goalTitleId(g);
    const statusButton = (to: GoalStatus, label: string, className: string) =>
      g.status !== to && (
        <>
          <button
            type="button"
            className={className}
            aria-describedby={titleId}
            disabled={statusBusy !== null}
            onClick={() => void setStatus(g, to)}
          >
            {label}
          </button>{' '}
        </>
      );
    return (
      <div key={g.id} className="list-item" style={{ alignItems: 'flex-start' }}>
        <div className="item-body">
          <div className="row wrap" style={{ gap: 6 }}>
            <strong id={titleId} tabIndex={-1}>
              {g.title}
            </strong>
            <span className={g.status === 'ACHIEVED' ? 'chip brand' : 'chip'}>{STATUS_LABEL[g.status]}</span>
          </div>
          {g.description && (
            <p className="muted" style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>
              {g.description}
            </p>
          )}
          <span className="meta">{g.teacherName}</span>
          {/* 상태를 바꾸거나 지우는 건 목표를 쓴 선생님만 할 수 있다(서버도 확인한다). */}
          {g.teacherId === me && (
            <div style={{ marginTop: 6 }}>
              {statusButton('ACHIEVED', '이뤘어요', 'btn small secondary')}
              {statusButton('IN_PROGRESS', '다시 진행', 'btn small secondary')}
              {statusButton('ARCHIVED', '보관', 'btn small ghost')}
              <DangerAction
                label="삭제"
                triggerClassName="btn small ghost"
                describedBy={titleId}
                question="이 목표를 삭제할까요?"
                detail={g.status === 'ARCHIVED' ? '되돌릴 수 없어요.' : '보호자 화면에서도 사라지고 되돌릴 수 없어요.'}
                confirmLabel="삭제하기"
                busyLabel="삭제하는 중…"
                onConfirm={() => removeGoal(g)}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  function recordsPanel() {
    return (
      <>
        {/* 촬영 버튼은 이 탭에만 둔다. 목표·관찰 메모 탭에는 각자의 주된 버튼(추가·남기기)이 있다.
            촬영을 마치면 처음 탭(가정 기록)으로 돌아오므로 늘 이 자리에서 다시 찾을 수 있다. */}
        {canCapture && (
          <>
            <Link to={`/t/children/${id}/observe`} className="btn block" style={{ marginBottom: 8, minHeight: 56, fontSize: 17 }}>
              기관에서 관찰 기록하기
            </Link>
            <p className="muted" style={{ marginTop: 0, marginBottom: 16 }}>
              보호자가 허락한 아이예요. 카메라로 장면 사진 6장을 찍어 AI가 본 모습을 글로 남겨요. 다른 아이가 함께
              찍히지 않게 해 주세요.
            </p>
          </>
        )}

        {!nothingShared && (
          <p className="status-line" style={{ margin: '0 0 12px' }}>
            보호자가 공유한 항목: {sharedNames.join(' · ')}
          </p>
        )}

        <Section title="가정에서 공유한 기록">
          {!metricShared ? (
            <p className="muted" style={{ margin: 0 }}>
              {nothingShared
                ? '지금은 보호자가 공유한 항목이 없어요. 공유는 보호자가 앱에서 켤 수 있어요.'
                : '지금은 보호자가 공유한 기록 항목이 없어요. 공유는 보호자가 앱에서 켤 수 있어요.'}
            </p>
          ) : s.weeks.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              최근 8주 동안 기록이 없어요.
            </p>
          ) : (
            <>
              {s.sharedItems.includes('JOINT_PLAY') && (
                <>
                  <p className="muted" style={{ margin: '0 0 4px' }}>
                    주별 함께한 시간 비율
                  </p>
                  <WeeklyBars weeks={s.weeks} />
                </>
              )}
              <WeeklyTable weeks={s.weeks} />
            </>
          )}
        </Section>

        {sharesCards && cards.data && cards.data.length > 0 && (
          <Section title="가정에서 받은 코칭">
            <div>
              {cards.data.map((d) => (
                <div key={d.id} className="list-item coach-card" style={{ alignItems: 'flex-start' }}>
                  <div className="item-body">
                    <strong>{d.card.title}</strong>
                    <span className="meta">
                      {formatDate(d.deliveredAt)}
                      {d.triedAt && ' · 가정에서 해봤어요'}
                    </span>
                    <p style={{ margin: '6px 0 0' }}>{d.card.body}</p>
                    <div className="evidence">
                      <div>{d.card.evidenceTag}</div>
                      <div>
                        출처:{' '}
                        {d.card.sourceUrl ? (
                          <a href={d.card.sourceUrl} target="_blank" rel="noopener noreferrer">
                            {d.card.sourceTitle}
                          </a>
                        ) : (
                          d.card.sourceTitle
                        )}
                      </div>
                      <div>
                        작성: {d.card.author} · 검수: {d.card.reviewer ?? '전문가 검수 진행 중'}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* 기관에서 만든 기록은 항상, 가정에서 만든 기록은 보호자가 공유를 켠 경우에만 서버가 보내 준다.
            삭제는 자기가 만든 기록만 할 수 있어서, 다른 사람의 기록에는 버튼을 보여 주지 않는다.
            AI 서버가 꺼져 있어도(aiOn=false) 이미 있는 기록은 보고 지울 수 있게 목록은 남긴다(없으면 제목까지 숨긴다).
            기관에서 촬영하고 돌아오면 처음 탭(가정 기록)이 열리므로, 방금 남긴 기록이 바로 보이게 이 탭에 둔다. */}
        <ObservationList
          childId={id}
          limit={AI_LIST_LIMIT}
          canDelete={(o) => o.mine === true}
          hideWhenEmpty={!canCapture && !(aiOn && s.sharedItems.includes('AI_OBSERVATIONS'))}
          emptyText="아직 AI 관찰 기록이 없어요."
        />
      </>
    );
  }

  function goalsPanel() {
    const list = goals.data ?? [];
    const active = list.filter((g) => g.status !== 'ARCHIVED');
    const archived = list.filter((g) => g.status === 'ARCHIVED');
    return (
      <section className="card" aria-labelledby={GOALS_HEADING}>
        <h2 id={GOALS_HEADING} tabIndex={-1}>
          아이 목표
        </h2>
        <p className="muted" style={{ margin: '-2px 0 8px' }}>
          진행 중이거나 이룬 목표는 보호자 화면에도 보여요. 바꾸거나 지우는 건 목표를 쓴 선생님만 할 수 있어요.
        </p>
        {loadState(goals) ?? (
          <>
            <ErrorText error={statusError} />
            {active.length > 0 ? (
              <div>{active.map(goalRow)}</div>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                {archived.length > 0 ? '진행 중인 목표가 없어요.' : '아직 목표가 없어요.'}
              </p>
            )}
            {archived.length > 0 && (
              <details style={{ marginTop: 8, borderTop: '1px solid var(--line)' }}>
                <summary style={{ minHeight: 44 }}>보관한 목표 {archived.length}개</summary>
                <p className="muted" style={{ margin: '0 0 4px' }}>
                  보관한 목표는 보호자 화면에 보이지 않아요.
                </p>
                <div>{archived.map(goalRow)}</div>
              </details>
            )}
          </>
        )}

        <form onSubmit={addGoal} noValidate style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
          <Field
            id="tc-goal-title"
            ref={goalTitleRef}
            label="새 목표"
            type="text"
            maxLength={60}
            showCount
            placeholder="예: 놀이 시간에 친구에게 장난감 건네기"
            error={goalTitleError}
            value={goalTitle}
            onChange={(e) => {
              setGoalTitle(e.target.value);
              setGoalTitleError(null);
            }}
          />
          <TextAreaField
            id="tc-goal-desc"
            label="설명 (선택)"
            maxLength={500}
            showCount
            value={goalDesc}
            onChange={(e) => setGoalDesc(e.target.value)}
          />
          <ErrorText error={goalFormError} />
          <button type="submit" className="btn block" disabled={goalBusy}>
            {goalBusy ? '추가하는 중…' : '목표 추가'}
          </button>
        </form>
      </section>
    );
  }

  function notesPanel() {
    const list = notes.data ?? [];
    const heading = list.length >= NOTE_LIMIT ? `최근 메모 ${list.length}개` : list.length > 0 ? `메모 ${list.length}개` : '메모';
    return (
      <section className="card" aria-labelledby={NOTES_HEADING}>
        <h2 id={NOTES_HEADING} tabIndex={-1}>
          관찰 메모
        </h2>
        <p className="muted" style={{ margin: '-2px 0 12px' }}>
          남긴 메모는 보호자 화면에도 보여요.
        </p>
        <form onSubmit={addNote} noValidate>
          <Field
            id="tc-note-date"
            ref={noteDateRef}
            label="관찰한 날"
            type="date"
            max={today()}
            error={noteDateError}
            value={noteDate}
            onChange={(e) => {
              setNoteDate(e.target.value);
              setNoteDateError(null);
            }}
          />
          <TextAreaField
            id="tc-note-text"
            ref={noteRef}
            label="메모"
            maxLength={1000}
            showCount
            placeholder="잘한 점, 즐거워한 활동을 중심으로 적어 주세요."
            error={noteError}
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              setNoteError(null);
            }}
          />
          <ErrorText error={noteFormError} />
          <button type="submit" className="btn block" disabled={noteBusy}>
            {noteBusy ? '남기는 중…' : '메모 남기기'}
          </button>
        </form>

        <h3 style={{ margin: '20px 0 4px', paddingTop: 16, borderTop: '1px solid var(--line)' }}>{heading}</h3>
        {loadState(notes) ??
          (list.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              아직 남긴 메모가 없어요.
            </p>
          ) : (
            <div>
              {list.map((n) => {
                const textId = `tc-note-${n.id}-text`;
                return (
                  <div key={n.id} className="list-item" style={{ alignItems: 'flex-start' }}>
                    <div className="item-body">
                      <p id={textId} style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                        {n.content}
                      </p>
                      <span className="meta">
                        {n.observedOn.slice(5).replace('-', '/')} · {n.teacherName}
                      </span>
                      {/* 지우는 건 메모를 쓴 선생님만 할 수 있다(서버도 확인한다). */}
                      {n.teacherId === me && (
                        <div style={{ marginTop: 4 }}>
                          <DangerAction
                            label="삭제"
                            triggerClassName="btn small ghost"
                            describedBy={textId}
                            question="이 메모를 삭제할까요?"
                            detail="보호자 화면에서도 사라지고 되돌릴 수 없어요."
                            confirmLabel="삭제하기"
                            busyLabel="삭제하는 중…"
                            onConfirm={() => removeNote(n)}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
      </section>
    );
  }

  return (
    <div>
      {back}
      <div className="child-head">
        <span className="avatar" aria-hidden="true">
          {s.child.nickname.slice(0, 1)}
        </span>
        <div className="child-head-text">
          <h1 id={TITLE_ID} tabIndex={-1}>
            {s.child.nickname}
          </h1>
          <div className="child-age">{formatAge(s.child.ageMonths)}</div>
        </div>
      </div>

      <div className="tabs" role="group" aria-label="볼 내용">
        {TABS.map((t) => (
          <button key={t.key} type="button" aria-pressed={tab === t.key} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'records' && recordsPanel()}
      {tab === 'goals' && goalsPanel()}
      {tab === 'notes' && notesPanel()}
    </div>
  );
}
