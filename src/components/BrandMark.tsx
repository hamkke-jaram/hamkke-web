import { MASCOT_RATIO, mascotSrc } from './Mascot';

/** 상단바와 로그인에 사용하는 시나브로 모찌 로고. */
export default function BrandMark({ width = 44 }: { width?: number }) {
  return (
    <img
      className="brand-mark"
      src={mascotSrc('dome')}
      alt="시나브로"
      width={width}
      height={Math.round(width * MASCOT_RATIO.dome)}
      decoding="async"
    />
  );
}
