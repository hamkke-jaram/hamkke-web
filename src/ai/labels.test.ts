import { describe, expect, it } from 'vitest';
import { FRAME_MAX_BYTES, MAX_FRAMES, frameByteLimit, frameTimes } from './frames';
import { ADULT_RESPONSE_LABEL, CHILD_STATE_LABEL, FOCUS_LABEL, SOURCE_LABEL, formatClock, labelsOf, peopleLabel } from './labels';

describe('화면 표시 문구', () => {
  it('명세 6장의 태그를 모두 담고 있다', () => {
    expect(Object.keys(CHILD_STATE_LABEL).sort()).toEqual(
      [
        'CALM',
        'FOCUSED',
        'MOVING_AROUND',
        'PLAYING_ALONE',
        'PLAYING_TOGETHER',
        'REFUSING',
        'SEEKING_ADULT',
        'THROWING_OR_HITTING',
        'UPSET_CRYING',
      ].sort(),
    );
    expect(Object.keys(ADULT_RESPONSE_LABEL).sort()).toEqual(
      ['COMFORTING', 'JOINING_PLAY', 'REDIRECTING', 'SETTING_LIMIT', 'TALKING', 'WAITING'].sort(),
    );
    expect(CHILD_STATE_LABEL.REFUSING).toBe('싫다고 표현해요');
    expect(ADULT_RESPONSE_LABEL.WAITING).toBe('기다려 줘요');
    expect(SOURCE_LABEL).toEqual({ HOME: '가정', INSTITUTION: '기관' });
    expect(FOCUS_LABEL.HARD_MOMENT).toBe('힘든 순간 함께하기');
  });

  it('목록에 없는 값과 겹치는 값은 보여 주지 않는다', () => {
    expect(labelsOf(['CALM', 'UNKNOWN_TAG', 'CALM', 'toString'], CHILD_STATE_LABEL)).toEqual(['차분해요']);
    expect(labelsOf(null, CHILD_STATE_LABEL)).toEqual([]);
    expect(labelsOf(undefined, ADULT_RESPONSE_LABEL)).toEqual([]);
  });

  it('시각을 mm:ss로 적는다', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(12.5)).toBe('00:12');
    expect(formatClock(75)).toBe('01:15');
    expect(formatClock(-3)).toBe('00:00');
    expect(formatClock(Number.NaN)).toBe('00:00');
  });

  it('사람 수를 적는다(3은 3명 이상)', () => {
    expect(peopleLabel(0)).toBe('0명');
    expect(peopleLabel(2)).toBe('2명');
    expect(peopleLabel(3)).toBe('3명 이상');
    expect(peopleLabel(null)).toBeNull();
    expect(peopleLabel(undefined)).toBeNull();
  });
});

describe('장면 사진 고르기', () => {
  it('처음과 끝 5%를 뺀 구간에서 고르게 고른다', () => {
    const times = frameTimes(100, 6);
    expect(times).toHaveLength(6);
    expect(times[0]).toBeCloseTo(5);
    expect(times[5]).toBeCloseTo(95);
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeCloseTo(18);
    expect(frameTimes(100, 1)).toEqual([50]);
  });

  it('6장을 넘겨 고르지 않는다', () => {
    expect(frameTimes(60, 20)).toHaveLength(MAX_FRAMES);
    expect(frameTimes(60, 0)).toHaveLength(1);
  });

  it('한 장은 300KB, 전체(base64)는 2MB를 넘지 않게 한도를 잡는다', () => {
    for (let n = 1; n <= MAX_FRAMES; n++) {
      const limit = frameByteLimit(n);
      expect(limit).toBeLessThanOrEqual(FRAME_MAX_BYTES);
      const base64Chars = Math.ceil(limit / 3) * 4 * n;
      expect(base64Chars).toBeLessThan(2 * 1024 * 1024 - 4096);
    }
  });
});
