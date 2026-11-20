import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import Mascot from '../components/Mascot';
import { Loading } from '../components/ui';
import { DEMO_ENABLED } from '../demo/DemoContext';

/**
 * 첫 화면(실제 서비스의 입구): 시작하기(가입)·로그인. 로그인되어 있으면 홈으로 간다.
 * QR 입구(/try)는 체험 계정 로그인 뒤 같은 보호자·선생님 홈을 연다.
 */
export default function Landing() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (user) return <Navigate to={user.role === 'PARENT' ? '/p' : '/t'} replace />;

  return (
    <div>
      <div className="hero">
        <h1>검사 이후, 집에서의 시간을<br />혼자 두지 않아요</h1>
        <p className="lead">
          아이와 노는 영상을 폰 안에서 분석해 상호작용을 기록하고,
          <br />
          작은 변화에 맞춘 양육 코칭을 전해 드려요.
        </p>
        <Mascot name="family" size={220} live />
      </div>

      <section className="card soft rise-in">
        <h2>이렇게 함께해요</h2>
        <ol className="steps stagger">
          <li>폰을 세워 두고 아이와 노는 모습을 1~3분 찍어요.</li>
          <li>
            폰 안에서 분석해 함께한 시간, 반응 시간, 크게 운 횟수를 기록해요.{' '}
            <strong>영상 원본과 소리는 폰 밖으로 나가지 않아요.</strong> 보호자가 'AI 관찰 기록'을 켠 아이만 장면 사진을 AI 서버로 보내요.
            가정 영상에서 보낼 사진은 보호자가 동의한 범위에서 한 편에 최대 24장이에요. 사진은 살펴본 직후 지워요.
          </li>
          <li>기록 변화에 맞는 코칭 카드를 출처와 함께 받아요.</li>
          <li>원하는 항목만 골라 기관 선생님(어린이집·유치원·센터 등)과 나눠요.</li>
        </ol>
      </section>

      <div className="stack">
        <Link to="/register" className="btn block">
          시작하기
        </Link>
        <Link to="/login" className="btn block secondary">
          로그인
        </Link>
        <Link to="/guide" className="btn block ghost">서비스 시연 영상 보기</Link>
        <Link to="/qr" className="btn block ghost" data-demo="landing-qr">
          휴대폰으로 데모 열기 (QR)
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
