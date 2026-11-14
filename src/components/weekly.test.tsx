import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { WeekSummary } from '../api/types';
import { WeeklyBars, WeeklyTable, availableMetrics } from './ui';

const WEEKS: WeekSummary[] = [
  { weekStart: '2026-11-02', recordCount: 1, jointPlayRatio: 0.4, responseLatencySec: 3.2, distressPerTenMinutes: 1 },
  { weekStart: '2026-11-09', recordCount: 3, jointPlayRatio: 0.55, responseLatencySec: 2.5, distressPerTenMinutes: 0.5 },
];

describe('주간 기록 그림·표', () => {
  it('값이 있는 항목만 고를 수 있다(공유하지 않은 항목은 빠진다)', () => {
    expect(availableMetrics(WEEKS)).toEqual(['jointPlayRatio', 'responseLatencySec', 'distressPerTenMinutes']);
    expect(availableMetrics([{ weekStart: '2026-11-09', recordCount: 2, responseLatencySec: 2 }])).toEqual(['responseLatencySec']);
  });

  it('막대는 고른 항목의 값과 주별 기록 수를 함께 알려 준다', () => {
    const ratio = renderToStaticMarkup(<WeeklyBars weeks={WEEKS} />);
    expect(ratio).toContain('주별 함께한 시간 비율');
    expect(ratio).toContain('55%');
    expect(ratio).toContain('기록 3개');
    const latency = renderToStaticMarkup(<WeeklyBars weeks={WEEKS} metric="responseLatencySec" />);
    expect(latency).toContain('2.5초');
    const distress = renderToStaticMarkup(<WeeklyBars weeks={WEEKS} metric="distressPerTenMinutes" />);
    expect(distress).toContain('0.5회');
  });

  it('표에는 주별 기록 수 칸이 있다', () => {
    const html = renderToStaticMarkup(<WeeklyTable weeks={WEEKS} />);
    expect(html).toContain('<th>기록</th>');
    expect(html).toContain('3개');
  });
});
