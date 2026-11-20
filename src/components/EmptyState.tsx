import type { ReactNode } from 'react';
import Mascot, { type MascotName } from './Mascot';

export interface EmptyStateProps {
  /** 위에 놓는 캐릭터. 빼면 글만 보인다. */
  mascot?: MascotName;
  /** 캐릭터 한 변 길이(px). 기본 160. */
  mascotSize?: number;
  title: string;
  /** 제목 단계. 화면의 제목 순서에 맞춘다. 기본 'h2'. */
  titleAs?: 'h1' | 'h2' | 'h3';
  /** 제목에 붙일 id(aria-labelledby·포커스 이동용). */
  titleId?: string;
  /** 한두 줄 설명. 글 또는 <p> 여러 개. */
  children?: ReactNode;
  /** 아래에 놓는 버튼(들). 보통 주 버튼 하나. */
  action?: ReactNode;
  className?: string;
}

/** 빈 화면 안내: 가운데 정렬로 캐릭터 → 제목 → 설명 → 버튼. */
export default function EmptyState({
  mascot,
  mascotSize = 160,
  title,
  titleAs: Title = 'h2',
  titleId,
  children,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={className ? `empty-state ${className}` : 'empty-state'}>
      {mascot && <Mascot name={mascot} size={mascotSize} live />}
      {/* id를 준 제목은 코드에서 포커스를 옮길 수 있게 한다(다시 불러온 뒤 등). 탭 순서에는 들지 않는다. */}
      <Title id={titleId} tabIndex={titleId ? -1 : undefined} className="empty-state-title">
        {title}
      </Title>
      {children != null && children !== false && (
        <div className="empty-state-body">{typeof children === 'string' ? <p>{children}</p> : children}</div>
      )}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}
