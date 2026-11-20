import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { getRefreshToken, sessionMatches } from '../api/client';
import type { Role } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { hasDemoConsent, isCurrentDemoUser, prepareDemoLogin } from '../auth/demoLogin';
import { ErrorText, Loading } from '../components/ui';

const roleLabels: Record<Role, string> = { PARENT: '보호자', TEACHER: '선생님' };

export default function DemoLoginForm({ switchRole }: { switchRole: boolean }) {
  const nav = useNavigate();
  const { user, loading, policies, policiesError, reloadPolicies, login } = useAuth();
  const [chosen, setChosen] = useState<Role | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<unknown>(null);
  const mounted = useRef(false);
  const pending = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const role = chosen ?? (switchRole && user?.role === 'PARENT' ? 'TEACHER' : 'PARENT');
  const needsConsent = policies ? !hasDemoConsent(policies) : true;
  if (loading) return <Loading />;
  if (user && (!switchRole || !isCurrentDemoUser(user))) {
    return <Navigate to={user.role === 'PARENT' ? '/p' : '/t'} replace />;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current || !policies || (needsConsent && !accepted)) return;
    pending.current = true;
    const previousSession = getRefreshToken();
    setError(null);
    setProgress('체험 계정을 확인하고 있어요.');
    try {
      const result = await prepareDemoLogin(role, policies, label => {
        if (mounted.current) setProgress(label);
      });
      if (!mounted.current) return;
      if (!sessionMatches(previousSession)) {
        throw new Error('다른 탭에서 로그인 상태가 바뀌었어요. 현재 계정을 확인한 뒤 다시 시도해 주세요.');
      }
      login(result.tokens);
      nav(result.tokens.user.role === 'PARENT' ? '/p' : '/t', { replace: true });
    } catch (e) {
      if (mounted.current) setError(e);
    } finally {
      pending.current = false;
      if (mounted.current) setProgress('');
    }
  }

  return (
    <>
      <p className="lead">콩이의 기록을 볼 역할을 골라 로그인해 주세요.</p>
      <form onSubmit={submit} aria-busy={!!progress}>
        <div className="tabs" role="group" aria-label="체험 역할">
          {(['PARENT', 'TEACHER'] as const).map(option =>
            <button type="button" key={option} aria-pressed={role === option} disabled={!!progress}
              onClick={() => setChosen(option)}>{roleLabels[option]}</button>,
          )}
        </div>
        <p className="field-hint">이 기기 전용 보호자·선생님 계정으로 예시 기록, 코칭, 대화를 사용해 볼 수 있어요. 실제 아이의 정보는 입력하지 마세요.</p>
        {!policies && (policiesError ? (
          <>
            <ErrorText error={policiesError} />
            <button type="button" className="btn secondary small" onClick={reloadPolicies}>약관 다시 불러오기</button>
          </>
        ) : <Loading />)}
        {policies && needsConsent && (
          <div className="card">
            <label className="check">
              <input type="checkbox" required checked={accepted} disabled={!!progress} data-demo="demo-login-consent"
                onChange={event => setAccepted(event.target.checked)} />
              <span>체험 계정의 이용약관, 개인정보 수집·이용 및 가상 아이의 예시 기록 등록에 동의합니다.</span>
            </label>
            <p className="field-hint">체험용 계정과 가상 아이의 기록이 서버에 저장돼요.{' '}
              <Link to="/terms" className="link-btn">이용약관</Link>{' · '}
              <Link to="/privacy" className="link-btn">개인정보 처리 안내</Link>
            </p>
          </div>
        )}
        <ErrorText error={error} />
        <button type="submit" className="btn block pill" data-demo="demo-login-submit" disabled={!policies || !!progress}>
          {progress ? '로그인하는 중…' : '체험 계정으로 로그인'}
        </button>
        {progress && <p className="status-line" role="status">{progress}</p>}
      </form>
      {!user && <p className="status-line link-row">
        <Link to="/login" className="link-btn">내 계정으로 로그인</Link>{' · '}
        <Link to="/register" className="link-btn">가입하기</Link>
      </p>}
    </>
  );
}
