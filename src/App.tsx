import { useEffect, useRef, type ReactNode } from 'react';
import { Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import Observe from './ai/Observe';
import type { Role } from './api/types';
import { useAuth } from './auth/AuthContext';
import BrandMark from './components/BrandMark';
import { useRouteFocus } from './components/feedback';
import { Icon } from './components/icons';
import MochiBuddy from './components/MochiBuddy';
import { Disclaimer, Loading } from './components/ui';
import { DEMO_ENABLED } from './demo/DemoContext';
import DemoStart from './demo/DemoStart';
import DemoTour from './demo/DemoTour';
import { FeatureMenuRoute } from './demo/features/entry';
import Account from './pages/Account';
import Landing from './pages/Landing';
import Login from './pages/Login';
import NotFound, { ScreenErrorBoundary } from './pages/NotFound';
import Privacy from './pages/Privacy';
import QrEntry from './pages/QrEntry';
import Reconsent from './pages/Reconsent';
import Signup from './pages/Signup';
import Support from './pages/Support';
import Terms from './pages/Terms';
import { useMotionOn } from './motion';
import ChildEdit from './pages/parent/ChildEdit';
import ChildHome from './pages/parent/ChildHome';
import ChildNew from './pages/parent/ChildNew';
import Records from './pages/parent/Records';
import ParentHome from './pages/parent/ParentHome';
import Record from './pages/parent/Record';
import Share from './pages/parent/Share';
import TeacherChild from './pages/teacher/TeacherChild';
import TeacherHome from './pages/teacher/TeacherHome';

/** 약관 다시 동의를 받는 동안에도 열 수 있는 화면(바뀐 내용 읽기, 도움받기, 내 데이터 내려받기·탈퇴). */
const OPEN_DURING_RECONSENT = ['/terms', '/privacy', '/support', '/account'];

/** 돌아다니는 모찌를 두지 않는 화면: 촬영·실시간 카메라(영상과 버튼을 가리지 않게). */
const NO_BUDDY = /\/(record|observe)$/;

function Layout() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const motionOn = useMotionOn();
  useRouteFocus();
  const home = user ? (user.role === 'PARENT' ? '/p' : '/t') : '/';
  const pending = user?.pendingConsents ?? [];
  const blocked = pending.length > 0 && !OPEN_DURING_RECONSENT.includes(pathname);
  // 다시 동의를 마치면 누른 버튼이 사라지고 원래 화면이 그 자리에 나온다. 그 화면 제목으로 포커스를 옮긴다.
  const wasBlocked = useRef(blocked);
  useEffect(() => {
    const unblocked = wasBlocked.current && !blocked;
    wasBlocked.current = blocked;
    if (!unblocked) return;
    const timer = window.setTimeout(() => {
      const h1 = document.querySelector<HTMLElement>('main h1');
      if (!h1) return;
      if (!h1.hasAttribute('tabindex')) h1.setAttribute('tabindex', '-1');
      h1.focus({ preventScroll: true });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [blocked]);
  return (
    <div className="app">
      <header className="topbar">
        <Link to={home} className="brand">
          <BrandMark />
          함께자람
        </Link>
        <span className="spacer" />
        {/* 아이콘만 보이는 버튼. 이름은 aria-label(낭독)과 title(마우스를 올렸을 때)로 알린다. */}
        <Link to="/support" className="icon-btn" aria-label="도움받기" title="도움받기" aria-current={pathname === '/support' ? 'page' : undefined}>
          <Icon name="info" className="topbar-icon" />
        </Link>
        {user && (
          <Link to="/account" className="icon-btn" aria-label="내 정보" title="내 정보" aria-current={pathname === '/account' ? 'page' : undefined}>
            <Icon name="settings" className="topbar-icon" />
          </Link>
        )}
      </header>
      <main>
        <ScreenErrorBoundary resetKey={pathname}>{blocked ? <Reconsent pending={pending} /> : <Outlet />}</ScreenErrorBoundary>
      </main>
      <Disclaimer />
      {DEMO_ENABLED && <DemoTour />}
      {/* 화면 설정 '움직이는 캐릭터'. 약관 다시 동의 중에는 두지 않는다. 선생님에게는 선생님 모찌가 다닌다. */}
      {motionOn && !blocked && !NO_BUDDY.test(pathname) && (
        <MochiBuddy name={user?.role === 'TEACHER' ? 'teacher' : 'dome'} hopKey={pathname} />
      )}
    </div>
  );
}

function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Loading />;
  // 로그인 화면 대신 시작 화면으로 보낸다. 이 기기 계정이 있으면 거기서 바로 이어서 이 화면으로 돌아온다.
  if (!user) return <Navigate to="/" replace state={{ from: loc.pathname }} />;
  if (user.role !== role) return <Navigate to={user.role === 'PARENT' ? '/p' : '/t'} replace />;
  return <>{children}</>;
}

function RequireUser({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/" replace state={{ from: loc.pathname }} />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/support" element={<Support />} />
        <Route path="/qr" element={<QrEntry />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        {DEMO_ENABLED && <Route path="/demo" element={<DemoStart />} />}
        {DEMO_ENABLED && <Route path="/demo/features" element={<FeatureMenuRoute />} />}
        <Route path="/account" element={<RequireUser><Account /></RequireUser>} />

        <Route path="/p" element={<RequireRole role="PARENT"><ParentHome /></RequireRole>} />
        <Route path="/p/children/new" element={<RequireRole role="PARENT"><ChildNew /></RequireRole>} />
        <Route path="/p/children/:childId" element={<RequireRole role="PARENT"><ChildHome /></RequireRole>} />
        <Route path="/p/children/:childId/edit" element={<RequireRole role="PARENT"><ChildEdit /></RequireRole>} />
        <Route path="/p/children/:childId/records" element={<RequireRole role="PARENT"><Records /></RequireRole>} />
        <Route path="/p/children/:childId/record" element={<RequireRole role="PARENT"><Record /></RequireRole>} />
        <Route path="/p/children/:childId/share" element={<RequireRole role="PARENT"><Share /></RequireRole>} />
        <Route path="/p/children/:childId/observe" element={<RequireRole role="PARENT"><Observe /></RequireRole>} />

        <Route path="/t" element={<RequireRole role="TEACHER"><TeacherHome /></RequireRole>} />
        <Route path="/t/children/:childId" element={<RequireRole role="TEACHER"><TeacherChild /></RequireRole>} />
        <Route path="/t/children/:childId/observe" element={<RequireRole role="TEACHER"><Observe /></RequireRole>} />

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
