import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Child } from '../../api/types';
import Mascot from '../../components/Mascot';

/*
 * 아이 홈 오른쪽 아래의 노란 둥근 버튼(Figma '홈_하단 버튼'). 누르면 위로 펼쳐진다:
 *   아이 추가하기(+) · 다른 아이로 가기(이름 첫 글자) · 선생님 이야기(선생님 모찌)
 * 펼친 동안은 화면을 살짝 어둡게 덮고, 덮개·X·Esc로 닫는다. 메뉴 항목은 보통의 링크·버튼이라 키보드로 차례대로 간다.
 */

interface Props {
  /** 지금 보는 아이를 뺀 다른 아이들. */
  others: Child[];
  /** 아이를 더 등록할 수 있는지(최대 수 미만). */
  canAdd: boolean;
  /** 선생님 이야기 구역으로 간다. */
  onStory: () => void;
}

export default function HomeFab({ others, canAdd, onStory }: Props) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      {open && <div className="fab-scrim" aria-hidden="true" onClick={close} />}
      <div className={open ? 'fab open' : 'fab'}>
        {open && (
          <ul className="fab-menu" id={menuId}>
            {canAdd && (
              <li>
                <Link to="/p/children/new" className="fab-item" onClick={close}>
                  <span className="fab-label">아이 추가하기</span>
                  <span className="fab-dot" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="24" height="24">
                      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </span>
                </Link>
              </li>
            )}
            {others.map((c) => (
              <li key={c.id}>
                <Link to={`/p/children/${c.id}`} className="fab-item" onClick={close}>
                  <span className="fab-label">{c.nickname}</span>
                  <span className="fab-dot initial" aria-hidden="true">
                    {c.nickname.slice(0, 1)}
                  </span>
                </Link>
              </li>
            ))}
            <li>
              <button
                type="button"
                className="fab-item"
                data-demo="childhome-story-jump"
                onClick={() => {
                  close();
                  onStory();
                }}
              >
                <span className="fab-label">선생님 이야기</span>
                <span className="fab-dot teacher" aria-hidden="true">
                  <Mascot name="teacher" size={48} />
                </span>
              </button>
            </li>
          </ul>
        )}
        <button
          ref={toggleRef}
          type="button"
          className="fab-toggle"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          aria-label={open ? '메뉴 닫기' : '아이 추가·다른 아이·선생님 이야기 메뉴'}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? (
            <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
              <circle cx="5.5" cy="12" r="1.9" fill="currentColor" />
              <circle cx="12" cy="12" r="1.9" fill="currentColor" />
              <circle cx="18.5" cy="12" r="1.9" fill="currentColor" />
            </svg>
          )}
        </button>
      </div>
    </>
  );
}
