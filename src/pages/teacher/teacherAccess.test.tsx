import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { TeacherCoachingDetail } from './TeacherCoaching';
import { StoryCompose, StoryView } from './TeacherStory';
import { watchSharedDetail } from './useSharedDetail';

vi.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ user: { id: 9 } }) }));
afterEach(() => vi.unstubAllGlobals());

it('이전 방문 기록에 남은 이야기·코칭 본문을 서버 확인 전에 그리지 않는다', () => {
  const card = { deliveryId: 4, code: 'demo', title: '회수된 코칭 제목', body: '회수된 코칭 내용' };
  const state = { note: { id: 7, observedOn: '2026-11-20', content: '이전 메모', card }, delivery: { id: 4, card } };
  for (const [pathname, path, element] of [
    ['/t/children/2/story/7', '/t/children/:childId/story/:noteId', <StoryView />],
    ['/t/children/2/coaching/4', '/t/children/:childId/coaching/:deliveryId', <TeacherCoachingDetail />],
    ['/t/children/2/story/new', '/t/children/:childId/story/new', <StoryCompose />],
  ] as const) {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={[{ pathname, state }]}>
        <Routes><Route path={path} element={element} /></Routes>
      </MemoryRouter>,
    );
    expect(html).not.toContain(card.title);
    expect(html).not.toContain(card.body);
    expect(html).not.toContain('이전 메모');
  }
});

it('뒤로 가기 캐시에서 숨긴 자료를 지우고 새 응답만 적용한다', async () => {
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { hidden: false });
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', doc);
  type Note = { card: string | null };
  const deferred: Array<(note: Note) => void> = [];
  const read = () => new Promise<Note>(resolve => deferred.push(resolve));
  const publish = vi.fn();
  const stop = watchSharedDetail(read, publish);
  deferred[0]({ card: '이전 카드' });
  await Promise.resolve();
  expect(publish).toHaveBeenLastCalledWith({ data: { card: '이전 카드' }, loading: false, error: null });
  win.dispatchEvent(new Event('pagehide'));
  expect(publish).toHaveBeenLastCalledWith({ data: null, loading: true, error: null });
  win.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
  doc.hidden = true;
  doc.dispatchEvent(new Event('visibilitychange'));
  doc.hidden = false;
  doc.dispatchEvent(new Event('visibilitychange'));
  deferred[2]({ card: null });
  deferred[1]({ card: '철회 전 응답' });
  await Promise.resolve();
  expect(publish).toHaveBeenLastCalledWith({ data: { card: null }, loading: false, error: null });
  stop();
  win.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
  expect(deferred).toHaveLength(3);
});
