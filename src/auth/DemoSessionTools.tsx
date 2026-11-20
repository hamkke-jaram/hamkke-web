import { Link, useLocation, useNavigate } from 'react-router-dom';
import { currentSession, setSession } from '../api/client';
import { DangerAction } from '../components/feedback';
import { useAuth } from './AuthContext';
import { deleteCurrentDemoWorkspace, isCurrentDemoUser } from './demoLogin';
import './qrSession.css';

export default function DemoSessionTools() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const account = pathname === '/account';
  if (!user || !isCurrentDemoUser(user) || (!account && !/^\/(p|t)(\/children\/\d+)?\/?$/.test(pathname))) return null;
  const parent = user.role === 'PARENT';
  return (
    <aside className="qr-session" aria-label="체험 계정">
      <div className="qr-session-row">
        <span>{parent ? '보호자' : '선생님'} 체험 계정</span>
        <Link to="/login?demo=1&switch=1" data-demo="qr-role-switch">
          {parent ? '선생님으로 로그인' : '보호자로 로그인'}
        </Link>
      </div>
    </aside>
  );
}

export function DeleteDemoAccounts() {
  const { user } = useAuth();
  const navigate = useNavigate();
  if (!user || !isCurrentDemoUser(user)) return null;
  return (
    <DangerAction
      label="이 기기의 체험 계정 삭제"
      question="체험 계정을 모두 삭제할까요?"
      detail="이 브라우저에서 만든 보호자와 선생님 체험 계정, 아이 기록과 대화가 서버에서 함께 삭제돼요."
      confirmLabel="체험 계정 삭제"
      demo="qr-delete-workspace"
      onConfirm={async () => {
        const start = currentSession();
        await deleteCurrentDemoWorkspace(user);
        if (start?.accessToken === currentSession()?.accessToken) {
          setSession(null);
          navigate('/try', { replace: true });
        }
      }}
    />
  );
}
