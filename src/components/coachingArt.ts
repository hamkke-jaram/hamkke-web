import type { Card } from '../api/types';

/** 코칭 카드에 곁들이는 병아리 그림(public/coaching/<포즈>.webp, 384×384). 꾸밈이라 뜻은 카드 제목이 전한다. */
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

export function poseSrc(pose: Pose): string {
  return `${import.meta.env.BASE_URL}coaching/${pose}.webp`;
}

/** 테스트용: 코드 표에 적힌 코드들. */
export const KNOWN_CODES = Object.keys(POSE_BY_CODE);
