import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import type { Role } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { INSTANT_TEST, readGuest, resumeGuest, seedSampleChild, startAsGuest } from '../auth/guest';
import BrandMark from '../components/BrandMark';
import Mascot from '../components/Mascot';
import { useToast } from '../components/feedback';
import { ErrorText, Loading } from '../components/ui';
import { DEMO_ENABLED } from '../demo/DemoContext';

/**
 * 첫 화면 = 시작 화면. 로그인·가입 없이 '시작하기' 한 번으로 바로 들어간다(auth/guest.ts).
 * 이 기기에서 전에 시작했으면 누르지 않아도 그 계정으로 바로 이어서 연다(QR로 다시 들어온 경우 등).
 * 다만 '나가기'로 막 나온 경우에는 다시 들어가지 않고 이 화면을 보여 준다.
 * 바로 테스트(INSTANT_TEST, 개발 서버·시험 빌드): 처음 온 기기도 누르지 않고 보호자 계정 + 예시 아이·기록을 만들어 아이 홈을 연다.
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
  // 바로 테스트: 이 기기에 계정이 없을 때 자동으로 만들고 예시 데이터를 채운다. 한 번만.
  const [preparing, setPreparing] = useState(() => INSTANT_TEST && !state?.left && readGuest() === null);
  const [prepRatio, setPrepRatio] = useState(0);
  const prepared = useRef(false);

  useEffect(() => {
    // 서버가 아직 안 떴으면(약관 안내를 못 불러옴) 기다린다. 다시 닿으면(AuthContext가 조용히 다시 시도) 이어서 한다.
    if (!preparing || loading || user || prepared.current || !policies) return;
    prepared.current = true;
    (async () => {
      const { tokens } = await startAsGuest('PARENT', policies);
      login(tokens);
      setPrepRatio(0.15);
      const childId = await seedSampleChild(policies, (r) => setPrepRatio(0.15 + r * 0.85));
      toast('테스트용 예시 아이와 기록을 준비했어요.');
      nav(from ?? `/p/children/${childId}`, { replace: true });
    })()
      .catch((e: unknown) => setError(e))
      .finally(() => setPreparing(false));
  }, [preparing, loading, user, policies, policiesError, login, nav, from, toast]);

  useEffect(() => {
    if (loading || user || !resuming || tried.current) return;
    tried.current = true;
    resumeGuest()
      .then((t) => {
        if (!t) return;
        login(t);
        nav(from ?? (t.user.role === 'PARENT' ? '/p' : '/t'), { replace: true });
      })
      .catch(() => {
        // 못 이으면 시작 버튼을 보여 준다. 계정이 서버에서 사라져 잊었으면(바로 테스트) 새로 준비한다.
        if (INSTANT_TEST && readGuest() === null) setPreparing(true);
      })
      .finally(() => setResuming(false));
  }, [loading, user, resuming, from, login, nav]);

  if (preparing && !error) {
    return (
      // Figma '스플래시': 흰 바탕에 모찌 가족과 노란 글자 로고. 그 아래 준비 상태.
      <div className="instant-prep" aria-live="polite">
        <Mascot name="family" size={237} />
        <BrandMark width={137} />
        <h1>테스트를 준비하고 있어요</h1>
        {policiesError != null && !policies ? (
          <>
            <p className="muted">서버에 연결하는 중이에요. 서버가 켜지면 바로 이어서 준비해요.</p>
            <button type="button" className="btn small secondary" onClick={reloadPolicies}>
              지금 다시 연결하기
            </button>
          </>
        ) : (
          <p className="muted">예시 아이와 지난 4주 기록을 넣는 중이에요.</p>
        )}
        <div className="progress" aria-hidden="true">
          <div className="progress-bar" style={{ width: `${Math.round(prepRatio * 100)}%` }} />
        </div>
      </div>
    );
  }
  if (loading) return <Loading />;
  // 이미 로그인되어 있으면 이어 열기를 기다리지 않고 바로 들어간다(세션과 기기 계정이 함께 있는 경우).
  if (user) return <Navigate to={from ?? (user.role === 'PARENT' ? '/p' : '/t')} replace />;
  if (resuming) return <Loading />;

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
