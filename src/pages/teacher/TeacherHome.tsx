import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import type { TeacherChild } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { ErrorText, Loading, Section, formatAge, useLoad } from '../../components/ui';

export default function TeacherHome() {
  const { user } = useAuth();
  const nav = useNavigate();
  const children = useLoad(() => api<TeacherChild[]>('GET', '/teacher/children'), []);
  const [code, setCode] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function link(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const c = await api<TeacherChild>('POST', '/teacher/links', { code });
      nav(`/t/children/${c.id}`);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1>{user?.displayName} 선생님, 안녕하세요</h1>
      <p className="lead">보호자가 공유한 기록만 주 단위로 볼 수 있어요.</p>

      <Section title="초대 코드로 아이 연결">
        <form onSubmit={link}>
          <label className="field">
            <span className="sr-only">초대 코드</span>
            <input
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              placeholder="예: ABCD-2345"
              maxLength={12}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
          </label>
          <ErrorText error={error} />
          <button className="btn block" disabled={busy || code.replace(/[\s-]/g, '').length < 8}>
            연결하기
          </button>
        </form>
      </Section>

      <Section title="연결된 아이">
        {children.loading && <Loading />}
        <ErrorText error={children.error} />
        {children.data?.length === 0 && <p className="muted">보호자에게 받은 초대 코드를 입력해 주세요.</p>}
        {children.data?.map((c) => (
          <Link key={c.id} to={`/t/children/${c.id}`} className="list-item">
            <span className="avatar">{c.nickname.slice(0, 1)}</span>
            <span style={{ flex: 1 }}>
              <strong>{c.nickname}</strong>
              <br />
              <span className="muted">{formatAge(c.ageMonths)}</span>
            </span>
            <span aria-hidden>›</span>
          </Link>
        ))}
      </Section>
    </div>
  );
}
