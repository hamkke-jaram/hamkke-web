import type { ReactNode } from 'react';

/*
 * 부모 화면에서 쓰는 작은 선 아이콘. 모두 꾸밈이라 화면 낭독기에는 읽히지 않고(aria-hidden), 뜻은 곁의 글이 전한다.
 * 색은 글자색(currentColor)을 따른다. 선 굵기·모서리는 공통 아이콘(src/components/icons.tsx)과 같게 맞췄다.
 */

function Icon({ size = 22, children }: { size?: number; children: ReactNode }) {
  return (
    <svg
      className="p-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** 영상 촬영 */
export function CameraIcon({ size }: { size?: number }) {
  return (
    <Icon size={size}>
      <rect x="2.5" y="6" width="13" height="12" rx="3" />
      <path d="M15.5 10.5 21 7.5v9l-5.5-3" />
    </Icon>
  );
}

/** 앨범에서 고르기 */
export function AlbumIcon({ size }: { size?: number }) {
  return (
    <Icon size={size}>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="m4 17 5-5 4 4 2.5-2.5L20 18" />
    </Icon>
  );
}

/** 덧붙이는 안내 */
export function InfoIcon({ size }: { size?: number }) {
  return (
    <Icon size={size}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 7.6v.2" />
    </Icon>
  );
}

/** 더 보기·다음 화면(>) */
export function ChevronIcon({ size }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="m9 5 7 7-7 7" />
    </Icon>
  );
}

/** 펼쳐 보기(→) */
export function ArrowIcon({ size }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M4.5 12h15" />
      <path d="m13.5 6 6 6-6 6" />
    </Icon>
  );
}
