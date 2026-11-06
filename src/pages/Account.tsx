import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setSession } from '../api/client';
import type { ConsentRecord } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ErrorText, formatDate, useLoad } from '../components/ui';

const CONSENT_LABEL: Record<string, string> = {
  TERMS_OF_SERVICE: '서비스 이용약관',
  PRIVACY_POLICY: '개인정보 수집·이용',
  CHILD_DATA_GUARDIAN: '아동 정보 법정대리인 동의',
};

export default function Account() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const consents = useLoad(() => api<ConsentRecord[]>('GET', '/me/consents'), []);
  const [showDelete, setShowDelete] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function deleteAccount() {
    setBusy(true);
    setError(null);
    try {
      await api('DELETE', '/me', { password });
      setSession(null);
      nav('/', { replace: true });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1>내 정보</h1>
      <section className="card">
        <div>
          <strong>{user?.displayName}</strong> <span className="chip">{user?.role === 'PARENT' ? '보호자' : '교사'}</span>
        </div>
        <div className="muted">{user?.email}</div>
        <button
          className="btn secondary block"
          style={{ marginTop: 14 }}
          onClick={async () => {
            await logout();
            nav('/', { replace: true });
          }}
        >
          로그아웃
        </button>
      </section>

      <section className="card">
        <h2>동의 기록</h2>
        {consents.data?.map((c, i) => (
          <div key={i} className="list-item">
            <div style={{ flex: 1 }}>
              <div>{CONSENT_LABEL[c.type] ?? c.type}</div>
              <div className="muted">
                {formatDate(c.agreedAt)} 동의 · 버전 {c.version}
                {c.revokedAt && ` · ${formatDate(c.revokedAt)} 철회`}
              </div>
            </div>
          </div>
        ))}
      </section>

      <section className="card">
        <h2>회원 탈퇴</h2>
        <p className="muted">
          탈퇴하면 계정과 {user?.role === 'PARENT' ? '아이 정보, 모든 기록, 공유 연결이' : '작성한 목표·메모와 연결이'}{' '}
          즉시 지워지고 되돌릴 수 없어요.
        </p>
        {!showDelete ? (
          <button className="btn danger block" onClick={() => setShowDelete(true)}>
            탈퇴하기
          </button>
        ) : (
          <div>
            <label className="field">
              <span>비밀번호 확인</span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <ErrorText error={error} />
            <div className="row">
              <button className="btn secondary" style={{ flex: 1 }} onClick={() => setShowDelete(false)}>
                취소
              </button>
              <button className="btn danger" style={{ flex: 1 }} disabled={!password || busy} onClick={deleteAccount}>
                모두 지우고 탈퇴
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
