import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import type { Role } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { readGuest, resumeGuest, startAsGuest } from '../auth/guest';
import Mascot from '../components/Mascot';
import { useToast } from '../components/feedback';
import { ErrorText, Loading } from '../components/ui';
import { DEMO_ENABLED } from '../demo/DemoContext';

/**
 * 첫 화면 = 시작 화면. 로그인·가입 없이 '시작하기' 한 번으로 바로 들어간다(auth/guest.ts).
 * 이 기기에서 전에 시작했으면 누르지 않아도 그 계정으로 바로 이어서 연다(QR로 다시 들어온 경우 등).
 * 다만 '나가기'로 막 나온 경우에는 다시 들어가지 않고 이 화면을 보여 준다.
 */
export default function Landing() {
  const { user, loading, policies, policiesError, reloadPolicies, login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const toast = useToast();
  const state = loc.state as { from?: string; left?: boolean } | null;
  const from = state?.from;
  const [busy, setBusy] = useState<Role | null>(null);
  const [error, setError] = useState<unknown>(null);
  // 이 기기 계정으로 자동으로 이어 열기. 한 번만 시도한다.
  const [resuming, setResuming] = useState(() => !state?.left && readGuest() !== null);
  const tried = useRef(false);

  useEffect(() => {
    if (loading || user || !resuming || tried.current) return;
    tried.current = true;
    resumeGuest()
      .then((t) => {
        if (!t) return;
        login(t);
        nav(from ?? (t.user.role === 'PARENT' ? '/p' : '/t'), { replace: true });
      })
      .catch(() => undefined) // 못 이으면 시작 버튼을 보여 준다
      .finally(() => setResuming(false));
  }, [loading, user, resuming, from, login, nav]);

  if (loading || resuming) return <Loading />;
  if (user) return <Navigate to={from ?? (user.role === 'PARENT' ? '/p' : '/t')} replace />;

  async function start(role: Role) {
    if (!policies || busy) return;
    setBusy(role);
    setError(null);
    try {
      const { tokens, created } = await startAsGuest(role, policies);
      login(tokens);
      if (role === 'PARENT') {
        // 처음 온 보호자는 바로 아이 등록으로(법정대리인 동의는 그 화면에서 받는다).
        if (created && !from) nav('/p/children/new', { replace: true, state: { onboarding: true } });
        else nav(from ?? '/p', { replace: true });
      } else {
        if (created) toast('반가워요. 보호자에게 받은 초대 코드를 넣어 주세요.');
        nav(from ?? '/t', { replace: true });
      }
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="hero">
        <h1>검사 이후, 집에서의 시간을<br />혼자 두지 않아요</h1>
        <p className="lead">
          아이와 노는 영상을 폰 안에서 분석해 상호작용을 기록하고,
          <br />
          작은 변화에 맞춘 양육 코칭을 전해 드려요.
        </p>
        <Mascot name="family" size={220} />
      </div>

      <section className="card soft">
        <h2>이렇게 함께해요</h2>
        <ol className="steps">
          <li>폰을 세워 두고 아이와 노는 모습을 1~3분 찍어요.</li>
          <li>
            폰 안에서 분석해 함께한 시간, 반응 시간, 크게 운 횟수를 기록해요.{' '}
            <strong>영상 원본과 소리는 폰 밖으로 나가지 않아요.</strong> 보호자가 'AI 관찰 기록'을 켠 아이만 장면 사진 최대
            6장을 AI 서버로 보내 본 모습을 짧은 글로 적고, 사진은 살펴본 직후 지워요.
          </li>
          <li>기록 변화에 맞는 코칭 카드를 출처와 함께 받아요.</li>
          <li>원하는 항목만 골라 기관 선생님(어린이집·유치원·센터 등)과 나눠요.</li>
        </ol>
      </section>

      {policiesError != null && !policies ? (
        <div className="card">
          <ErrorText error={policiesError} />
          <button type="button" className="btn block" onClick={reloadPolicies}>
            다시 시도
          </button>
        </div>
      ) : (
        <div className="stack">
          <p className="muted start-note" id="start-note">
            이메일·비밀번호 없이 이 기기에서 바로 시작해요. 시작하면 <Link to="/terms">이용약관</Link>과{' '}
            <Link to="/privacy">개인정보 처리 방침</Link>에 동의하게 돼요. 이 브라우저의 방문 기록·저장 데이터를 지우면 기록을 다시 볼
            수 없어요.
          </p>
          <button
            type="button"
            className="btn block"
            data-demo="start-parent"
            aria-describedby="start-note"
            aria-disabled={!policies || busy !== null || undefined}
            onClick={() => void start('PARENT')}
          >
            {busy === 'PARENT' ? '여는 중…' : policies ? '보호자로 시작하기' : '준비하는 중…'}
          </button>
          <button
            type="button"
            className="btn block secondary"
            data-demo="start-teacher"
            aria-describedby="start-note"
            aria-disabled={!policies || busy !== null || undefined}
            onClick={() => void start('TEACHER')}
          >
            {busy === 'TEACHER' ? '여는 중…' : '기관 선생님으로 시작하기'}
          </button>
          {error != null && <ErrorText error={error} />}
          <Link to="/qr" className="btn block ghost" data-demo="landing-qr">
            휴대폰으로 열기 (QR)
          </Link>
          {DEMO_ENABLED && (
            <Link to="/demo" className="btn block ghost">
              전체 흐름 보기 (시연용)
            </Link>
          )}
          {DEMO_ENABLED && (
            <Link to="/demo/features" className="btn block ghost" data-demo="landing-features">
              기능별로 보기 (시연용)
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
