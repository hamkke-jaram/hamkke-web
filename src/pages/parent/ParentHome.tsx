import { Link, Navigate } from 'react-router-dom';
import { api } from '../../api/client';
import type { Child } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { ErrorText, Loading, formatAge, useLoad } from '../../components/ui';

export default function ParentHome() {
  const { user } = useAuth();
  const { data, error, loading } = useLoad(() => api<Child[]>('GET', '/children'), []);
  if (loading) return <Loading />;
  if (data && data.length === 1) return <Navigate to={`/p/children/${data[0].id}`} replace />;

  return (
    <div>
      <h1>{user?.displayName}님, 안녕하세요</h1>
      <p className="lead">오늘도 아이 곁에 있어 주셔서 고마워요.</p>
      <ErrorText error={error} />
      {data && data.length === 0 && (
        <section className="card soft">
          <h2>아이를 등록해 주세요</h2>
          <p>별칭과 태어난 해·달만 있으면 시작할 수 있어요. 실명은 받지 않아요.</p>
          <Link to="/p/children/new" className="btn block">
            아이 등록하기
          </Link>
        </section>
      )}
      {data && data.length > 1 && (
        <section className="card">
          {data.map((c) => (
            <Link key={c.id} to={`/p/children/${c.id}`} className="list-item">
              <span className="avatar">{c.nickname.slice(0, 1)}</span>
              <span style={{ flex: 1 }}>
                <strong>{c.nickname}</strong>
                <br />
                <span className="muted">{formatAge(c.ageMonths)}</span>
              </span>
              <span aria-hidden>›</span>
            </Link>
          ))}
          {data.length < 5 && (
            <Link to="/p/children/new" className="btn ghost">
              + 아이 추가
            </Link>
          )}
        </section>
      )}
    </div>
  );
}
