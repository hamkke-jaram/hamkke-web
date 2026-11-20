import { Link } from 'react-router-dom';
import { useUnread } from './talk';
import './talk.css';

/** 이야기 화면으로 가는 줄. 상대가 보낸 안 읽은 이야기 수를 배지로 보여 주고 몇 초마다 다시 센다. */
export default function TalkEntry({ childId, role }: { childId: number; role: 'PARENT' | 'TEACHER' }) {
  const unread = useUnread(childId);
  const isParent = role === 'PARENT';
  const to = isParent ? `/p/children/${childId}/talk` : `/t/children/${childId}/talk`;
  return (
    <Link
      to={to}
      className="talk-entry"
      data-demo="talk-entry"
      aria-label={`${isParent ? '선생님과 이야기 나누기' : '보호자와 이야기 나누기'}${unread ? `, 새 이야기 ${unread}개` : ''}`}
    >
      <span className="talk-entry-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="20" height="20">
          <path
            d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.2 3.4c-.5.4-1.3 0-1.3-.6V16A2.5 2.5 0 0 1 4 13.5v-8z"
            fill="currentColor"
          />
        </svg>
      </span>
      <span className="talk-entry-text">
        {isParent ? '선생님과 이야기 나누기' : '보호자와 이야기 나누기'}
        <span className="talk-entry-sub">
          {isParent ? '메모에 답하고, 집에서 있었던 일을 나눠요' : '가정에서 온 이야기에 답하고, 오늘 소식을 전해요'}
        </span>
      </span>
      {unread > 0 && <span className="talk-badge">{unread > 99 ? '99+' : unread}</span>}
      <span className="menu-chev" aria-hidden="true">
        ›
      </span>
    </Link>
  );
}
