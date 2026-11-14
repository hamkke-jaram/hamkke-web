import { describe, expect, it } from 'vitest';
import { thisWeekStart } from './week';

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
