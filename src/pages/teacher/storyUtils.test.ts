import { describe, expect, it } from 'vitest';
import { currentChild, rememberChild, storyDate, storyPose, storyTitle, todayIso } from './storyUtils';

const kids = [
  { id: 3, nickname: '민서', ageMonths: 50, linkedAt: '2026-11-01T00:00:00Z' },
  { id: 7, nickname: '민준', ageMonths: 40, linkedAt: '2026-11-02T00:00:00Z' },
];

describe('선생님 이야기 도우미', () => {
  it('날짜를 "11월 20일"로 보여 준다', () => {
    expect(storyDate('2026-11-20')).toBe('11월 20일');
    expect(storyDate('2026-01-05')).toBe('1월 5일');
    expect(storyDate('이상한 값')).toBe('이상한 값');
  });

  it('오늘 날짜를 YYYY-MM-DD로', () => {
    expect(todayIso(new Date(2026, 10, 3))).toBe('2026-11-03');
  });

  it('제목이 없으면 본문 첫 줄을 20자까지', () => {
    expect(storyTitle({ title: ' 즐거운 공놀이 ', content: '본문' })).toBe('즐거운 공놀이');
    expect(storyTitle({ title: null, content: '낮잠을 푹 잤어요.\n둘째 줄' })).toBe('낮잠을 푹 잤어요.');
    expect(storyTitle({ content: '가'.repeat(25) })).toBe(`${'가'.repeat(20)}…`);
  });

  it('첨부한 카드가 있으면 카드 그림, 없으면 돌아가며 고른 그림', () => {
    expect(storyPose({ id: 1, card: { deliveryId: 1, cardId: 1, code: undefined, title: 't', body: 'b' } })).toBeTruthy();
    expect(storyPose({ id: 4, card: null })).toBe(storyPose({ id: 8, card: null }));
  });

  it('기억한 아이가 목록에 있으면 그 아이, 없으면 첫 아이', () => {
    expect(currentChild([], 3)).toBeNull();
    expect(currentChild(kids, 7)?.nickname).toBe('민준');
    expect(currentChild(kids, 99)?.nickname).toBe('민서');
    // 저장소를 쓸 수 없어도(테스트 환경·사생활 보호 창) 멈추지 않고 첫 아이를 보여 준다.
    expect(() => rememberChild(7)).not.toThrow();
  });
});
