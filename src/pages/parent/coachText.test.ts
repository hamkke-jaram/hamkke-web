import { describe, expect, it } from 'vitest';
import { coachDateLabel, firstSentence } from './coachText';

describe('firstSentence', () => {
  it('첫 문장만 글자 그대로 돌려준다', () => {
    expect(firstSentence('공을 굴리고 잠시 기다려 보세요. 아이가 다시 굴리면 크게 반겨 주세요.')).toBe(
      '공을 굴리고 잠시 기다려 보세요.',
    );
    expect(firstSentence('오늘은 어땠나요? 천천히 해도 괜찮아요.')).toBe('오늘은 어땠나요?');
  });

  it('따온 말 안의 느낌표·물음표에서는 자르지 않는다', () => {
    expect(firstSentence('이렇게 말해 보세요. "블록 높이 쌓았네!" 하고요.')).toBe('이렇게 말해 보세요.');
    expect(firstSentence('"와, 높다!" 하고 말해 주세요. 그다음은 기다려요.')).toBe('"와, 높다!" 하고 말해 주세요.');
  });

  it('숫자 속 점에서는 자르지 않는다', () => {
    expect(firstSentence('1.5초쯤 기다려 보세요. 그다음에 말을 걸어요.')).toBe('1.5초쯤 기다려 보세요.');
  });

  it('문장 끝이 없으면 본문 전체, 비어 있으면 빈 글', () => {
    expect(firstSentence('한 줄짜리 본문')).toBe('한 줄짜리 본문');
    expect(firstSentence('끝에만 마침표가 있어요.')).toBe('끝에만 마침표가 있어요.');
    expect(firstSentence('   ')).toBe('');
    expect(firstSentence(null)).toBe('');
  });

  it('줄이 바뀌어도 첫 문장에서 끊는다', () => {
    expect(firstSentence('첫 줄이에요.\n둘째 줄이에요.')).toBe('첫 줄이에요.');
  });
});

describe('coachDateLabel', () => {
  const now = new Date(2026, 10, 18, 15, 0, 0); // 이 기기 시각 11월 18일

  it("오늘 받은 카드는 '오늘 · 11.18'", () => {
    expect(coachDateLabel(new Date(2026, 10, 18, 9, 30).toISOString(), now)).toBe('오늘 · 11.18');
  });

  it('다른 날 받은 카드는 날짜만, 날은 두 자리', () => {
    expect(coachDateLabel(new Date(2026, 10, 12, 9, 30).toISOString(), now)).toBe('11.12');
    expect(coachDateLabel(new Date(2026, 10, 5, 9, 30).toISOString(), now)).toBe('11.05');
    // 같은 날짜 숫자라도 해가 다르면 오늘이 아니다.
    expect(coachDateLabel(new Date(2025, 10, 18, 9, 30).toISOString(), now)).toBe('11.18');
  });

  it('읽을 수 없는 시각이면 빈 글', () => {
    expect(coachDateLabel('날짜 아님', now)).toBe('');
  });
});

describe('코칭 화면 문구(2판)', () => {
  it('본문을 단계로 나누고, 넘치면 마지막 단계에 이어 붙인다', async () => {
    const { splitSteps } = await import('./coachText');
    expect(splitSteps('아이를 봐요. 잠깐 기다려요! 짧게 말해요.')).toEqual(['아이를 봐요.', '잠깐 기다려요!', '짧게 말해요.']);
    expect(splitSteps('하나. 둘. 셋. 넷. 다섯.', 3)).toEqual(['하나.', '둘.', '셋. 넷. 다섯.']);
    expect(splitSteps('"높다!" 하고 말해요. 1.5초 기다려요.')).toEqual(['"높다!" 하고 말해요.', '1.5초 기다려요.']);
    expect(splitSteps('')).toEqual([]);
  });

  it('달 묶음과 날짜 이름', async () => {
    const { dayLabel, monthKey, monthLabel } = await import('./coachText');
    const now = new Date(2026, 10, 21, 10);
    expect(dayLabel(new Date(2026, 10, 21, 8).toISOString(), now)).toBe('오늘 · 11월 21일');
    expect(dayLabel(new Date(2026, 10, 20, 8).toISOString(), now)).toBe('어제 · 11월 20일');
    expect(dayLabel(new Date(2026, 10, 18, 8).toISOString(), now)).toBe('11월 18일');
    expect(monthLabel(monthKey(new Date(2026, 10, 3).toISOString()))).toBe('2026년 11월');
  });
});
