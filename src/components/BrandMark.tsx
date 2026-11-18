import { useState } from 'react';

/** 로고 마크(public/brand/mark.webp, 256×179, 투명 바탕). 꾸밈이라 alt는 비운다 — 이름은 곁의 '함께자람' 글자가 전한다. */
const RATIO = 179 / 256;

let failed = false;

/** 못 불러오면 자리째 빠진다(깨진 그림 표시 없음). */
export default function BrandMark({ width = 34 }: { width?: number }) {
  const [, rerender] = useState(0);
  if (failed) return null;
  return (
    <img
      className="brand-mark"
      src={`${import.meta.env.BASE_URL}brand/mark.webp`}
      alt=""
      width={width}
      height={Math.round(width * RATIO)}
      decoding="async"
      onError={() => {
        failed = true;
        rerender((n) => n + 1);
      }}
    />
  );
}
