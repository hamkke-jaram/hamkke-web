import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { DaycareRecommendation, Delivery } from '../../api/types';
import { isDemoWorkspaceChild } from '../../auth/demoLogin';
import { CoachingRows } from './CoachingRows';

vi.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ user: { id: 9, role: 'TEACHER' } }) }));
vi.mock('../../auth/demoLogin', () => ({ isDemoWorkspaceChild: vi.fn(() => false) }));

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

  it('추천을 열면 대응 바로 밑에 이유와 출처가 있고, 가정 코칭의 페이지 로딩에 의존하지 않는다', () => {
    const item = { ...recommendation, evidence: {
      reason: '아이가 자신의 차례에 반응할 시간을 가질 수 있어요.', sourceId: 'turn-taking',
      sourceTitle: '놀이 차례 안내', sourcePublisher: '자료 제공처', sourceUrl: 'https://example.org/turn-taking',
      sourceSection: '함께 기다리기',
    } };
    const html = markup(month.slice(0, 2), item);
    const action = html.indexOf(item.action);
    const why = html.indexOf(item.evidence.reason);
    const reference = html.indexOf('href="https://example.org/turn-taking"');
    expect(action).toBeGreaterThan(0);
    expect(why).toBeGreaterThan(action);
    expect(reference).toBeGreaterThan(why);
    expect(html).toContain('자료 제공처 · 놀이 차례 안내');
    expect(html).toContain('함께 기다리기');
  });

  it('접힌 추천 안에 영상 검토함을 두고 기기 전용 체험 아이에게만 예시를 연결한다', () => {
    const live = markup(month, recommendation);
    expect(live).toMatch(/<details>.*<\/summary>.*href="\/t\/children\/7\/ai-reviews".*<\/details>/s);
    expect(live).not.toContain('/coaching/example');
    vi.mocked(isDemoWorkspaceChild).mockReturnValueOnce(true);
    expect(markup(month, recommendation)).toMatch(/<details>.*<\/summary>.*href="\/t\/children\/7\/coaching\/example".*<\/details>/s);
  });

  it('이전 추천과 확인할 수 없는 출처에는 직접 연결된 근거가 없다고 표시한다', () => {
    const invalid = { ...recommendation, evidence: {
      reason: '확인되지 않은 설명', sourceId: 'old', sourcePublisher: '출처', sourceTitle: '제목',
      sourceUrl: 'javascript:alert(1)', sourceSection: '',
    } };
    for (const item of [recommendation, invalid]) {
      const html = markup(month, item);
      expect(html).toContain('이 추천에 직접 연결된 근거 자료가 아직 없어요.');
      expect(html).not.toContain('javascript:');
      expect(html).not.toContain('확인되지 않은 설명');
      expect(html).toContain(recommendation.sourceTitle);
    }
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
