import type { ReactNode } from 'react';
import { Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import type { Role } from './api/types';
import { useAuth } from './auth/AuthContext';
import { Disclaimer, Loading } from './components/ui';
import Account from './pages/Account';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Privacy from './pages/Privacy';
import Signup from './pages/Signup';
import Support from './pages/Support';
import ChildHome from './pages/parent/ChildHome';
import ChildNew from './pages/parent/ChildNew';
import ParentHome from './pages/parent/ParentHome';
import Record from './pages/parent/Record';
import Share from './pages/parent/Share';
import TeacherChild from './pages/teacher/TeacherChild';
import TeacherHome from './pages/teacher/TeacherHome';

function Layout() {
  const { user } = useAuth();
  const home = user ? (user.role === 'PARENT' ? '/p' : '/t') : '/';
  return (
    <div className="app">
      <header className="topbar">
        <Link to={home} className="brand">
          <img src="/icon.svg" alt="" width={28} height={28} />
          함께자람
        </Link>
        <span className="spacer" />
        <Link to="/support" className="icon-btn" aria-label="상담·기관 연결 안내">
          도움받기
        </Link>
        {user && (
          <Link to="/account" className="icon-btn" aria-label="내 계정">
            내 정보
          </Link>
        )}
      </header>
      <main>
        <Outlet />
      </main>
      <Disclaimer />
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
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
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
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/account" element={<RequireUser><Account /></RequireUser>} />

        <Route path="/p" element={<RequireRole role="PARENT"><ParentHome /></RequireRole>} />
        <Route path="/p/children/new" element={<RequireRole role="PARENT"><ChildNew /></RequireRole>} />
        <Route path="/p/children/:childId" element={<RequireRole role="PARENT"><ChildHome /></RequireRole>} />
        <Route path="/p/children/:childId/record" element={<RequireRole role="PARENT"><Record /></RequireRole>} />
        <Route path="/p/children/:childId/share" element={<RequireRole role="PARENT"><Share /></RequireRole>} />

        <Route path="/t" element={<RequireRole role="TEACHER"><TeacherHome /></RequireRole>} />
        <Route path="/t/children/:childId" element={<RequireRole role="TEACHER"><TeacherChild /></RequireRole>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
