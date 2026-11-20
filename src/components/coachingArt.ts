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

export function poseFor(card: Partial<Pick<Card, 'code' | 'metricFocus'>>): Pose {
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

/**
 * 그림의 움직임 종류. 같은 그림은 같은 움직임이다(움직임이 그림 속 몸짓에 맞춰져 있어서).
 * - hug(큰 모찌가 작은 모찌를 안음): 꼭 안듯 한 번 오므렸다 펴기 + 하트 둘이 천천히
 * - cuddle(토끼 인형을 품음): 가장 차분하게 느린 흔들 + 하트 하나
 * - ball(공 굴리고 기다리기): 통통 작은 뜀 + 바닥 그림자
 * - stack(블록·함께 쌓기): 쌓인 것이 흔들리듯 좌우로 기울기
 * - wave(손 흔들기): 손 흔들듯 기울기 + ♪·반짝이
 * 카드 뜻이나 아이 기록과는 상관없다(기록에 따라 기뻐하거나 슬퍼하지 않는다).
 */
export type ArtMotion = 'hug' | 'cuddle' | 'ball' | 'stack' | 'wave';

const MOTION_BY_ART: Record<string, ArtMotion> = {
  'mochi-hug': 'hug',
  'mochi-bunny': 'cuddle',
  'mochi-ball': 'ball',
  'mochi-blocks': 'stack',
  'mochi-tower': 'stack',
  'mochi-wave': 'wave',
};

/**
 * 코칭 모찌 그림(<img>)에 붙일 움직임 클래스. 예: `<img className={`hc-art ${artMotionFor(pose)}`} … />`
 * - 말랑한 숨쉬기 + 그림별 몸짓, 화면에 들어오거나 캐러셀에서 지금 카드(.is-active 안)가 되면 한 번 톡 등장,
 *   감싼 링크·버튼을 누르는 동안 말랑하게 눌림. 장식(하트·음표·반짝이·그림자)은 그림을 감싼 칸에 그린다(:has).
 * - 화면 밖이면 멈추고, '움직이는 캐릭터'가 꺼져 있으면 정지 그림이다(artMotion.css, artMotion.ts).
 */
export function artMotionFor(pose: Pose): string {
  const art: string = Object.prototype.hasOwnProperty.call(ART_BY_POSE, pose) ? ART_BY_POSE[pose] : '';
  const kind: ArtMotion = Object.prototype.hasOwnProperty.call(MOTION_BY_ART, art) ? MOTION_BY_ART[art] : 'hug';
  return `art-motion art-${kind}`;
}

/** 테스트용: 코드 표에 적힌 코드들. */
export const KNOWN_CODES = Object.keys(POSE_BY_CODE);
