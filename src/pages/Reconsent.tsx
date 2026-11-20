import { useRef, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { Link } from 'react-router-dom';
import { ApiError, api } from '../api/client';
import type { PolicyConsentType, User } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { buddy } from '../components/buddyBus';
import { describedBy, refocus, useToast } from '../components/feedback';
import { ErrorText, Loading } from '../components/ui';

const ITEMS: Record<PolicyConsentType, { label: string; to: string; linkLabel: string; demo: string }> = {
  TERMS_OF_SERVICE: {
    label: '[필수] 서비스 이용약관 동의',
    to: '/terms',
    linkLabel: '서비스 이용약관 자세히 보기',
    demo: 'reconsent-terms',
  },
  PRIVACY_POLICY: {
    label: '[필수] 개인정보 수집·이용 동의',
    to: '/privacy',
    linkLabel: '개인정보 처리 안내 자세히 보기',
    demo: 'reconsent-privacy',
  },
};

const ORDER: PolicyConsentType[] = ['TERMS_OF_SERVICE', 'PRIVACY_POLICY'];

/**
 * 약관·개인정보 처리 방침이 바뀌었을 때 로그인한 사람에게 보이는 '약관 다시 동의' 화면.
 * GET /me의 pendingConsents가 비어 있지 않으면 App이 다른 화면 대신 이 화면을 보여 준다
 * (약관·개인정보 안내, 도움받기, 내 정보는 그대로 열 수 있다). 동의하면 원래 보려던 화면으로 이어진다.
 */
export default function Reconsent({ pending }: { pending: PolicyConsentType[] }) {
  const { user, policies, policiesError, reloadPolicies, setUser, logout } = useAuth();
  const toast = useToast();
  const [checked, setChecked] = useState<Partial<Record<PolicyConsentType, boolean>>>({});
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const firstRef = useRef<HTMLInputElement>(null);
  const items = ORDER.filter((t) => pending.includes(t));

  if (!policies) {
    return (
      <div>
        <h1>약관 다시 동의</h1>
        {policiesError ? (
          <div className="card">
            <p style={{ marginTop: 0 }}>바뀐 약관 안내를 아직 불러오지 못했어요.</p>
            <ErrorText error={policiesError} />
            <button type="button" className="btn block" onClick={reloadPolicies}>
              다시 시도
            </button>
          </div>
        ) : (
          <Loading />
        )}
      </div>
    );
  }

  const versionOf = (t: PolicyConsentType) => (t === 'TERMS_OF_SERVICE' ? policies.termsVersion : policies.privacyVersion);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !policies) return;
    const allChecked = items.every((t) => checked[t]);
    flushSync(() => {
      setMissing(!allChecked);
      setError(null);
    });
    if (!allChecked) {
      const firstMissing = items.find((t) => !checked[t]);
      refocus(firstMissing ? document.getElementById(`reconsent-${firstMissing}`) : firstRef.current);
      return;
    }
    setBusy(true);
    try {
      for (const type of items) {
        await api('POST', '/me/consents', { type, version: versionOf(type) });
      }
      // 동의는 저장됐다. /me를 잠깐 못 불러와도 로그아웃된 것처럼 보이지 않게, 그때는 동의한 항목만 목록에서 뺀다.
      const me = await api<User>('GET', '/me').catch(() => null);
      if (me) setUser(me);
      else if (user) setUser({ ...user, pendingConsents: (user.pendingConsents ?? []).filter((t) => !items.includes(t)) });
      toast('다시 동의해 주셔서 고마워요.');
      buddy.emit('wave');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'VALIDATION_FAILED') {
        // 그사이 약관이 또 바뀌었다: 새 버전을 받아 다시 읽고 체크하게 한다.
        reloadPolicies();
        setChecked({});
        setError(new Error('약관 내용이 그사이 새로 바뀌었어요. 내용을 다시 읽고 동의해 주세요.'));
      } else {
        setError(err);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <h1>약관 다시 동의</h1>
      <p className="lead">
        시나브로의 약관 내용이 바뀌었어요. 바뀐 내용을 읽고 동의해 주시면 이어서 쓸 수 있어요. 그동안의 기록은 그대로
        있어요.
      </p>
      <div className="card" role="group" aria-label="바뀐 약관 동의" style={{ paddingTop: 6, paddingBottom: 6 }}>
        {items.map((t, i) => {
          const it = ITEMS[t];
          const inputId = `reconsent-${t}`;
          return (
            <div key={t}>
              <label className="check">
                <input
                  ref={i === 0 ? firstRef : undefined}
                  id={inputId}
                  type="checkbox"
                  data-demo={it.demo}
                  checked={checked[t] === true}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setChecked((c) => ({ ...c, [t]: on }));
                    setMissing(false);
                    setError(null);
                  }}
                  aria-invalid={missing && !checked[t] ? true : undefined}
                  aria-describedby={describedBy(`${inputId}-desc`, missing && 'reconsent-err')}
                />
                <span>
                  <strong>{it.label}</strong>
                </span>
              </label>
              <p className="field-hint" id={`${inputId}-desc`} style={{ margin: '-10px 0 0', padding: '0 0 12px 34px' }}>
                새 버전 {versionOf(t)}.{' '}
                <Link to={it.to} className="link-btn" aria-label={it.linkLabel}>
                  자세히
                </Link>
              </p>
            </div>
          );
        })}
      </div>
      {missing && (
        <p className="error field-error" id="reconsent-err">
          필수 항목에 동의해 주세요.
        </p>
      )}
      <ErrorText error={error} />
      <div className="stack">
        <button type="submit" className="btn block" data-demo="reconsent-submit" aria-disabled={busy || undefined}>
          {busy ? '저장하는 중…' : '동의하고 계속하기'}
        </button>
        <button type="button" className="btn block ghost" data-demo="reconsent-logout" onClick={() => void logout()}>
          동의하지 않고 로그아웃
        </button>
      </div>
      <p className="muted" style={{ marginTop: 14 }}>
        동의하지 않으셔도 <Link to="/account">내 정보</Link>에서 내 데이터를 내려받거나 탈퇴할 수 있어요.
      </p>
    </form>
  );
}
