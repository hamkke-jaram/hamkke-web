import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { Observation, Role } from '../api/types';

/*
 * 보호자와 선생님이 아이에 대해 주고받는 이야기(hamkke-api TLK: /children/{id}/messages).
 * - 화면은 몇 초마다 새 이야기만 받아 간다(afterId). 시연 영상에서 한쪽이 보내면 다른 쪽에 곧 나타난다.
 * - 선생님 관찰 메모도 같은 흐름에 끼워 보여 주고, 메모에 단 답은 그 메모를 인용해 보여 준다.
 * - 화면에 보이는 동안 받은 이야기는 읽은 것으로 표시한다(안 읽은 수 배지가 줄어든다).
 */

export interface TalkMessage {
  id: number;
  content: string;
  authorRole: Role;
  authorName: string;
  mine: boolean;
  observationId: number | null;
  createdAt: string;
}

export interface Unread {
  unread: number;
  latestId: number | null;
}

/** 이야기 흐름의 한 줄: 주고받은 이야기 또는 선생님 관찰 메모. */
export type TimelineItem = { kind: 'message'; at: string; message: TalkMessage } | { kind: 'note'; at: string; note: Observation };

/** 새로 받은 이야기를 붙인다. 같은 id는 한 번만, id 순서대로. */
export function mergeMessages(prev: TalkMessage[], incoming: TalkMessage[]): TalkMessage[] {
  if (incoming.length === 0) return prev;
  const byId = new Map(prev.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

/** 이야기와 관찰 메모를 시간 순으로 섞는다(같은 시각이면 메모가 먼저). */
export function buildTimeline(messages: TalkMessage[], notes: Observation[]): TimelineItem[] {
  const items: TimelineItem[] = [
    ...notes.map((note) => ({ kind: 'note' as const, at: note.createdAt, note })),
    ...messages.map((message) => ({ kind: 'message' as const, at: message.createdAt, message })),
  ];
  return items.sort((a, b) => {
    const d = Date.parse(a.at) - Date.parse(b.at);
    if (d !== 0) return d;
    if (a.kind !== b.kind) return a.kind === 'note' ? -1 : 1;
    const ida = a.kind === 'note' ? a.note.id : a.message.id;
    const idb = b.kind === 'note' ? b.note.id : b.message.id;
    return ida - idb;
  });
}

export function latestId(messages: TalkMessage[]): number | null {
  return messages.length ? messages[messages.length - 1].id : null;
}

const path = (childId: number) => `/children/${childId}/messages`;

export function fetchMessages(childId: number, afterId?: number | null) {
  return api<TalkMessage[]>('GET', afterId ? `${path(childId)}?afterId=${afterId}&limit=100` : `${path(childId)}?limit=100`);
}

export function sendMessage(childId: number, content: string, observationId?: number | null) {
  return api<TalkMessage>('POST', path(childId), { content, ...(observationId ? { observationId } : {}) });
}

export function markRead(childId: number, lastReadId: number) {
  return api<Unread>('POST', `${path(childId)}/read`, { lastReadId });
}

export function fetchUnread(childId: number) {
  return api<Unread>('GET', `${path(childId)}/unread`);
}

/** 화면이 보이는 동안만 ms마다 fn을 부른다(다른 탭에 가 있으면 쉬고, 돌아오면 바로 한 번). */
export function usePolling(fn: () => void, ms: number, enabled = true) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      if (document.visibilityState === 'visible') ref.current();
    };
    const timer = window.setInterval(tick, ms);
    const onVisible = () => {
      if (document.visibilityState === 'visible') ref.current();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [ms, enabled]);
}

/** 이야기 목록: 처음에 최근 것을 받고, 몇 초마다 새 것만 붙인다. 보이는 동안 받은 것은 읽음으로 표시한다. */
export function useTalk(childId: number, pollMs = 3000) {
  const [messages, setMessages] = useState<TalkMessage[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const latest = useRef<number | null>(null);
  const read = useRef<number>(0);
  const busy = useRef(false);

  const markSeen = useCallback(
    (list: TalkMessage[]) => {
      const last = latestId(list);
      if (last && last > read.current && document.visibilityState === 'visible') {
        read.current = last;
        void markRead(childId, last).catch(() => undefined);
      }
    },
    [childId],
  );

  const load = useCallback(async () => {
    try {
      const list = await fetchMessages(childId);
      latest.current = latestId(list);
      setMessages(list);
      setError(null);
      markSeen(list);
    } catch (e) {
      setError(e);
    }
  }, [childId, markSeen]);

  useEffect(() => {
    setMessages(null);
    latest.current = null;
    read.current = 0;
    void load();
  }, [load]);

  const poll = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const fresh = await fetchMessages(childId, latest.current);
      if (fresh.length) {
        setMessages((prev) => {
          const merged = mergeMessages(prev ?? [], fresh);
          latest.current = latestId(merged);
          markSeen(merged);
          return merged;
        });
      }
      setError(null);
    } catch {
      /* 잠깐 끊겨도 다음 차례에 다시 받는다 */
    } finally {
      busy.current = false;
    }
  }, [childId, markSeen]);

  usePolling(() => void poll(), pollMs, messages !== null);

  const send = useCallback(
    async (content: string, observationId?: number | null) => {
      const m = await sendMessage(childId, content, observationId);
      setMessages((prev) => {
        const merged = mergeMessages(prev ?? [], [m]);
        latest.current = latestId(merged);
        read.current = Math.max(read.current, m.id);
        return merged;
      });
      return m;
    },
    [childId],
  );

  return { messages, error, reload: load, send };
}

/** 안 읽은 이야기 수(배지). 몇 초마다 다시 센다. 못 불러오면 0으로 둔다. */
export function useUnread(childId: number | null, pollMs = 5000) {
  const [count, setCount] = useState(0);
  const check = useCallback(() => {
    if (!childId) return;
    void fetchUnread(childId)
      .then((u) => setCount(u.unread))
      .catch(() => undefined);
  }, [childId]);
  useEffect(() => {
    setCount(0);
    check();
  }, [check]);
  usePolling(check, pollMs, childId !== null);
  return count;
}
