import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { DaycareRecommendation, Delivery } from '../../api/types';
import { CoachingRows } from './CoachingRows';

function delivery(id: number, code: string): Delivery {
  return {
    id, deliveredAt: `2026-11-${id}T01:00:00Z`, triedAt: null,
    card: { id, code, title: `가정 코칭 ${code}`, body: '가정에서 해본 놀이예요.', metricFocus: 'GENERAL',
      situation: '', evidenceTag: '', sourceTitle: '', sourceUrl: null, author: '', reviewer: null },
  };
}

const recommendation: DaycareRecommendation = {
  sourceCode: 'RS-A-01', sourceTitle: '가정 코칭 RS-A-01', title: '공을 굴리고 기다려요',
  action: '공을 천천히 굴려 보세요. 아이가 반응할 때까지 기다려 주세요.',
};
const month = [
  delivery(20, 'JP-G-01'), delivery(19, 'JP-A-01'), delivery(18, 'RS-A-01'), delivery(17, 'RS-A-01'),
];
function markup(rows: Delivery[], recommended?: DaycareRecommendation) {
  return renderToStaticMarkup(
    <MemoryRouter><CoachingRows childId={7} rows={rows} recommendation={recommended} /></MemoryRouter>,
  );
}
function deliveryOrder(html: string) {
  return [...html.matchAll(/<li\b[^>]*\bdata-delivery-id="(\d+)"/g)].map(match => Number(match[1]));
}

describe('어린이집 활동 추천 줄', () => {
  it('세 번째 전달 건을 첫 줄로 옮긴다. 앞선 두 건과 같은 코드의 과거 전달 건은 원래 순서로 남는다', () => {
    const html = markup(month, recommendation);
    expect(deliveryOrder(html)).toEqual([18, 20, 19, 17]);
    expect(html.match(/data-demo="th-daycare-coaching"/g)).toHaveLength(1);
    expect(html).toMatch(/<ul class="coach-rows"><li class="daycare-coaching"[^>]*><details><summary class="coach-row">/);
    expect(html).toContain('mochi-ball.webp');
    expect(html).toContain('AI 추천 · 어린이집');
    expect(html).toContain(recommendation.action);
    expect(html).toContain(`href="/t/children/7/coaching/18">${recommendation.sourceTitle}</a>`);
  });

  it('아직 불러오지 않은 근거는 원문 주소를 만들지 않고, 다음 쪽에서 받으면 추천 줄에 연결한다', () => {
    const first = markup(month.slice(0, 2), recommendation);
    expect(deliveryOrder(first)).toEqual([20, 19]);
    expect(first).toContain(recommendation.sourceTitle);
    expect(first).not.toContain('coaching/18');
    const next = markup(month, recommendation);
    expect(deliveryOrder(next)).toEqual([18, 20, 19, 17]);
    expect(next.match(/<li\b/g)).toHaveLength(month.length);
  });

  it('추천이 없거나 준비 중이면 모든 원래 카드를 새로 받은 순서로 표시한다', () => {
    const html = markup(month);
    expect(deliveryOrder(html)).toEqual([20, 19, 18, 17]);
    expect(html).not.toContain('AI 추천');
    expect(html).not.toContain('<summary');
  });
});
