import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { Delivery } from '../../api/types';
import { CoachingRows, type CoachPick } from './CoachingRows';

function delivery(id: number, code: string): Delivery {
  return {
    id, deliveredAt: `2026-11-${id}T01:00:00Z`, triedAt: null,
    card: { id, code, title: `가정 코칭 ${code}`, body: '가정에서 해본 놀이예요.', metricFocus: 'GENERAL',
      situation: '', evidenceTag: '', sourceTitle: '', sourceUrl: null, author: '', reviewer: null },
  };
}

const month = [
  delivery(20, 'JP-G-01'), delivery(19, 'JP-A-01'), delivery(18, 'RS-A-01'), delivery(17, 'RS-A-01'),
];

function markup(pick?: CoachPick) {
  return renderToStaticMarkup(
    <MemoryRouter><CoachingRows childId={7} rows={month} pick={pick} /></MemoryRouter>,
  );
}

describe('가정에서 공유된 코칭 목록', () => {
  it('같은 종류의 코칭도 각각 받은 순서대로 표시하고 원래 상세 화면으로 연결한다', () => {
    const html = markup();
    expect([...html.matchAll(/<li\b[^>]*\bdata-delivery-id="(\d+)"/g)].map(match => Number(match[1])))
      .toEqual([20, 19, 18, 17]);
    expect(html).toContain('href="/t/children/7/coaching/18"');
    expect(html).toContain('href="/t/children/7/coaching/17"');
    expect(html).not.toContain('AI 추천');
  });

  it('이야기에 첨부할 때는 선택한 코칭을 눌린 버튼으로 표시한다', () => {
    const html = markup({ selectedId: 19, onPick: vi.fn() });
    expect(html).toMatch(/data-delivery-id="19"><button[^>]*aria-pressed="true"/);
    expect(html).not.toContain('href="/t/children/7/coaching/');
  });
});
