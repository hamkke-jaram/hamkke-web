import type { MetricFocus, ObservationSource } from '../api/types';

/**
 * AI 관찰 기록에 쓰는 화면 표시 문구. 값과 문구는 hamkke-api/docs/ai-observation.md 6장과 같게 유지한다.
 * 목록에 없는 값은 화면에 보여 주지 않는다(labelsOf가 걸러 낸다).
 */

/** 아이 모습 태그 (childStates) */
export const CHILD_STATE_LABEL: Record<string, string> = {
  PLAYING_TOGETHER: '어른과 함께 놀아요',
  PLAYING_ALONE: '혼자 놀아요',
  FOCUSED: '한 가지에 푹 빠져 있어요',
  MOVING_AROUND: '자리를 자주 옮겨요',
  SEEKING_ADULT: '어른에게 다가가요',
  UPSET_CRYING: '울거나 속상해해요',
  REFUSING: '싫다고 표현해요',
  THROWING_OR_HITTING: '물건을 던지거나 쳐요',
  CALM: '차분해요',
};

/** 어른 반응 태그 (adultResponses) */
export const ADULT_RESPONSE_LABEL: Record<string, string> = {
  JOINING_PLAY: '놀이에 함께해요',
  TALKING: '말을 걸어 줘요',
  WAITING: '기다려 줘요',
  COMFORTING: '안아 주거나 달래 줘요',
  REDIRECTING: '다른 놀이로 이끌어요',
  SETTING_LIMIT: '안 되는 것을 알려 줘요',
};

/** 기록을 만든 곳 */
export const SOURCE_LABEL: Record<ObservationSource, string> = {
  HOME: '가정',
  INSTITUTION: '기관',
};

/** 코칭 카드의 초점. HARD_MOMENT는 AI 관찰 기록과 함께 생긴 초점이다. */
export const FOCUS_LABEL: Record<MetricFocus, string> = {
  JOINT_PLAY: '함께 놀기',
  RESPONSE: '반응 주고받기',
  CALM: '편안한 마음',
  GENERAL: '일상 속 양육',
  HARD_MOMENT: '힘든 순간 함께하기',
};

/** 태그 값들을 화면 문구로 바꾼다. 모르는 값과 겹치는 값은 뺀다. */
export function labelsOf(tags: readonly string[] | null | undefined, map: Record<string, string>): string[] {
  const out: string[] = [];
  for (const tag of tags ?? []) {
    const label = Object.prototype.hasOwnProperty.call(map, tag) ? map[tag] : undefined;
    if (label && !out.includes(label)) out.push(label);
  }
  return out;
}

/** 사진 시각(초)을 mm:ss로. */
export function formatClock(seconds: number): string {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** 화면에 보인 사람 수. 3은 '3명 이상'. 알 수 없으면 null. */
export function peopleLabel(count: number | null | undefined): string | null {
  if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) return null;
  if (count >= 3) return '3명 이상';
  return `${Math.floor(count)}명`;
}
