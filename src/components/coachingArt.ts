import type { Card } from '../api/types';

/**
 * 코칭 카드에 곁들이는 모찌 그림(public/art/mochi-*.webp, Figma '해커톤_발자국'의 코칭 모찌). 꾸밈이라 뜻은 카드 제목이 전한다.
 * 포즈(놀이 종류)는 8가지, 그림은 6장이라 비슷한 놀이는 같은 그림을 쓴다.
 */
export const POSES = ['ball-wait', 'blocks', 'book', 'clap-sing', 'comfort', 'listen', 'breathe', 'laugh'] as const;
export type Pose = (typeof POSES)[number];

/** 카드 코드 → 포즈. 서버의 코칭 카드 22장(V2·V5 마이그레이션)을 모두 적는다. */
const POSE_BY_CODE: Record<string, Pose> = {
  'RS-A-01': 'ball-wait',
  'JP-G-02': 'ball-wait',
  'FIRST-02': 'blocks',
  'JP-S-01': 'blocks',
  'JP-A-01': 'blocks',
  'GEN-A-02': 'book',
  'HM-A-03': 'book',
  'RS-G-01': 'clap-sing',
  'RS-S-01': 'clap-sing',
  'JP-G-01': 'clap-sing',
  'HM-A-06': 'clap-sing',
  'CA-A-01': 'comfort',
  'HM-A-01': 'comfort',
  'CA-S-01': 'listen',
  'HM-A-02': 'listen',
  'HM-A-05': 'listen',
  'GEN-S-01': 'breathe',
  'HM-A-04': 'breathe',
  'CA-G-01': 'breathe',
  'FIRST-01': 'laugh',
  'GEN-A-01': 'laugh',
  'GEN-G-01': 'laugh',
};

/** 코드가 없거나 모르는 코드일 때: 카드의 초점 → 포즈. */
const POSE_BY_FOCUS: Record<string, Pose> = {
  JOINT_PLAY: 'blocks',
  RESPONSE: 'ball-wait',
  CALM: 'breathe',
  HARD_MOMENT: 'comfort',
  GENERAL: 'laugh',
};

const FALLBACK: Pose = 'laugh';

/** 서버가 보낸 값이 무엇이든(없음·모르는 값·객체 기본 속성 이름) 포즈 하나를 돌려준다. */
function lookup(table: Record<string, Pose>, key: unknown): Pose | undefined {
  return typeof key === 'string' && Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
}

export function poseFor(card: Pick<Card, 'code' | 'metricFocus'>): Pose {
  return lookup(POSE_BY_CODE, card.code?.trim().toUpperCase()) ?? lookup(POSE_BY_FOCUS, card.metricFocus) ?? FALLBACK;
}

/** 포즈 → 그림 파일(public/art/<이름>.webp). */
export const ART_BY_POSE: Record<Pose, string> = {
  'ball-wait': 'mochi-ball', // 보랏빛 공을 굴리고 기다리기
  blocks: 'mochi-blocks', // 블록 쌓기
  book: 'mochi-tower', // 함께 하나씩 쌓아 올리기(차례 주고받기)
  'clap-sing': 'mochi-tower',
  comfort: 'mochi-bunny', // 꼭 안아 주기
  breathe: 'mochi-hug', // 곁에 머물며 차분히
  listen: 'mochi-wave', // 작은 표현에 답하기
  laugh: 'mochi-wave',
};

export function poseSrc(pose: Pose): string {
  return `${import.meta.env.BASE_URL}art/${ART_BY_POSE[pose]}.webp`;
}

/** 테스트용: 코드 표에 적힌 코드들. */
export const KNOWN_CODES = Object.keys(POSE_BY_CODE);
