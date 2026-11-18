import { useState } from 'react';
import { Link } from 'react-router-dom';
import { setSession } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import Mascot from '../components/Mascot';
import { ErrorText } from '../components/ui';
import { useDemo } from './DemoContext';
import { createDemo } from './seed';
import { DEMO_STEPS } from './steps';
import './demo.css';

/** /demo — 전체 흐름 보기 시작 화면. */
export default function DemoStart() {
  const { user, policies, policiesError, reloadPolicies, reload } = useAuth();
  const { active, step, goTo, start, end } = useDemo();
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState('');
  const [ratio, setRatio] = useState(0);
  const [error, setError] = useState<unknown>(null);

  async function run() {
    if (!policies) return;
    setBusy(true);
    setError(null);
    setRatio(0);
    try {
      // 진행 중인 데모가 있으면 그 계정과 예시 기록부터 지운다.
      if (active) await end({ navigate: false });
      else if (user) {
        // 다른 계정으로 로그인되어 있으면 로그아웃한다(계정과 기록은 그대로 남는다).
        setSession(null);
        await reload();
      }
      const data = await createDemo(policies, (l, r) => {
        setLabel(l);
        setRatio(r);
      });
      await start(data);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="demo-start">
      <h1>전체 흐름 보기</h1>
      <p className="lead">
        멘토·심사 시연용이에요. 데모 보호자와 데모 선생님 계정, 예시 기록을 만들고 아래 순서대로 실제 화면을 넘겨 보여 드려요.
      </p>
      <Mascot name="family" size={160} />

      <section className="card soft">
        <ol className="steps">
          {DEMO_STEPS.map((s) => (
            <li key={s.key}>{s.title}</li>
          ))}
        </ol>
      </section>

      <section className="card">
        <p style={{ marginTop: 0 }}>
          영상 분석 단계에서는 직접 고른 영상을 이 기기 안에서 분석해요. 나머지 기록은 시연을 위해 넣은 예시 숫자예요.
        </p>
        <p className="muted" style={{ marginBottom: 0 }}>
          "데모 끝내기"를 누르면 데모 계정과 예시 기록을 모두 지워요.
          {' 데모 중에는 이 브라우저의 다른 탭도 데모 계정으로 보여요.'}
          {user && !active && ' 지금 로그인한 계정은 로그아웃되지만, 계정과 기록은 그대로 남아요.'}
        </p>
      </section>

      {policiesError && !policies ? (
        <div className="card">
          <ErrorText error={policiesError} />
          <button type="button" className="btn block" onClick={reloadPolicies}>
            다시 시도
          </button>
        </div>
      ) : busy ? (
        <div className="card" aria-live="polite">
          <p style={{ marginTop: 0 }}>{label || '데모를 준비하고 있어요…'}</p>
          <div className="progress">
            <div className="progress-bar" style={{ width: `${Math.round(ratio * 100)}%` }} />
          </div>
        </div>
      ) : (
        <div className="stack">
          {active && (
            <button type="button" className="btn block" onClick={() => void goTo(step)}>
              진행 중인 데모 이어 보기 ({step + 1}단계부터)
            </button>
          )}
          <button type="button" className={`btn block${active ? ' secondary' : ''}`} onClick={() => void run()} disabled={!policies}>
            {active ? '새 데모로 처음부터' : '전체 흐름 보기 시작'}
          </button>
          {error != null && <ErrorText error={error} />}
        </div>
      )}

      <section className="card" aria-labelledby="demo-features-h" style={{ marginTop: 16 }}>
        <h2 id="demo-features-h">기능 하나씩 보기</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          가입, 아이 등록, 영상 기록, 공유, 초대 코드 같은 기능을 하나씩 골라, 입력하는 과정과 서버로 간 내용까지 실제 화면으로
          보여 드려요.
        </p>
        <Link to="/demo/features" className="btn block secondary" data-demo="demo-features-link">
          기능별로 보기
        </Link>
      </section>
    </div>
  );
}
