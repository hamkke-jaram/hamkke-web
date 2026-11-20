import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buddy, type BuddyKind } from '../../components/buddyBus';
import WeekCard from './WeekCard';
import { cue } from './parentMotion';

describe('cue (돌아다니는 모찌에게 신호)', () => {
  it('공용 신호 통로로 그대로 보낸다', () => {
    const got: BuddyKind[] = [];
    const off = buddy.on((k) => got.push(k));
    cue('celebrate');
    cue('think');
    off();
    cue('wave');
    expect(got).toEqual(['celebrate', 'think']);
  });

  it('듣는 쪽이 실패해도 부르는 화면은 멈추지 않는다', () => {
    const off = buddy.on(() => {
      throw new Error('모찌 오류');
    });
    expect(() => cue('celebrate')).not.toThrow();
    off();
  });
});

describe('WeekCard 숫자 (움직임이 꺼진 첫 모습)', () => {
  const week = {
    start: '2026-11-16',
    end: '2026-11-22',
    totalSeconds: 96,
    count: 2,
    days: [96, 0, 0, 0, 0, 0, 0],
    todayIndex: 2,
  };

  it('올라가기 없이 처음부터 최종 값이고, 읽기 프로그램용 최종 값도 함께 있다', () => {
    // 서버 그리기(=움직임을 모르는 첫 모습)에서는 움직이지 않는 쪽으로 그린다.
    const html = renderToStaticMarkup(<WeekCard week={week} />);
    expect(html).toContain('<span aria-hidden="true">1분 36초</span>');
    expect(html).toContain('<span class="sr-only">1분 36초</span>');
    expect(html).toContain('<span aria-hidden="true">2개</span>');
    expect(html).toContain('<span class="sr-only">2개</span>');
  });

  it('막대·숫자에 좋고 나쁨을 나타내는 이름표를 붙이지 않는다', () => {
    const html = renderToStaticMarkup(<WeekCard week={week} />);
    expect(html).not.toMatch(/good|bad|up|down|high|low/i);
  });
});

describe('코칭 모찌 그림 움직임 연결', () => {
  it('artClass는 늘 글자를 돌려준다(공용 artMotionFor가 아직 없어도 빈 이름)', async () => {
    const { artClass } = await import('./parentMotion');
    for (const pose of ['ball-wait', 'blocks', 'book', 'clap-sing', 'comfort', 'listen', 'breathe', 'laugh'] as const) {
      expect(typeof artClass(pose)).toBe('string');
    }
  });

  it('캐러셀에서 지금 카드(첫 카드)에만 is-active가 붙는다', async () => {
    const { MemoryRouter } = await import('react-router-dom');
    const { default: HomeCoaching } = await import('./HomeCoaching');
    const card = (id: number) => ({
      id,
      deliveredAt: '2026-11-20T01:00:00Z',
      triedAt: null,
      card: {
        id,
        code: 'GEN-A-01',
        title: `카드 ${id}`,
        body: '첫 문장이에요. 둘째 문장이에요.',
        situation: 'ANY',
        metricFocus: 'GENERAL' as const,
        evidenceTag: '근거',
        sourceTitle: '출처',
        sourceUrl: null,
        author: '작성',
        reviewer: null,
      },
    });
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <HomeCoaching childId={1} deliveries={[card(1), card(2), card(3)]} onUpdated={() => undefined} onGone={() => undefined} />
      </MemoryRouter>,
    );
    expect(html.match(/class="is-active"/g)?.length).toBe(1);
    expect(html.indexOf('class="is-active"')).toBeLessThan(html.indexOf('카드 2'));
  });
});
