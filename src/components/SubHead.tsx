import type { Ref } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Figma 2판의 하위 화면 머리: 왼쪽 '‹'(뒤로), 가운데 화면 제목(h1). 오른쪽은 비워 제목을 가운데에 둔다.
 * 뒤로는 앱 안에서 들어왔으면 이전 화면으로, 주소로 바로 열었으면 fallback으로 간다.
 * 닫기(×)로 쓰려면 icon="close".
 */
export default function SubHead({
  title,
  fallback = '/',
  icon = 'back',
  titleRef,
}: {
  title: string;
  fallback?: string;
  icon?: 'back' | 'close';
  titleRef?: Ref<HTMLHeadingElement>;
}) {
  const nav = useNavigate();
  const loc = useLocation();
  const inApp = loc.key !== 'default';
  return (
    <div className="sub-head">
      <button
        type="button"
        className="sub-head-btn"
        aria-label={icon === 'close' ? '닫기' : '뒤로'}
        onClick={() => (inApp ? nav(-1) : nav(fallback))}
      >
        {icon === 'close' ? (
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <h1 className="sub-head-title" ref={titleRef} tabIndex={-1}>
        {title}
      </h1>
      <span className="sub-head-btn" aria-hidden="true" />
    </div>
  );
}
