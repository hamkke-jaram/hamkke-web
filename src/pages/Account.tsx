import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ApiError, api, setSession } from '../api/client';
import type { ConsentRecord } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { DangerAction, PasswordField, refocus, useToast } from '../components/feedback';
import { ErrorText, Loading, formatDate, useLoad } from '../components/ui';
import { ThemeSettingsCard } from '../theme';

const CONSENT_LABEL: Record<string, string> = {
  TERMS_OF_SERVICE: '서비스 이용약관',
  PRIVACY_POLICY: '개인정보 수집·이용',
  CHILD_DATA_GUARDIAN: '아동 정보 법정대리인 동의',
  CHILD_IMAGE_AI_ANALYSIS: 'AI 관찰 기록 법정대리인 동의',
};

export default function Account() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const consents = useLoad(() => api<ConsentRecord[]>('GET', '/me/consents'), []);
  const [loggingOut, setLoggingOut] = useState(false);
  const [password, setPassword] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const pwRef = useRef<HTMLInputElement>(null);

  const isParent = user?.role === 'PARENT';
  const initial = user?.displayName ? Array.from(user.displayName)[0] : '';

  // 확인 상자를 닫으면(취소) 입력한 비밀번호와 오류를 지운다. 다시 열었을 때 남아 있지 않게.
  const resetPassword = useCallback(() => {
    setPassword('');
    setPwError(null);
  }, []);

  async function doLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    await logout();
    toast('로그아웃했어요.');
    nav('/', { replace: true });
  }

  async function deleteAccount() {
    if (!password) {
      flushSync(() => setPwError('비밀번호를 입력해 주세요.'));
      refocus(pwRef.current);
      return;
    }
    try {
      await api('DELETE', '/me', { password });
    } catch (e) {
      // 비밀번호가 틀리면 그 칸 아래에 알리고 칸으로 돌아간다(칸을 고치면 지워진다). 다른 실패는 확인 상자가 버튼 위에 보여 준다.
      if (e instanceof ApiError && e.code === 'INVALID_CREDENTIALS') {
        flushSync(() => setPwError('비밀번호가 맞지 않아요.'));
        refocus(pwRef.current);
        return;
      }
      throw e;
    }
    setSession(null);
    toast('탈퇴를 마쳤어요. 그동안 함께해 주셔서 고마웠어요.');
    nav('/', { replace: true });
  }

  return (
    <div>
      <h1>내 정보</h1>
      <div className="card row" style={{ gap: 14 }}>
        <div className="avatar" aria-hidden="true">
          {initial}
        </div>
        <div className="item-body">
          <div className="row wrap" style={{ gap: 8 }}>
            <strong>{user?.displayName}</strong>
            <span className="chip">{isParent ? '보호자' : '기관 선생님'}</span>
          </div>
          <p className="muted" style={{ margin: 0 }}>
            {user?.email}
          </p>
        </div>
      </div>

      <ThemeSettingsCard />

      <section className="card" aria-labelledby="account-consents-h">
        <h2 id="account-consents-h">동의 기록</h2>
        {consents.loading && !consents.data ? (
          <Loading />
        ) : consents.error && !consents.data ? (
          <>
            <ErrorText error={consents.error} />
            <button type="button" className="btn small secondary" onClick={consents.reload}>
              다시 시도
            </button>
          </>
        ) : consents.data && consents.data.length > 0 ? (
          consents.data.map((c, i) => (
            <div key={i} className="list-item">
              <div className="item-body">
                <div>{CONSENT_LABEL[c.type] ?? '그 밖의 동의'}</div>
                <span className="meta">
                  {formatDate(c.agreedAt)} 동의 · 버전 {c.version}
                  {c.revokedAt && ` · ${formatDate(c.revokedAt)} 철회`}
                </span>
              </div>
            </div>
          ))
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            아직 동의 기록이 없어요.
          </p>
        )}
      </section>

      <button
        type="button"
        className="btn secondary block"
        style={{ margin: '4px 0 28px' }}
        disabled={loggingOut}
        onClick={() => void doLogout()}
      >
        {loggingOut ? '로그아웃하는 중…' : '로그아웃'}
      </button>

      <section className="card" aria-labelledby="account-delete-h">
        <h2 id="account-delete-h">회원 탈퇴</h2>
        <DangerAction
          label="탈퇴하기"
          question="정말 탈퇴할까요?"
          detail={
            isParent
              ? '계정과 아이 정보, 모든 기록, 공유 연결이 즉시 지워지고 되돌릴 수 없어요.'
              : '계정, 남긴 목표·메모, 아이 연결이 즉시 지워지고 되돌릴 수 없어요. 직접 만든 AI 관찰 기록은 아이 기록에 남아요.'
          }
          confirmLabel="탈퇴하기"
          busyLabel="지우는 중…"
          onConfirm={deleteAccount}
        >
          <DeletePassword
            ref={pwRef}
            value={password}
            error={pwError}
            onChange={(v) => {
              setPassword(v);
              setPwError(null);
            }}
            onClose={resetPassword}
          />
        </DangerAction>
      </section>
    </div>
  );
}

/** 탈퇴 확인 상자 안의 비밀번호 칸. 상자가 닫히면(이 칸이 사라지면) onClose로 입력을 지운다. */
const DeletePassword = forwardRef<
  HTMLInputElement,
  { value: string; error: string | null; onChange: (v: string) => void; onClose: () => void }
>(function DeletePassword({ value, error, onChange, onClose }, ref) {
  useEffect(() => onClose, [onClose]);
  return (
    <PasswordField
      ref={ref}
      id="account-delete-pw"
      label="비밀번호 확인"
      autoComplete="current-password"
      value={value}
      error={error}
      onChange={(e) => onChange(e.target.value)}
    />
  );
});
