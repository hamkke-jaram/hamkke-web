import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import type { Child, Observation, TeacherChild } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import Mascot from '../components/Mascot';
import MiniBuddy from '../components/MiniBuddy';
import SubHead from '../components/SubHead';
import { buddy } from '../components/buddyBus';
import { useToast } from '../components/feedback';
import { Disclaimer, ErrorText, Loading, formatAge, useLoad } from '../components/ui';
import { haptic } from '../native';
import { buildTimeline, usePolling, useTalk, type TalkMessage, type TimelineItem } from './talk';
import './talk.css';

/*
 * /p/children/:id/talk (보호자) · /t/children/:id/talk (선생님) — 아이에 대해 주고받는 이야기.
 * 선생님 관찰 메모가 흐름에 함께 보이고, 메모마다 '답하기'로 그 메모에 답할 수 있다.
 * 몇 초마다 새 이야기를 받아 와 상대가 보낸 것이 곧 나타난다(시연 영상에서 두 화면을 나란히 두고 찍는다).
 */

const MAX = 500;

const QUICK: Record<'PARENT' | 'TEACHER', string[]> = {
  PARENT: ['고마워요! 집에서도 해 볼게요', '오늘 집에서 있었던 일을 알려 드려요', '궁금한 게 있어요'],
  TEACHER: ['확인했어요, 고맙습니다', '어린이집에서도 이어서 해 볼게요', '오늘 하루 잘 지냈어요'],
};

const DAY = ['일', '월', '화', '수', '목', '금', '토'];

function dayLabel(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} (${DAY[d.getDay()]})`;
}

function timeLabel(iso: string) {
  const d = new Date(iso);
  const h = d.getHours();
  return `${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function snippet(text: string, n = 40) {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

export default function TalkPage() {
  const { childId } = useParams();
  const id = Number(childId);
  const { user } = useAuth();
  const toast = useToast();
  const isParent = user?.role === 'PARENT';
  const role = isParent ? 'PARENT' : 'TEACHER';

  // 아이 이름·나이: 보호자는 자기 아이, 선생님은 연결된 아이 목록에서.
  const child = useLoad<{ nickname: string; ageMonths: number } | null>(
    () =>
      isParent
        ? api<Child>('GET', `/children/${id}`)
        : api<TeacherChild[]>('GET', '/teacher/children').then((l) => l.find((c) => c.id === id) ?? null),
    [id, isParent],
  );
  const talk = useTalk(id);
  const [notes, setNotes] = useState<Observation[]>([]);
  const loadNotes = () =>
    api<Observation[]>('GET', `/children/${id}/observations?limit=30`)
      .then(setNotes)
      .catch(() => undefined);
  useEffect(() => {
    setNotes([]);
    void loadNotes();
    // loadNotes는 id만 쓴다.
  }, [id]);
  usePolling(() => void loadNotes(), 8000);

  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<Observation | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<unknown>(null);
  /** 보내는 중인 이야기(서버가 받기 전까지 흐릿한 말풍선으로 먼저 보인다)와, 방금 보낸 이야기 id('보냄' 표시). */
  const [pending, setPending] = useState<string | null>(null);
  const [sentId, setSentId] = useState<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const seen = useRef<Set<number> | null>(null);
  /** 화면을 열 때 이미 있던 이야기. 그 뒤에 도착한 상대 이야기만 '톡' 하고 나타난다. */
  const initialIds = useRef<Set<number> | null>(null);
  if (initialIds.current === null && talk.messages) initialIds.current = new Set(talk.messages.map((m) => m.id));

  useEffect(() => {
    if (sentId === null) return;
    const t = window.setTimeout(() => setSentId(null), 2500);
    return () => window.clearTimeout(t);
  }, [sentId]);

  // 이 화면에서는 면책 문구를 이야기 흐름 맨 위에 두고, 아래 공통 문구는 감춘다(입력칸이 늘 맨 아래에 오게).
  useEffect(() => {
    document.body.classList.add('talk-on');
    return () => document.body.classList.remove('talk-on');
  }, []);

  const timeline = useMemo(() => buildTimeline(talk.messages ?? [], notes), [talk.messages, notes]);
  const notesById = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes]);

  // 새로 들어온 상대 이야기: 살짝 진동(iOS 앱)하고, 아래에 있으면 따라 내려간다.
  useLayoutEffect(() => {
    const msgs = talk.messages;
    if (!msgs) return;
    const first = seen.current === null;
    const known = seen.current ?? new Set<number>();
    const incoming = msgs.filter((m) => !known.has(m.id) && !m.mine);
    msgs.forEach((m) => known.add(m.id));
    seen.current = known;
    if (!first && incoming.length) {
      haptic('light');
      buddy.emit('wave'); // 상대가 보냈다는 것에만 반응한다(내용과 상관없이)
    }
    const bottomGap = document.documentElement.scrollHeight - (window.scrollY + window.innerHeight);
    if (first || bottomGap < 260 || msgs.some((m) => m.mine && !known.has(m.id))) {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: first ? 'auto' : 'smooth' });
    }
  }, [talk.messages]);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    setSendError(null);
    // 보내는 동안은 입력칸을 비우고 흐릿한 말풍선으로 먼저 보여 준다. 못 보내면 글을 입력칸에 되돌린다.
    setPending(content);
    setText('');
    requestAnimationFrame(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' }));
    try {
      const m = await talk.send(content, replyTo?.id ?? null);
      setPending(null);
      setSentId(m.id);
      setReplyTo(null);
      haptic('success');
      buddy.emit('cheer');
      requestAnimationFrame(() =>
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' }),
      );
    } catch (err) {
      setPending(null);
      setText((t) => t || content);
      setSendError(err);
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // 데스크톱: Enter로 보내고 Shift+Enter로 줄을 바꾼다(한글 조합 중에는 보내지 않는다).
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  }

  function startReply(n: Observation) {
    setReplyTo(n);
    inputRef.current?.focus();
  }

  const title = isParent ? '선생님과 이야기' : '보호자와 이야기';
  const fallback = isParent ? `/p/children/${id}` : `/t/children/${id}`;

  if (talk.messages === null && talk.error == null) return <Loading />;

  return (
    <div className="talk">
      <SubHead title={title} fallback={fallback} />
      <div className="talk-head">
        {child.data && (
          <span className="talk-child">
            <span className="avatar" aria-hidden="true">
              {child.data.nickname.slice(0, 1)}
            </span>
            {child.data.nickname} · {formatAge(child.data.ageMonths)}
          </span>
        )}
        <span className="talk-live" title="몇 초마다 새 이야기를 받아 와요">
          <span className="talk-live-dot" aria-hidden="true" />
          실시간
        </span>
      </div>

      {talk.error != null && talk.messages === null && (
        <div className="card">
          <ErrorText error={talk.error} />
          <button type="button" className="btn small secondary" onClick={() => void talk.reload()}>
            다시 불러오기
          </button>
        </div>
      )}

      <div className="talk-disclaimer">
        <Disclaimer />
      </div>

      <div className="talk-list" ref={listRef} aria-live="polite" aria-relevant="additions">
        {timeline.length === 0 && talk.messages !== null && (
          <div className="talk-empty">
            <Mascot name={isParent ? 'dome' : 'teacher'} size={120} live />
            <p>
              아직 주고받은 이야기가 없어요.
              <br />
              {isParent ? '집에서 있었던 일을 선생님께 먼저 나눠 보세요.' : '오늘 어린이집에서 있었던 일을 보호자께 먼저 나눠 보세요.'}
            </p>
          </div>
        )}
        {timeline.map((item, i) => {
          const prev = timeline[i - 1];
          const newDay = !prev || dayLabel(prev.at) !== dayLabel(item.at);
          return (
            <div key={item.kind === 'note' ? `n${item.note.id}` : `m${item.message.id}`}>
              {newDay && <div className="talk-day">{dayLabel(item.at)}</div>}
              {item.kind === 'note' ? (
                <NoteCard note={item.note} onReply={() => startReply(item.note)} />
              ) : (
                <Bubble
                  message={item.message}
                  quoted={item.message.observationId ? notesById.get(item.message.observationId) : undefined}
                  prev={prev}
                  sent={item.message.id === sentId}
                  arrived={!item.message.mine && initialIds.current !== null && !initialIds.current.has(item.message.id)}
                />
              )}
            </div>
          );
        })}
        {pending !== null && (
          // 낭독은 보낸 뒤 실제 이야기가 붙을 때 한 번만(보내는 중 말풍선은 눈으로만).
          <div className="talk-row mine pending" aria-hidden="true">
            <div className="talk-bubble">
              <span className="talk-text">{pending}</span>
            </div>
            <span className="talk-status">보내는 중…</span>
          </div>
        )}
      </div>

      <form className="talk-compose" onSubmit={submit} data-demo="talk-compose">
        {replyTo && (
          <div className="talk-replying">
            <span className="talk-replying-text">
              <strong>메모에 답하는 중</strong> {snippet(replyTo.content)}
            </span>
            <button type="button" className="talk-replying-x" aria-label="메모에 답하기 그만두기" onClick={() => setReplyTo(null)}>
              ×
            </button>
          </div>
        )}
        <div className="talk-quick-row">
        {/* 입력칸 곁에 앉은 작은 모찌: 보내면 두 번 뛰고(cheer), 상대 이야기가 오면 몸을 흔든다(wave). */}
        <MiniBuddy name={isParent ? 'dome' : 'teacher'} size={32} className="talk-mochi" />
        <div className="talk-quick" role="group" aria-label="빠른 답">
          {QUICK[role].map((q) => (
            <button
              key={q}
              type="button"
              className="talk-chip"
              data-demo="talk-quick"
              onClick={() => {
                setText(q);
                inputRef.current?.focus();
              }}
            >
              {q}
            </button>
          ))}
        </div>
        </div>
        <div className="talk-input-row">
          <label htmlFor="talk-input" className="sr-only">
            {isParent ? '선생님께 보낼 이야기' : '보호자께 보낼 이야기'}
          </label>
          <textarea
            id="talk-input"
            ref={inputRef}
            className="talk-input"
            data-demo="talk-input"
            rows={1}
            maxLength={MAX}
            placeholder={isParent ? '선생님께 이야기를 남겨 보세요' : '보호자께 이야기를 남겨 보세요'}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setSendError(null);
            }}
            onKeyDown={onKeyDown}
          />
          <button
            type="submit"
            className="talk-send"
            data-demo="talk-send"
            aria-label="보내기"
            aria-disabled={!text.trim() || sending || undefined}
            onClick={(e) => {
              if (!text.trim()) {
                e.preventDefault();
                toast('보낼 이야기를 써 주세요.');
              }
            }}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M4 12l16-8-6 16-2.5-6.5L4 12z" fill="currentColor" />
            </svg>
          </button>
        </div>
        {sendError != null && <ErrorText error={sendError} />}
      </form>
    </div>
  );
}

function NoteCard({ note, onReply }: { note: Observation; onReply: () => void }) {
  return (
    <div className="talk-note">
      <div className="talk-note-head">
        <span className="talk-note-tag">관찰 메모</span>
        <span className="talk-note-meta">
          {note.observedOn.slice(5).replace('-', '/')} · {note.teacherName}
        </span>
      </div>
      <p className="talk-note-body">{note.content}</p>
      <button type="button" className="talk-note-reply" data-demo="talk-note-reply" onClick={onReply}>
        이 메모에 답하기
      </button>
    </div>
  );
}

function Bubble({
  message: m,
  quoted,
  prev,
  sent,
  arrived,
}: {
  message: TalkMessage;
  quoted?: Observation;
  prev?: TimelineItem;
  /** 방금 보낸 것: '보내는 중' 말풍선이 그대로 이것이 되므로 다시 들어오지 않고 '보냄'만 잠깐 보인다. */
  sent?: boolean;
  /** 화면을 연 뒤 도착한 상대 이야기: 톡 하고 나타난다. */
  arrived?: boolean;
}) {
  // 같은 사람이 이어 보낸 것은 이름을 한 번만.
  const sameAuthor = prev?.kind === 'message' && prev.message.mine === m.mine && prev.message.authorName === m.authorName;
  return (
    <div className={`talk-row ${m.mine ? 'mine' : 'theirs'}${sent ? ' sent' : ''}${arrived ? ' arrived' : ''}`}>
      {!m.mine && !sameAuthor && (
        <div className="talk-author">
          {m.authorName}
          <span className="talk-role">{m.authorRole === 'TEACHER' ? '선생님' : '보호자'}</span>
        </div>
      )}
      <div className="talk-bubble">
        {m.observationId && (
          <div className="talk-quote">
            <span aria-hidden="true">↳ </span>
            {quoted ? `메모: ${snippet(quoted.content, 30)}` : '관찰 메모에 단 답'}
          </div>
        )}
        <span className="talk-text">{m.content}</span>
      </div>
      <time className="talk-time" dateTime={m.createdAt}>
        {sent && (
          <span className="talk-status sent" aria-hidden="true">
            보냄 ✓{' '}
          </span>
        )}
        {timeLabel(m.createdAt)}
      </time>
    </div>
  );
}
