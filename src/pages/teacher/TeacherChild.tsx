import { useEffect, useRef, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ObservationList from '../../ai/ObservationList';
import { ApiError, api } from '../../api/client';
import type { Delivery, Goal, GoalStatus, Observation, SharedItem, SharedSummary } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { isDemoWorkspaceChild } from '../../auth/demoLogin';
import DemoObservationExample from '../../ai/DemoObservationExample';
import { buddy } from '../../components/buddyBus';
import ConversationSuggestions from '../../components/ConversationSuggestions';
import { BackLink, DangerAction, Field, TextAreaField, refocus, useToast } from '../../components/feedback';
import { usePagedList } from '../../components/paging';
import {
  ErrorText,
  Loading,
  MoreButton,
  Section,
  WeeklyChart,
  WeeklyTable,
  formatAge,
  formatDate,
  loadStateView,
  useLoad,
} from '../../components/ui';
import '../extra.css';
import TalkEntry from '../../talk/TalkEntry';

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
/** 관찰 메모를 한 번에 가져오는 개수(최신순). 더 있으면 '더 보기'로 이어서 가져온다. */
const NOTE_LIMIT = 20;
const NOTE_CONTENT_LIMIT = 1000;
/** 가정에서 받은 코칭 카드를 한 번에 가져오는 개수(최신순). 본문까지 보여 주어 길어서 적게 받고, 더 있으면 '더 보기'. */
const CARD_LIMIT = 5;

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

/** 고치고 있는 목표(한 번에 하나). */
interface GoalEdit {
  id: number;
  title: string;
  description: string;
  titleError: string | null;
  error: unknown;
  busy: boolean;
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function TeacherChild() {
  const { childId } = useParams();
  return <TeacherChildView key={childId} id={Number(childId)} />;
}

function TeacherChildView({ id }: { id: number }) {
  const { user, policies } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const aiOn = policies?.aiObservationEnabled === true;
  const summary = useLoad(() => api<SharedSummary>('GET', `/teacher/children/${id}/shared-summary?weeks=8`), [id]);
  const goals = useLoad(() => api<Goal[]>('GET', `/children/${id}/goals`), [id]);
  const notes = usePagedList<Observation>(`/children/${id}/observations`, NOTE_LIMIT, [id]);
  const sharesCards = summary.data?.sharedItems.includes('COACHING_CARDS') ?? false;
  // 보호자가 카드 공유를 켠 경우에만 불러온다(path가 null이면 빈 목록).
  const cards = usePagedList<Delivery>(sharesCards ? `/children/${id}/card-deliveries` : null, CARD_LIMIT, [
    id,
    sharesCards,
  ]);

  // 탭을 옮겨도 쓰던 목표·메모는 남도록 상태는 화면 전체에 둔다.
  const [tab, setTab] = useState<Tab>('records');

  const [goalTitle, setGoalTitle] = useState('');
  const [goalDesc, setGoalDesc] = useState('');
  const [goalTitleError, setGoalTitleError] = useState<string | null>(null);
  const [goalFormError, setGoalFormError] = useState<unknown>(null);
  const [goalBusy, setGoalBusy] = useState(false);
  const [statusError, setStatusError] = useState<unknown>(null);
  const [statusBusy, setStatusBusy] = useState<number | null>(null);
  const [edit, setEdit] = useState<GoalEdit | null>(null);
  const editTitleRef = useRef<HTMLInputElement>(null);
  // 고치기 상자가 열리면 제목 칸으로 포커스를 옮긴다.
  const editingId = edit?.id ?? null;
  useEffect(() => {
    if (editingId !== null) editTitleRef.current?.focus();
  }, [editingId]);

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
      buddy.emit('cheer');
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
      // 누른 버튼은 그대로 남아 있고(요청 중에도 aria-disabled라 포커스를 잃지 않는다) 오류는 목록 위에 알린다.
      setStatusError(err);
    } finally {
      setStatusBusy(null);
    }
  }

  function startEdit(g: Goal) {
    // 상태를 바꾸는 요청 중에는 버튼을 aria-disabled로만 막으므로 여기서 한 번 더 막는다.
    if (statusBusy !== null) return;
    setStatusError(null);
    setEdit({ id: g.id, title: g.title, description: g.description ?? '', titleError: null, error: null, busy: false });
  }

  function cancelEdit(g: Goal) {
    focusAfter.current = goalTitleId(g);
    setEdit(null);
  }

  async function saveEdit(e: FormEvent, g: Goal) {
    e.preventDefault();
    if (!edit || edit.busy) return;
    if (!edit.title.trim()) {
      flushSync(() => setEdit({ ...edit, titleError: '목표를 한 줄로 써 주세요.', error: null }));
      refocus(editTitleRef.current);
      return;
    }
    // 바뀐 칸만 보낸다.
    const body: { title?: string; description?: string } = {};
    if (edit.title.trim() !== g.title) body.title = edit.title.trim();
    if (edit.description !== (g.description ?? '')) body.description = edit.description;
    if (Object.keys(body).length === 0) {
      cancelEdit(g);
      return;
    }
    setEdit({ ...edit, busy: true, error: null, titleError: null });
    try {
      const saved = await api<Goal>('PATCH', `/children/${id}/goals/${g.id}`, body);
      focusAfter.current = goalTitleId(g);
      goals.setData((cur) => (cur ? cur.map((x) => (x.id === g.id ? { ...x, ...saved } : x)) : cur));
      setEdit(null);
      toast('목표를 고쳤어요.');
      buddy.emit('cheer');
      goals.reload();
    } catch (err) {
      const field = err instanceof ApiError ? err.fieldErrors[0] : undefined;
      if (field?.field === 'title') {
        flushSync(() => setEdit((cur) => cur && { ...cur, busy: false, titleError: field.message }));
        refocus(editTitleRef.current);
      } else {
        setEdit((cur) => cur && { ...cur, busy: false, error: err });
      }
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

  function appendSuggestion(text: string) {
    if (noteBusy) return;
    const next = note.trim() ? `${note}\n\n${text}` : text;
    if (next.length > NOTE_CONTENT_LIMIT) {
      toast('메모가 1,000자를 넘어요. 내용을 줄인 뒤 추가해 주세요.');
      return;
    }
    flushSync(() => {
      setNote(next);
      setNoteError(null);
      setNoteFormError(null);
    });
    noteRef.current?.setSelectionRange(next.length, next.length);
    refocus(noteRef.current);
    toast('메모 끝에 문장을 추가했어요.');
  }

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
      buddy.emit('cheer');
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
    notes.setItems((cur) => (cur ? cur.filter((x) => x.id !== n.id) : cur));
    toast('메모를 삭제했어요.');
  }

  // ---------- 연결 끊기 ----------

  async function unlink() {
    // 실패하면 확인 상자 안에 오류가 보인다(DangerAction).
    await api('DELETE', `/teacher/links/${id}`);
    toast(`${s.child.nickname} 연결을 끊었어요. 남긴 목표와 메모는 보호자 화면에 남아요.`);
    nav('/t', { replace: true });
  }

  // ---------- 그리기 ----------

  function goalRow(g: Goal) {
    const titleId = goalTitleId(g);
    const statusButton = (to: GoalStatus, label: string, className: string) =>
      g.status !== to && (
        <>
          <button
            type="button"
            className={className}
            aria-describedby={titleId}
            aria-disabled={statusBusy !== null || undefined}
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
          {edit?.id === g.id && (
            <form className="inline-edit" onSubmit={(e) => void saveEdit(e, g)} noValidate>
              <Field
                id="tc-goal-edit-title"
                data-demo="tc-goal-edit-title"
                ref={editTitleRef}
                label="목표"
                type="text"
                maxLength={60}
                showCount
                error={edit.titleError}
                value={edit.title}
                onChange={(e) => {
                  const v = e.target.value;
                  setEdit((cur) => cur && { ...cur, title: v, titleError: null });
                }}
              />
              <TextAreaField
                id="tc-goal-edit-desc"
                data-demo="tc-goal-edit-desc"
                label="설명 (선택)"
                maxLength={500}
                showCount
                value={edit.description}
                onChange={(e) => {
                  const v = e.target.value;
                  setEdit((cur) => cur && { ...cur, description: v });
                }}
              />
              <ErrorText error={edit.error} />
              <div className="row">
                <button
                  type="button"
                  className="btn secondary"
                  style={{ flex: 1 }}
                  data-demo="tc-goal-edit-cancel"
                  onClick={() => cancelEdit(g)}
                >
                  취소
                </button>
                <button type="submit" className="btn" style={{ flex: 1 }} data-demo="tc-goal-edit-save" aria-disabled={edit.busy || undefined}>
                  {edit.busy ? '저장하는 중…' : '저장하기'}
                </button>
              </div>
            </form>
          )}
          {/* 상태를 바꾸거나 고치거나 지우는 건 목표를 쓴 선생님만 할 수 있다(서버도 확인한다). */}
          {g.teacherId === me && edit?.id !== g.id && (
            <div style={{ marginTop: 6 }}>
              <button
                type="button"
                className="btn small ghost"
                aria-describedby={titleId}
                data-demo="tc-goal-edit"
                aria-disabled={statusBusy !== null || undefined}
                onClick={() => startEdit(g)}
              >
                고치기
              </button>{' '}
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
                demo="tc-goal-delete"
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
            <Link
              to={`/t/children/${id}/observe`}
              className="btn block"
              style={{ marginBottom: 8, minHeight: 56, fontSize: 17 }}
              data-demo="tc-capture"
            >
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
              <WeeklyChart weeks={s.weeks} idPrefix="tc-week" />
              <WeeklyTable weeks={s.weeks} />
            </>
          )}
        </Section>

        {sharesCards && cards.error != null && !cards.items && (
          <Section title="가정에서 받은 코칭">{loadStateView(cards, '코칭 카드를')}</Section>
        )}
        {sharesCards && cards.items && cards.items.length > 0 && (
          <Section title="가정에서 받은 코칭">
            <div>
              {cards.items.map((d) => (
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
            <MoreButton list={cards} demo="tc-cards-more" label="지난 코칭 카드 더 보기" />
          </Section>
        )}

        {/* 기관에서 만든 기록은 항상, 가정에서 만든 기록은 보호자가 공유를 켠 경우에만 서버가 보내 준다.
            삭제는 자기가 만든 기록만 할 수 있어서, 다른 사람의 기록에는 버튼을 보여 주지 않는다.
            AI 서버가 꺼져 있어도(aiOn=false) 이미 있는 기록은 보고 지울 수 있게 목록은 남긴다(없으면 제목까지 숨긴다).
            기관에서 촬영하고 돌아오면 처음 탭(가정 기록)이 열리므로, 방금 남긴 기록이 바로 보이게 이 탭에 둔다. */}
        <ObservationList
          teacher
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
        {loadStateView(goals, '목표를') ?? (
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
            data-demo="tc-goal-title"
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
            data-demo="tc-goal-desc"
            label="설명 (선택)"
            maxLength={500}
            showCount
            value={goalDesc}
            onChange={(e) => setGoalDesc(e.target.value)}
          />
          <ErrorText error={goalFormError} />
          <button type="submit" className="btn block" data-demo="tc-goal-submit" aria-disabled={goalBusy || undefined}>
            {goalBusy ? '추가하는 중…' : '목표 추가'}
          </button>
        </form>
      </section>
    );
  }

  function notesPanel() {
    const list = notes.items ?? [];
    const heading = notes.hasMore ? `최근 메모 ${list.length}개` : list.length > 0 ? `메모 ${list.length}개` : '메모';
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
            data-demo="tc-note-date"
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
          <ConversationSuggestions role="TEACHER" onAddToNote={appendSuggestion} noteBusy={noteBusy} />
          <TextAreaField
            id="tc-note-text"
            data-demo="tc-note-text"
            ref={noteRef}
            label="메모"
            maxLength={NOTE_CONTENT_LIMIT}
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
          <button type="submit" className="btn block" data-demo="tc-note-submit" aria-disabled={noteBusy || undefined}>
            {noteBusy ? '남기는 중…' : '메모 남기기'}
          </button>
        </form>

        <h3 style={{ margin: '20px 0 4px', paddingTop: 16, borderTop: '1px solid var(--line)' }}>{heading}</h3>
        {loadStateView(notes, '관찰 메모를') ??
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
                            demo="tc-note-delete"
                            onConfirm={() => removeNote(n)}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <MoreButton list={notes} demo="tc-notes-more" label="이전 메모 더 보기" />
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

      {/* 보호자와 주고받는 이야기. 안 읽은 이야기 수를 배지로 보여 준다. */}
      <TalkEntry childId={id} role="TEACHER" />

      <div className="tabs" role="group" aria-label="볼 내용">
        {TABS.map((t) => (
          <button key={t.key} type="button" aria-pressed={tab === t.key} data-demo={`tc-tab-${t.key}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'records' && recordsPanel()}
      {tab === 'records' && isDemoWorkspaceChild(user, id) && <DemoObservationExample />}
      {tab === 'goals' && goalsPanel()}
      {tab === 'notes' && notesPanel()}

      <details key={id} className="card disclosure" style={{ marginTop: 16 }}>
        <summary>
          <span style={{ flex: 1, minWidth: 0 }}>이 아이와 연결 끊기</span>
          <span className="chev" aria-hidden="true">
            ›
          </span>
        </summary>
        <p className="muted" style={{ marginTop: 0 }}>
          반이 바뀌었거나 졸업한 아이라면 연결을 끊어 주세요. 끊은 뒤에는 이 아이의 기록을 볼 수 없어요.
        </p>
        <DangerAction
          label="연결 끊기"
          question="이 아이와의 연결을 끊을까요?"
          detail="더 이상 이 아이의 기록·목표·메모를 볼 수 없어요. 이미 남긴 목표와 메모는 보호자 화면에 남아요. 다시 연결하려면 보호자에게 새 초대 코드를 받아야 해요."
          confirmLabel="연결 끊기"
          busyLabel="끊는 중…"
          demo="tc-unlink"
          onConfirm={unlink}
        />
      </details>
    </div>
  );
}
