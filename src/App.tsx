import { lazy, Suspense, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { Link, Navigate, Outlet, Route, Routes, useLocation, useNavigationType } from 'react-router-dom';
import Observe from './ai/Observe';
import { TeacherReviewDetail, TeacherReviewInbox } from './ai/TeacherReview';
import type { Role } from './api/types';
import { AuthProvider, useAuth } from './auth/AuthContext';
import DemoSessionTools from './auth/DemoSessionTools';
import BrandMark from './components/BrandMark';
import { useRouteFocus } from './components/feedback';
import { Icon } from './components/icons';
import MochiBuddy from './components/MochiBuddy';
import { installArtMotion } from './components/artMotion';
import { Disclaimer, Loading } from './components/ui';
import { DEMO_ENABLED, DemoProvider } from './demo/DemoContext';
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
import Facilities from './pages/facilities/Facilities';
import ServiceFilm from './pages/ServiceFilm';
import Terms from './pages/Terms';
import { useMotionOn } from './motion';
import { NativeBridge } from './native';
import ChildEdit from './pages/parent/ChildEdit';
import Children from './pages/parent/Children';
import { CoachingDetail, CoachingList } from './pages/parent/Coaching';
import ChildHome from './pages/parent/ChildHome';
import ChildNew from './pages/parent/ChildNew';
import Records from './pages/parent/Records';
import ParentHome from './pages/parent/ParentHome';
import Record from './pages/parent/Record';
import Share from './pages/parent/Share';
import TeacherChild from './pages/teacher/TeacherChild';
import InviteCode from './pages/teacher/InviteCode';
import { TeacherCoachingDetail, TeacherCoachingList } from './pages/teacher/TeacherCoaching';
import TeacherCoachingExample from './pages/teacher/TeacherCoachingExample';
import TeacherHome from './pages/teacher/TeacherHome';
import { StoryCompose, StoryView } from './pages/teacher/TeacherStory';
import TalkPage from './talk/TalkPage';
import DuoDemo, { DuoEnter } from './demo/DuoDemo';

/** 약관 다시 동의를 받는 동안에도 열 수 있는 화면(바뀐 내용 읽기, 도움받기, 내 데이터 내려받기·탈퇴). */
const OPEN_DURING_RECONSENT = ['/terms', '/privacy', '/support', '/support/facilities', '/account'];
const TeacherReviewDemo = import.meta.env.DEV && import.meta.env.VITE_TEACHER_REVIEW_DEMO === true
  ? lazy(() => import('./demo/teacher-review/TeacherReviewDemo'))
  : null;

/** 촬영·대화·영상 시연 화면에서는 움직이는 모찌가 조작 버튼이나 자막을 가리지 않게 한다. */
const NO_BUDDY = /\/(record|observe|talk)$|^\/guide\/?$|^\/demo\/duo/;

/**
 * 화면 전환: 주소가 바뀌면 새 화면이 살짝 밀려 들어온다(앞으로 가기는 오른쪽에서, 뒤로 가기는 왼쪽에서).
 * 화면을 다시 만들지 않고 <main>의 CSS 애니메이션만 다시 튼다(입력 중인 값·스크롤이 그대로).
 * View Transitions API는 쓰지 않았다: BrowserRouter는 화면이 바뀌기 전에 끼어들 자리가 없어서다(보고서 T-019).
 * '움직이는 캐릭터'가 꺼져 있으면 CSS가 아무것도 하지 않는다(즉시 바뀜).
 */
function useRouteTransition() {
  const { pathname } = useLocation();
  const type = useNavigationType();
  const ref = useRef<HTMLElement>(null);
  const first = useRef(true);
  useLayoutEffect(() => {
    const el = ref.current;
    if (first.current || !el) {
      first.current = false;
      return;
    }
    el.dataset.dir = type === 'POP' ? 'back' : 'forward';
    el.classList.remove('route-in');
    void el.offsetWidth; // 같은 이름을 다시 달아도 처음부터 다시 돌게
    el.classList.add('route-in');
  }, [pathname, type]);
  return ref;
}

function Layout() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const motionOn = useMotionOn();
  useRouteFocus();
  const mainRef = useRouteTransition();
  // 코칭 모찌 그림: 화면에 보이는 동안만 움직이고, 들어올 때 한 번 톡(components/artMotion.ts).
  useEffect(() => installArtMotion(), []);
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
        {/* Figma(해커톤_발자국): 왼쪽 노란 글자 로고, 오른쪽 설정(톱니). 도움받기는 홈의 '전문가의 도움이 필요하다면'과 설정에 있다. */}
        <Link to={home} className="brand" aria-label="시나브로 처음으로">
          <BrandMark />
        </Link>
        <span className="spacer" />
        {/* 아이콘만 보이는 버튼. 이름은 aria-label(낭독)과 title(마우스를 올렸을 때)로 알린다. */}
        {!user && (
          <Link to="/support" className="icon-btn" aria-label="도움받기" title="도움받기" aria-current={pathname === '/support' ? 'page' : undefined}>
            <Icon name="info" className="topbar-icon" />
          </Link>
        )}
        {user && (
          <Link to="/account" className="icon-btn" aria-label="설정" title="설정" aria-current={pathname === '/account' ? 'page' : undefined}>
            <Icon name="settings" className="topbar-icon" />
          </Link>
        )}
      </header>
      {!blocked && <DemoSessionTools />}
      <main ref={mainRef} onAnimationEnd={(e) => e.target === e.currentTarget && e.currentTarget.classList.remove('route-in')}>
        <ScreenErrorBoundary resetKey={pathname}>{blocked ? <Reconsent pending={pending} /> : <Outlet />}</ScreenErrorBoundary>
      </main>
      <Disclaimer />
      {DEMO_ENABLED && <DemoTour />}
      <NativeBridge />
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
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (user.role !== role) return <Navigate to={user.role === 'PARENT' ? '/p' : '/t'} replace />;
  return <>{children}</>;
}

function RequireUser({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return <>{children}</>;
}

function ServiceRoutes() {
  return (
    <Routes>
      {/* 이미 인쇄된 /signup QR과 /try QR은 같은 로그인 화면을 연다. */}
      <Route path="/signup" element={<Navigate to="/login?demo=1" replace />} />
      <Route path="/try/*" element={<Navigate to="/login?demo=1" replace />} />
      {/* 보호자·선생님 함께 보기(시연 영상용): 두 휴대폰을 나란히 두므로 앱 화면 폭(560px) 밖에 둔다. */}
      {DEMO_ENABLED && <Route path="/demo/duo" element={<DuoDemo />} />}
      {TeacherReviewDemo && (
        <Route path="/demo/teacher-review" element={<Suspense fallback={<Loading />}><TeacherReviewDemo /></Suspense>} />
      )}
      <Route element={<Layout />}>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Signup />} />
        <Route path="/support" element={<Support />} />
        <Route path="/support/facilities" element={<Facilities />} />
        <Route path="/guide" element={<ServiceFilm />} />
        <Route path="/qr" element={<QrEntry />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        {DEMO_ENABLED && <Route path="/demo" element={<DemoStart />} />}
        {DEMO_ENABLED && <Route path="/demo/features" element={<FeatureMenuRoute />} />}
        {DEMO_ENABLED && <Route path="/demo/duo/enter" element={<DuoEnter />} />}
        <Route path="/account" element={<RequireUser><Account /></RequireUser>} />

        <Route path="/p" element={<RequireRole role="PARENT"><ParentHome /></RequireRole>} />
        <Route path="/p/children" element={<RequireRole role="PARENT"><Children /></RequireRole>} />
        <Route path="/p/children/new" element={<RequireRole role="PARENT"><ChildNew /></RequireRole>} />
        <Route path="/p/children/:childId" element={<RequireRole role="PARENT"><ChildHome /></RequireRole>} />
        <Route path="/p/children/:childId/edit" element={<RequireRole role="PARENT"><ChildEdit /></RequireRole>} />
        <Route path="/p/children/:childId/coaching" element={<RequireRole role="PARENT"><CoachingList /></RequireRole>} />
        <Route path="/p/children/:childId/coaching/:deliveryId" element={<RequireRole role="PARENT"><CoachingDetail /></RequireRole>} />
        <Route path="/p/children/:childId/records" element={<RequireRole role="PARENT"><Records /></RequireRole>} />
        <Route path="/p/children/:childId/record" element={<RequireRole role="PARENT"><Record /></RequireRole>} />
        <Route path="/p/children/:childId/share" element={<RequireRole role="PARENT"><Share /></RequireRole>} />
        <Route path="/p/children/:childId/observe" element={<RequireRole role="PARENT"><Observe /></RequireRole>} />
        <Route path="/p/children/:childId/talk" element={<RequireRole role="PARENT"><TalkPage /></RequireRole>} />

        <Route path="/t" element={<RequireRole role="TEACHER"><TeacherHome /></RequireRole>} />
        <Route path="/t/link" element={<RequireRole role="TEACHER"><InviteCode closable /></RequireRole>} />
        <Route path="/t/children/:childId/story/new" element={<RequireRole role="TEACHER"><StoryCompose /></RequireRole>} />
        <Route path="/t/children/:childId/story/:noteId" element={<RequireRole role="TEACHER"><StoryView /></RequireRole>} />
        <Route path="/t/children/:childId/coaching" element={<RequireRole role="TEACHER"><TeacherCoachingList /></RequireRole>} />
        <Route path="/t/children/:childId/coaching/example" element={<RequireRole role="TEACHER"><TeacherCoachingExample /></RequireRole>} />
        <Route path="/t/children/:childId/coaching/:deliveryId" element={<RequireRole role="TEACHER"><TeacherCoachingDetail /></RequireRole>} />
        <Route path="/t/children/:childId" element={<RequireRole role="TEACHER"><TeacherChild /></RequireRole>} />
        <Route path="/t/children/:childId/observe" element={<RequireRole role="TEACHER"><Observe /></RequireRole>} />
        <Route path="/t/children/:childId/ai-reviews" element={<RequireRole role="TEACHER"><TeacherReviewInbox /></RequireRole>} />
        <Route path="/t/children/:childId/ai-reviews/:observationId" element={<RequireRole role="TEACHER"><TeacherReviewDetail /></RequireRole>} />
        <Route path="/t/children/:childId/talk" element={<RequireRole role="TEACHER"><TalkPage /></RequireRole>} />

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider><DemoProvider><ServiceRoutes /></DemoProvider></AuthProvider>
  );
}
