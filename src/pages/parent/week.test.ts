import { describe, expect, it } from 'vitest';
import { WEEKDAYS, shortDate, thisWeekStart, thisWeekStats } from './week';

describe('thisWeekStart (한국 시간 월요일)', () => {
  it('한국 시간 일요일 밤은 그 주 월요일', () => {
    // 2026-11-15(일) 23:30 KST = 14:30 UTC
    expect(thisWeekStart(Date.parse('2026-11-15T14:30:00Z'))).toBe('2026-11-09');
  });

  it('한국 시간 월요일 0시 30분은 이미 새 주(UTC로는 아직 일요일)', () => {
    // 2026-11-16(월) 00:30 KST = 2026-11-15 15:30 UTC
    expect(thisWeekStart(Date.parse('2026-11-15T15:30:00Z'))).toBe('2026-11-16');
  });

  it('월요일 낮과 토요일은 같은 주', () => {
    expect(thisWeekStart(Date.parse('2026-11-16T03:00:00Z'))).toBe('2026-11-16');
    expect(thisWeekStart(Date.parse('2026-11-21T10:00:00Z'))).toBe('2026-11-16');
  });

  it('달이 바뀌는 주도 월요일을 돌려준다', () => {
    // 2026-12-02(수) → 2026-11-30(월)
    expect(thisWeekStart(Date.parse('2026-12-02T01:00:00Z'))).toBe('2026-11-30');
  });
});

describe('thisWeekStats (이번 주 요일별 함께한 시간)', () => {
  // 2026-11-18(수) 12:00 KST
  const NOW = Date.parse('2026-11-18T03:00:00Z');

  it('이번 주 기록만 요일 칸에 모으고 합과 개수를 센다', () => {
    const w = thisWeekStats(
      [
        { recordedAt: '2026-11-16T01:00:00Z', jointPlaySeconds: 60 }, // 월 10:00 KST
        { recordedAt: '2026-11-18T02:00:00Z', jointPlaySeconds: 90 }, // 수
        { recordedAt: '2026-11-18T02:30:00Z', jointPlaySeconds: 30 }, // 수(같은 날 두 번)
        { recordedAt: '2026-11-12T02:00:00Z', jointPlaySeconds: 500 }, // 지난주
      ],
      NOW,
    );
    expect(w.start).toBe('2026-11-16');
    expect(w.end).toBe('2026-11-22');
    expect(w.days).toEqual([60, 0, 120, 0, 0, 0, 0]);
    expect(w.totalSeconds).toBe(180);
    expect(w.count).toBe(3);
    expect(w.todayIndex).toBe(2);
  });

  it('한국 시간으로 주를 나눈다: UTC 일요일 저녁은 한국의 월요일', () => {
    // 2026-11-15 15:30 UTC = 11-16(월) 00:30 KST → 이번 주 월요일 칸
    // 2026-11-15 14:30 UTC = 11-15(일) 23:30 KST → 지난주
    const w = thisWeekStats(
      [
        { recordedAt: '2026-11-15T15:30:00Z', jointPlaySeconds: 40 },
        { recordedAt: '2026-11-15T14:30:00Z', jointPlaySeconds: 70 },
      ],
      NOW,
    );
    expect(w.days).toEqual([40, 0, 0, 0, 0, 0, 0]);
    expect(w.count).toBe(1);
  });

  it('일요일 밤까지가 이번 주, 그다음은 세지 않는다', () => {
    const w = thisWeekStats(
      [
        { recordedAt: '2026-11-22T14:59:00Z', jointPlaySeconds: 10 }, // 일 23:59 KST
        { recordedAt: '2026-11-22T15:00:00Z', jointPlaySeconds: 99 }, // 다음 주 월 00:00 KST
      ],
      NOW,
    );
    expect(w.days).toEqual([0, 0, 0, 0, 0, 0, 10]);
    expect(w.count).toBe(1);
  });

  it('기록이 없거나 읽을 수 없는 값이어도 7칸을 돌려준다', () => {
    expect(thisWeekStats(null, NOW).days).toEqual([0, 0, 0, 0, 0, 0, 0]);
    const w = thisWeekStats(
      [
        { recordedAt: '날짜 아님', jointPlaySeconds: 50 },
        { recordedAt: '2026-11-17T02:00:00Z', jointPlaySeconds: Number.NaN },
        { recordedAt: '2026-11-17T03:00:00Z', jointPlaySeconds: -5 },
      ],
      NOW,
    );
    expect(w.days).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(w.totalSeconds).toBe(0);
    // 시각을 읽을 수 있는 기록은 함께한 시간이 0이어도 기록 수에는 든다.
    expect(w.count).toBe(2);
  });

  it('요일 이름은 월요일부터 7개', () => {
    expect(WEEKDAYS).toEqual(['월', '화', '수', '목', '금', '토', '일']);
  });
});

describe('shortDate', () => {
  it("'11.18'처럼 달은 그대로, 날은 두 자리", () => {
    expect(shortDate('2026-11-18')).toBe('11.18');
    expect(shortDate('2026-03-05')).toBe('3.05');
  });
});
