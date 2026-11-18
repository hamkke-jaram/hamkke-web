import { useRef, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { TokenResponse } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import BrandMark from '../components/BrandMark';
import { Field, PasswordField, looksLikeEmail, refocus } from '../components/feedback';
import { Icon } from '../components/icons';
import { ErrorText } from '../components/ui';

/**
 * 로그인. 검사는 제출할 때만 하고(버튼은 요청 중에만 막는다), 고칠 칸이 있으면 그 칸 아래에 알리고 첫 칸으로 포커스를 옮긴다.
 * 서버가 거절하면(이메일·비밀번호가 맞지 않음 등) 버튼 바로 위에 알린다. 칸을 고치기 시작하면 그 알림은 지운다.
 */
export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [pwError, setPwError] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const nextEmailError = looksLikeEmail(email) ? null : '이메일 주소를 확인해 주세요.';
    const nextPwError = password ? null : '비밀번호를 입력해 주세요.';
    // 오류 문장이 화면에 붙은 뒤에 포커스를 옮겨야 칸 이름과 함께 읽힌다.
    flushSync(() => {
      setEmailError(nextEmailError);
      setPwError(nextPwError);
      setError(null);
    });
    if (nextEmailError || nextPwError) {
      refocus(nextEmailError ? emailRef.current : pwRef.current);
      return;
    }
    setBusy(true);
    try {
      const t = await api<TokenResponse>('POST', '/auth/login', { email: email.trim(), password });
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
    <form onSubmit={submit} noValidate>
      {/* 시안: 로고 마크만 두고 캐릭터는 넣지 않는다. */}
      <div className="login-mark">
        <BrandMark width={112} />
      </div>
      <h1>로그인</h1>
      <p className="lead">다시 오셨네요, 반가워요.</p>
      <Field
        ref={emailRef}
        id="login-email"
        data-demo="login-email"
        label="이메일"
        type="email"
        autoComplete="email"
        value={email}
        error={emailError}
        onChange={(e) => {
          setEmail(e.target.value);
          setEmailError(null);
          setError(null);
        }}
      />
      <PasswordField
        ref={pwRef}
        id="login-pw"
        data-demo="login-pw"
        label="비밀번호"
        autoComplete="current-password"
        value={password}
        error={pwError}
        onChange={(e) => {
          setPassword(e.target.value);
          setPwError(null);
          setError(null);
        }}
      />
      <ErrorText error={error} />
      <button type="submit" className="btn block pill" style={{ marginTop: 6 }} data-demo="login-submit" aria-disabled={busy || undefined}>
        {busy ? '확인하는 중…' : '로그인'}
        {!busy && <Icon name="arrow" className="btn-icon" />}
      </button>
      <p className="status-line link-row" style={{ marginTop: 14 }}>
        처음이신가요?{' '}
        <Link to="/signup" className="link-btn">
          가입하기
        </Link>
      </p>
    </form>
  );
}
