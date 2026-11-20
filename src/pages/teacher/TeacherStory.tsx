import { useEffect, useRef, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ApiError, api } from '../../api/client';
import type { AttachedCard, Delivery, Observation } from '../../api/types';
import SubHead from '../../components/SubHead';
import { poseFor, poseSrc } from '../../components/coachingArt';
import { buddy } from '../../components/buddyBus';
import { refocus, useToast } from '../../components/feedback';
import { usePagedList } from '../../components/paging';
import { ErrorText, Loading, loadStateView } from '../../components/ui';
import { useAuth } from '../../auth/AuthContext';
import { firstSentence } from '../parent/coachText';
import { ChevronIcon } from '../parent/icons';
import { CoachPicker } from './TeacherCoaching';
import { storyDate, storyPose, todayIso } from './storyUtils';
import '../parent/parent.css';
import './teacher.css';

/*
 * Figma '선생님 이야기' 두 화면.
 * - /t/children/:id/story/new      쓰기: 날짜 → 제목 → 본문 → 코칭 첨부하기(연보라 줄) → 메모 보내기.
 * - /t/children/:id/story/:noteId  보기: ‹ 선생님 이야기 / 날짜 / 본문 / 첨부한 코칭.
 * 보낸 이야기는 보호자 아이 홈의 '선생님 이야기'에 제목·첨부 코칭과 함께 보인다.
 */

const MAX_TITLE = 40;
const MAX_BODY = 1000;

/** 첨부한 코칭 한 줄(연보라). onRemove가 있으면 오른쪽에 빼기(×). */
function AttachedRow({ card, deliveredLabel, onOpen, onRemove }: { card: AttachedCard; deliveredLabel?: string; onOpen?: () => void; onRemove?: () => void }) {
  const pose = poseFor({ code: card.code, metricFocus: undefined as never });
  const body = (
    <>
      <span className="story-attach-art">
        <img src={poseSrc(pose)} alt="" width={56} height={56} decoding="async" />
      </span>
      <span className="story-row-text">
        {deliveredLabel && <span className="story-row-date">{deliveredLabel}</span>}
        <strong>{card.title}</strong>
        <span className="story-row-line">{firstSentence(card.body)}</span>
      </span>
    </>
  );
  return (
    <div className="story-attach">
      {onOpen ? (
        <button type="button" className="story-attach-main" onClick={onOpen} aria-label={`첨부한 코칭 ${card.title} 바꾸기`}>
          {body}
          <ChevronIcon size={20} />
        </button>
      ) : (
        <div className="story-attach-main">{body}</div>
      )}
      {onRemove && (
        <button type="button" className="story-attach-x" aria-label="첨부한 코칭 빼기" onClick={onRemove}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
}

function asAttached(d: Delivery): AttachedCard {
  return { deliveryId: d.id, cardId: d.card.id, code: d.card.code, title: d.card.title, body: d.card.body };
}

function deliveredDate(d: Delivery): string {
  const t = new Date(d.deliveredAt);
  return Number.isNaN(t.getTime()) ? '' : `${t.getMonth() + 1}월 ${t.getDate()}일`;
}

export function StoryCompose() {
  const id = Number(useParams().childId);
  const nav = useNavigate();
  const toast = useToast();
  const passed = (useLocation().state as { delivery?: Delivery } | null)?.delivery ?? null;
  const [date, setDate] = useState(todayIso);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [attached, setAttached] = useState<Delivery | null>(passed);
  const [picking, setPicking] = useState(false);
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [formError, setFormError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const attachArea = useRef<HTMLDivElement>(null);
  const returnFocus = useRef(false);

  // 고르기 화면을 닫고 돌아오면 '코칭 첨부하기' 자리로 포커스를 돌려놓는다.
  useEffect(() => {
    if (picking || !returnFocus.current) return;
    returnFocus.current = false;
    const el = attachArea.current?.querySelector<HTMLElement>('.story-attach-main, .story-attach-add');
    el?.scrollIntoView({ block: 'center' });
    el?.focus({ preventScroll: true });
  }, [picking]);

  function closePicker() {
    returnFocus.current = true;
    setPicking(false);
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!content.trim()) {
      flushSync(() => setBodyError('아이와 있었던 일을 적어 주세요.'));
      refocus(bodyRef.current);
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      await api<Observation>('POST', `/children/${id}/observations`, {
        content: content.trim(),
        observedOn: date,
        title: title.trim() || undefined,
        cardDeliveryId: attached?.id,
      });
      toast('이야기를 보냈어요. 보호자 화면에 바로 보여요.');
      buddy.emit('cheer');
      nav('/t', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404 && attached) {
        setFormError(new Error('보호자가 코칭 카드 공유를 꺼서 이 코칭을 첨부할 수 없어요. 첨부를 빼고 보내 주세요.'));
      } else {
        setFormError(err);
      }
    } finally {
      setBusy(false);
    }
  }

  if (picking) {
    return (
      <CoachPicker
        childId={id}
        selectedId={attached?.id ?? null}
        onClose={closePicker}
        onPick={(d) => {
          setAttached(d);
          setFormError(null);
          closePicker();
        }}
      />
    );
  }

  return (
    <form className="story-page" onSubmit={send} noValidate>
      <SubHead title="선생님 이야기" fallback="/t" />
      <label className="story-date">
        <span>{storyDate(date)}</span>
        <span className="sr-only">관찰한 날 바꾸기</span>
        <input
          type="date"
          data-demo="th-story-date"
          value={date}
          max={todayIso()}
          onChange={(e) => e.target.value && setDate(e.target.value)}
        />
      </label>
      <label className="sr-only" htmlFor="story-title">
        제목
      </label>
      <input
        id="story-title"
        className="story-title-input"
        data-demo="th-story-title"
        type="text"
        placeholder="제목 (예: 즐거운 공놀이)"
        maxLength={MAX_TITLE}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <label className="sr-only" htmlFor="story-body">
        이야기
      </label>
      <textarea
        id="story-body"
        ref={bodyRef}
        className="story-body-input"
        data-demo="th-story-body"
        placeholder="오늘 아이와 있었던 일을 보호자에게 전해 주세요."
        maxLength={MAX_BODY}
        rows={8}
        value={content}
        aria-invalid={bodyError ? true : undefined}
        aria-describedby={bodyError ? 'story-body-err' : 'story-body-count'}
        onChange={(e) => {
          setContent(e.target.value);
          setBodyError(null);
        }}
      />
      <div className="story-count" id="story-body-count">
        {content.length}/{MAX_BODY}
      </div>
      {bodyError && (
        <p className="error" id="story-body-err" role="alert">
          {bodyError}
        </p>
      )}

      <div className="story-bottom" ref={attachArea}>
        <h2 className="story-attach-h">코칭 첨부하기</h2>
        {attached ? (
          <AttachedRow
            card={asAttached(attached)}
            deliveredLabel={deliveredDate(attached)}
            onOpen={() => setPicking(true)}
            onRemove={() => {
              setAttached(null);
              setFormError(null);
            }}
          />
        ) : (
          <button type="button" className="story-attach-add" data-demo="th-story-attach" onClick={() => setPicking(true)}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            가정에서 받은 코칭 고르기
          </button>
        )}
        <ErrorText error={formError} />
        <button type="submit" className="btn block story-send" data-demo="th-story-send" aria-disabled={busy || undefined}>
          {busy ? '보내는 중…' : '메모 보내기'}
        </button>
      </div>
    </form>
  );
}

export function StoryView() {
  const { childId, noteId } = useParams();
  const id = Number(childId);
  const nid = Number(noteId);
  const nav = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const passed = (useLocation().state as { note?: Observation } | null)?.note;
  const fromState = passed && passed.id === nid ? passed : null;
  const list = usePagedList<Observation>(fromState ? null : `/children/${id}/observations`, 100, [id, nid]);
  const note = fromState ?? (list.items ?? []).find((n) => n.id === nid);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (!note) {
    return (
      <div>
        <SubHead title="선생님 이야기" fallback="/t" />
        {list.loading ? <Loading /> : (loadStateView(list, '선생님 이야기를') ?? <p className="muted">이 이야기를 찾을 수 없어요.</p>)}
      </div>
    );
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api('DELETE', `/children/${id}/observations/${nid}`);
      toast('이야기를 지웠어요.');
      nav('/t', { replace: true });
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  const mine = user?.id === note.teacherId;
  return (
    <article className="story-page">
      <SubHead title="선생님 이야기" fallback="/t" />
      <p className="story-date">{storyDate(note.observedOn)}</p>
      {note.title && <h2 className="story-view-title">{note.title}</h2>}
      <p className="story-view-body">{note.content}</p>
      {!note.card && (
        <img className="story-view-art" src={poseSrc(storyPose(note))} alt="" width={120} height={120} decoding="async" />
      )}

      <div className="story-bottom">
        {note.card && (
          <>
            <h2 className="story-attach-h">첨부한 코칭</h2>
            <AttachedRow
              card={note.card}
              onOpen={() => nav(`/t/children/${id}/coaching/${note.card!.deliveryId}`)}
            />
          </>
        )}
        <ErrorText error={error} />
        {mine &&
          (confirming ? (
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn secondary" style={{ flex: 1 }} onClick={() => setConfirming(false)}>
                그대로 두기
              </button>
              <button type="button" className="btn danger" style={{ flex: 1 }} onClick={remove} aria-disabled={busy || undefined}>
                {busy ? '지우는 중…' : '지우기'}
              </button>
            </div>
          ) : (
            <button type="button" className="btn ghost small story-delete" onClick={() => setConfirming(true)}>
              이 이야기 지우기
            </button>
          ))}
      </div>
    </article>
  );
}
