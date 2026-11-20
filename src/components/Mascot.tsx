import { useState } from 'react';

/**
 * 모찌 캐릭터 그림(public/characters/<이름>.webp, 투명 바탕). 모두 꾸밈이라 alt는 비우고, 뜻은 곁의 글이 전한다.
 * - family: 부모·아이 모찌 / teddy: 테디를 품은 모찌 / dome: 버터빛 모찌 / friend: 아이보리 모찌 친구 / teacher: 안경·앞치마 모찌
 * 캐릭터는 아이를 나타내지 않는다(아이 사진·생김새 자리에 쓰지 않는다).
 */
export const MASCOT_NAMES = ['family', 'teddy', 'dome', 'friend', 'teacher'] as const;
export type MascotName = (typeof MASCOT_NAMES)[number];

export interface MascotProps {
  name: MascotName;
  /** 그림 너비(px). 기본 120. 높이는 그림 비율을 따르고, 좁은 자리에서는 너비에 맞춰 줄어든다. */
  size?: number;
  className?: string;
}

/**
 * 그림의 세로/가로 비율. 불러오기 전에 자리를 미리 잡아 화면이 밀리지 않게 하려는 값이다.
 * 파일을 바꿔 비율이 달라져도 그림은 제 비율대로 보인다(CSS height: auto).
 */
export const MASCOT_RATIO: Record<MascotName, number> = {
  family: 462 / 640,
  teddy: 497 / 640,
  dome: 505 / 640,
  friend: 488 / 640,
  teacher: 539 / 640,
};

export function mascotSrc(name: MascotName): string {
  return `${import.meta.env.BASE_URL}characters/${name}.webp`;
}

/** 한 번 못 불러온 그림은 이 탭에서 다시 그리지 않는다(자리가 잡혔다 사라지며 화면이 흔들리지 않게). */
const failed = new Set<MascotName>();

/** 그림을 못 불러오면 자리째 빠진다(깨진 그림 표시 없음). */
export default function Mascot({ name, size = 120, className }: MascotProps) {
  const [, rerender] = useState(0);
  if (failed.has(name)) return null;
  return (
    <img
      className={className ? `mascot ${className}` : 'mascot'}
      src={mascotSrc(name)}
      alt=""
      width={size}
      height={Math.round(size * MASCOT_RATIO[name])}
      decoding="async"
      onError={() => {
        failed.add(name);
        rerender((n) => n + 1);
      }}
    />
  );
}
