import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { Role, TokenResponse } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ErrorText, Loading } from '../components/ui';

export default function Signup() {
  const { login, policies } = useAuth();
  const nav = useNavigate();
  const [role, setRole] = useState<Role>('PARENT');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  if (!policies) return <Loading />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!policies) return;
    setBusy(true);
    setError(null);
    try {
      const t = await api<TokenResponse>('POST', '/auth/signup', {
        email,
        password,
        displayName,
        role,
        consents: [
          ...(terms ? [{ type: 'TERMS_OF_SERVICE', version: policies.termsVersion }] : []),
          ...(privacy ? [{ type: 'PRIVACY_POLICY', version: policies.privacyVersion }] : []),
        ],
      });
      login(t);
      nav(t.user.role === 'PARENT' ? '/p/children/new' : '/t', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <h1>가입하기</h1>
      <div className="tabs" role="group" aria-label="가입 유형">
        <button type="button" aria-pressed={role === 'PARENT'} onClick={() => setRole('PARENT')}>
          보호자
        </button>
        <button type="button" aria-pressed={role === 'TEACHER'} onClick={() => setRole('TEACHER')}>
          어린이집 교사
        </button>
      </div>
      <label className="field">
        <span>이메일</span>
        <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="field">
        <span>비밀번호 (영문·숫자 포함 8자 이상)</span>
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={64}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <label className="field">
        <span>{role === 'PARENT' ? '앱에서 부를 이름 (예: 하늘맘)' : '표시 이름 (예: 해님반 김선생)'}</span>
        <input type="text" required maxLength={30} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </label>

      <div className="card">
        <label className="check">
          <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
          <span>
            <strong>[필수] 서비스 이용약관 동의</strong>
            <br />
            <span className="muted">
              함께자람은 의료기기가 아닌 개인 건강관리(웰니스) 서비스이며 발달 상태를 판단하지 않아요.
            </span>
          </span>
        </label>
        <label className="check">
          <input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} />
          <span>
            <strong>[필수] 개인정보 수집·이용 동의</strong>
            <br />
            <span className="muted">
              이메일, 이름, 기기에서 계산한 상호작용 수치만 저장해요. 영상·소리는 저장하지 않아요.{' '}
              <Link to="/privacy">자세히</Link>
            </span>
          </span>
        </label>
      </div>

      <ErrorText error={error} />
      <button className="btn block" disabled={busy || !terms || !privacy}>
        {busy ? '가입하는 중…' : '동의하고 가입하기'}
      </button>
      <p className="muted" style={{ textAlign: 'center' }}>
        이미 계정이 있나요? <Link to="/login">로그인</Link>
      </p>
    </form>
  );
}
