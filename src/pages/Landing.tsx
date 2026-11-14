import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Loading } from '../components/ui';
import { DEMO_ENABLED } from '../demo/DemoContext';

export default function Landing() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (user) return <Navigate to={user.role === 'PARENT' ? '/p' : '/t'} replace />;

  return (
    <div>
      <div className="hero">
        <img src="/icon.svg" alt="" />
        <h1>검사 이후, 집에서의 시간을<br />혼자 두지 않아요</h1>
        <p className="lead">
          아이와 노는 영상을 폰 안에서 분석해 상호작용을 기록하고,
          <br />
          작은 변화에 맞춘 양육 코칭을 전해 드려요.
        </p>
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

      <div className="stack">
        <Link to="/signup" className="btn block">
          시작하기
        </Link>
        <Link to="/login" className="btn block secondary">
          로그인
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
    </div>
  );
}
