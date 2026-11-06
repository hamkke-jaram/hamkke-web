import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { TokenResponse } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ErrorText } from '../components/ui';

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const t = await api<TokenResponse>('POST', '/auth/login', { email, password });
      login(t);
      const from = (loc.state as { from?: string } | null)?.from;
      nav(from ?? (t.user.role === 'PARENT' ? '/p' : '/t'), { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <h1>로그인</h1>
      <p className="lead">다시 오셨네요, 반가워요.</p>
      <label className="field">
        <span>이메일</span>
        <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="field">
        <span>비밀번호</span>
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <ErrorText error={error} />
      <button className="btn block" disabled={busy}>
        {busy ? '확인하는 중…' : '로그인'}
      </button>
      <p className="muted" style={{ textAlign: 'center' }}>
        처음이신가요? <Link to="/signup">가입하기</Link>
      </p>
    </form>
  );
}
