import { describe, expect, it } from 'vitest';
import type { Observation } from '../api/types';
import { duoOrigins, enterUrl } from '../demo/DuoDemo';
import { buildTimeline, latestId, mergeMessages, type TalkMessage } from './talk';

const msg = (id: number, at: string, mine = false): TalkMessage => ({
  id,
  content: `m${id}`,
  authorRole: mine ? 'PARENT' : 'TEACHER',
  authorName: mine ? '보호자' : '선생님',
  mine,
  observationId: null,
  createdAt: at,
});

const note = (id: number, at: string): Observation => ({
  id,
  content: `note${id}`,
  observedOn: at.slice(0, 10),
  teacherId: 9,
  teacherName: '선생님',
  createdAt: at,
});

describe('보호자·선생님 이야기(talk)', () => {
  it('새로 받은 이야기를 겹치지 않게 id 순서로 붙인다', () => {
    const a = [msg(1, '2026-11-20T01:00:00Z'), msg(3, '2026-11-20T01:02:00Z')];
    const merged = mergeMessages(a, [msg(3, '2026-11-20T01:02:00Z'), msg(2, '2026-11-20T01:01:00Z'), msg(4, '2026-11-20T01:03:00Z')]);
    expect(merged.map((m) => m.id)).toEqual([1, 2, 3, 4]);
    expect(latestId(merged)).toBe(4);
    expect(mergeMessages(a, [])).toBe(a);
    expect(latestId([])).toBeNull();
  });

  it('관찰 메모와 이야기를 시간 순으로 섞고, 같은 시각이면 메모가 먼저다', () => {
    const t = buildTimeline(
      [msg(10, '2026-11-20T02:00:00Z', true), msg(11, '2026-11-20T03:00:00Z')],
      [note(5, '2026-11-20T02:00:00Z'), note(4, '2026-11-19T09:00:00Z')],
    );
    expect(t.map((i) => (i.kind === 'note' ? `n${i.note.id}` : `m${i.message.id}`))).toEqual(['n4', 'n5', 'm10', 'm11']);
  });

  it('함께 보기의 두 휴대폰은 서로 다른 주소로 열고, 계정은 # 뒤로만 넘긴다', () => {
    const o = duoOrigins({ protocol: 'http:', port: '5173' });
    expect(o.PARENT).toBe('http://localhost:5173');
    expect(o.TEACHER).toBe('http://127.0.0.1:5173');
    expect(new URL(o.PARENT).origin).not.toBe(new URL(o.TEACHER).origin);
    const url = enterUrl(o.TEACHER, { accessToken: 'acc', refreshToken: 'ref' }, '/t/children/3/talk', 2);
    const u = new URL(url);
    expect(u.pathname).toBe('/demo/duo/enter');
    expect(u.search).toBe('');
    const h = new URLSearchParams(u.hash.slice(1));
    expect(h.get('a')).toBe('acc');
    expect(h.get('to')).toBe('/t/children/3/talk');
  });
});

describe('QR 데모 입구', () => {
  it('QR은 실제 서비스 입구(/)가 아니라 데모 입구(/try)를 가리킨다', async () => {
    const { entryUrlFrom } = await import('../pages/QrEntry');
    expect(entryUrlFrom('http://10.0.0.5:5173/')).toBe('http://10.0.0.5:5173/try');
    expect(entryUrlFrom('https://example.test', 'https://sinabro.example/')).toBe('https://sinabro.example/try');
    expect(entryUrlFrom('https://example.test')).toBe('https://example.test/try');
  });
});
