/**
 * 시나브로 글자 로고(public/brand/wordmark.svg, Figma '해커톤_발자국' 스플래시·홈 머리의 노란 글자, 137×25).
 * 로고가 곧 이름이라 alt에 '시나브로'를 적는다. 노란 글자(#FFC144)라 흰 바탕 대비가 낮지만 로고는 글자 대비 기준에서 빠진다.
 * 아이콘 자리(이전 mark.webp)에는 public/brand/mark.webp가 그대로 남아 있다.
 */
const RATIO = 25 / 137;

export default function BrandMark({ width = 92 }: { width?: number }) {
  return (
    <img
      className="brand-mark"
      src={`${import.meta.env.BASE_URL}brand/wordmark.svg`}
      alt="시나브로"
      width={width}
      height={Math.round(width * RATIO)}
      decoding="async"
    />
  );
}
