import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { readGuest, resumeGuest, seedSampleChild, startAsGuest } from '../auth/guest';
import BrandMark from '../components/BrandMark';
import Mascot from '../components/Mascot';
import { useToast } from '../components/feedback';
import { ErrorText } from '../components/ui';

/*
 * /try — QR로 들어오는 데모 입구. 로그인·가입 없이 예시 데이터가 채워진 화면을 바로 보여 준다.
 * - 이 기기에서 처음이면: 이 기기에서만 쓰는 데모 보호자 계정(auth/guest.ts)을 만들고 예시 아이(콩이)와 지난 4주 기록을 넣어
 *   아이 홈을 연다. 예시 아이의 법정대리인 동의는 시험 데이터라 자동으로 보낸다.
 * - 전에 들어온 기기면: 그 데모 계정으로 이어서 연다(서버에서 사라졌으면 새로 만든다).
 * - 이미 로그인되어 있으면 그 계정의 홈으로 간다.
 * 실제 서비스의 입구는 '/'(시작하기 → 가입, 로그인)이고, 이 경로는 개발·시연 빌드(TRY_ENABLED)에만 있다.
 */
export default function TryDemo() {
  const { user, loading, policies, policiesError, reloadPolicies, login } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [ratio, setRatio] = useState(0);
  const [label, setLabel] = useState('데모를 여는 중이에요');
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const started = useRef(-1);
  // 준비하는 동안에는 로그인되었다고 홈으로 먼저 가지 않는다(예시 아이를 다 넣은 뒤 그 아이 홈으로 간다).
  const [working, setWorking] = useState(false);

  useEffect(() => {
    // 서버가 아직 안 떴으면(약관 안내를 못 불러옴) 기다린다. AuthContext가 조용히 다시 시도하고, 닿으면 이어서 한다.
    if (loading || user || !policies || started.current === attempt) return;
    started.current = attempt;
    setWorking(true);
    (async () => {
      if (readGuest()) {
        try {
          const t = await resumeGuest();
          if (t) {
            login(t);
            nav('/p', { replace: true });
            return;
          }
        } catch (e) {
          // 계정이 서버에서 사라졌으면(resumeGuest가 잊음) 아래에서 새로 만든다. 연결 문제는 그대로 알린다.
          if (!(e instanceof ApiError && (e.status === 401 || e.status === 404))) throw e;
        }
      }
      setLabel('데모 계정과 예시 아이를 만들고 있어요');
      const { tokens } = await startAsGuest('PARENT', policies);
      login(tokens);
      setRatio(0.15);
      setLabel('지난 4주 예시 기록을 넣고 있어요');
      const childId = await seedSampleChild(policies, (r) => setRatio(0.15 + r * 0.85));
      toast('예시 아이와 기록으로 채운 데모예요.');
      nav(`/p/children/${childId}`, { replace: true });
    })()
      .catch((e: unknown) => setError(e))
      .finally(() => setWorking(false));
  }, [loading, user, policies, attempt, login, nav, toast]);

  if (!loading && user && !working && started.current < 0) return <Navigate to={user.role === 'PARENT' ? '/p' : '/t'} replace />;

  return (
    // Figma '스플래시': 흰 바탕에 모찌 가족과 노란 글자 로고. 그 아래 준비 상태.
    <div className="instant-prep" aria-live="polite">
      <Mascot name="family" size={237} live />
      <BrandMark width={137} />
      <h1>데모를 준비하고 있어요</h1>
      {error != null ? (
        <>
          <ErrorText error={error} />
          <button
            type="button"
            className="btn small secondary"
            onClick={() => {
              setError(null);
              setRatio(0);
              setAttempt((n) => n + 1);
            }}
          >
            다시 시도
          </button>
          <Link to="/" className="btn small ghost">
            처음 화면으로
          </Link>
        </>
      ) : policiesError != null && !policies ? (
        <>
          <p className="muted">서버에 연결하는 중이에요. 서버가 켜지면 바로 이어서 준비해요.</p>
          <button type="button" className="btn small secondary" onClick={reloadPolicies}>
            지금 다시 연결하기
          </button>
        </>
      ) : (
        <p className="muted">{label}</p>
      )}
      <div className="progress" aria-hidden="true">
        <div className="progress-bar" style={{ width: `${Math.round(ratio * 100)}%` }} />
      </div>
      <p className="muted" style={{ fontSize: 13, marginTop: 16 }}>
        예시 데이터로 채운 체험용 화면이에요. 실제 서비스는 가입하고 로그인해서 써요.
      </p>
    </div>
  );
}
