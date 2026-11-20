import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { TeacherChild } from '../../api/types';

/*
 * 선생님 홈 오른쪽 아래의 노란 둥근 버튼(Figma '선생님 홈화면' 펼친 모습). 누르면 위로 펼쳐진다:
 *   아이 추가하기(+) · 연결된 다른 아이들(사람 모양) — 고르면 홈이 그 아이의 이야기로 바뀐다.
 * 보호자 홈의 떠 있는 버튼과 같은 모양(parent.css .fab-*)이다. 덮개·X·Esc로 닫는다.
 */

interface Props {
  /** 지금 보는 아이를 뺀 연결된 아이들. */
  others: TeacherChild[];
  onPick: (child: TeacherChild) => void;
}

function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <circle cx="12" cy="8" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5.5 20c.6-3.6 3.2-5.6 6.5-5.6s5.9 2 6.5 5.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function TeacherFab({ others, onPick }: Props) {
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
            <li>
              <Link to="/t/link" className="fab-item" data-demo="th-fab-add" onClick={close}>
                <span className="fab-label">아이 추가하기</span>
                <span className="fab-dot" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="24" height="24">
                    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </span>
              </Link>
            </li>
            {others.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="fab-item"
                  onClick={() => {
                    close();
                    onPick(c);
                  }}
                >
                  <span className="fab-label">{c.nickname}</span>
                  <span className="fab-dot" aria-hidden="true">
                    <PersonIcon />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          ref={toggleRef}
          type="button"
          className="fab-toggle"
          data-demo="th-fab"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          aria-label={open ? '메뉴 닫기' : '아이 추가·다른 아이 보기 메뉴'}
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
