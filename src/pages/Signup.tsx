import { useEffect, useRef, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ApiError, api, onSessionChange } from '../api/client';
import type { Role, TokenResponse } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Field, PasswordField, describedBy, looksLikeEmail, refocus, useToast } from '../components/feedback';
import Mascot from '../components/Mascot';
import { ErrorText, Loading } from '../components/ui';

/** 가입 도중 다른 화면(자세히, 도움받기 등)에 다녀왔을 때 되살릴 내용. 비밀번호는 담지 않는다. */
interface SignupDraft {
  role: Role;
  email: string;
  displayName: string;
  terms: boolean;
  privacy: boolean;
}

/**
 * 쓰던 내용은 메모리에만, 이 가입 화면의 방문 기록(location.key)에 묶어 둔다. 뒤로 가기로 같은 기록에 돌아올 때만
 * 되살리고, 새로 가입 화면을 열면(다른 key) 빈 양식으로 시작한다. 새로 고침하면 사라진다.
 */
let draftMemory: { key: string; draft: SignupDraft } | null = null;

// 누가 로그인하거나 로그아웃하면 쓰던 가입 내용을 잊는다. 같은 폰을 쓰는 다른 사람이 뒤로 가기로 돌아와도 앞사람의 이메일·이름이 보이지 않게.
onSessionChange(() => {
  draftMemory = null;
});

function isGoodPassword(v: string) {
  return v.length >= 8 && /[A-Za-z]/.test(v) && /[0-9]/.test(v);
}

// 설명 문장은 체크 줄 바로 아래, 체크 상자 너비(22px + 간격 12px)만큼 들여 글자와 줄을 맞춘다.
const CONSENT_DESC = { margin: '-10px 0 0', padding: '0 0 12px 34px' } as const;

export default function Signup() {
  const { user, login, policies, policiesError, reloadPolicies } = useAuth();
  const nav = useNavigate();
  const { key } = useLocation();
  const toast = useToast();
  const [draft] = useState(() => (!user && draftMemory?.key === key ? draftMemory.draft : null));
  const [role, setRole] = useState<Role>(draft?.role ?? 'PARENT');
  const [email, setEmail] = useState(draft?.email ?? '');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState(draft?.displayName ?? '');
  const [terms, setTerms] = useState(draft?.terms ?? false);
  const [privacy, setPrivacy] = useState(draft?.privacy ?? false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [pwError, setPwError] = useState<string | null>(null);
  const [nameMissing, setNameMissing] = useState(false);
  const [consentMissing, setConsentMissing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const termsRef = useRef<HTMLInputElement>(null);
  const privacyRef = useRef<HTMLInputElement>(null);

  // 화면을 떠날 때(가입에 성공한 경우는 빼고) 쓰던 내용을 기억해 둔다.
  const latest = useRef<SignupDraft>({ role, email, displayName, terms, privacy });
  latest.current = { role, email, displayName, terms, privacy };
  const done = useRef(false);
  useEffect(() => {
    draftMemory = null;
    return () => {
      if (!done.current) draftMemory = { key, draft: latest.current };
    };
  }, [key]);

  if (!policies) {
    if (!policiesError)
      return (
        <div>
          <h1>가입하기</h1>
          <Loading />
        </div>
      );
    return (
      <div>
        <h1>가입하기</h1>
        <div className="card">
          <p style={{ marginTop: 0 }}>가입에 필요한 약관 안내를 아직 불러오지 못했어요.</p>
          <ErrorText error={policiesError} />
          <button type="button" className="btn block" onClick={reloadPolicies}>
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  const isParent = role === 'PARENT';

  function setAgree(nextTerms: boolean, nextPrivacy: boolean) {
    setTerms(nextTerms);
    setPrivacy(nextPrivacy);
    setConsentMissing(false);
    setError(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!policies || busy) return;
    const next = {
      email: looksLikeEmail(email) ? null : '이메일 주소를 확인해 주세요.',
      pw: isGoodPassword(password) ? null : '영문과 숫자를 섞어 8자 이상으로 써 주세요.',
      name: !displayName.trim(),
      consent: !(terms && privacy),
    };
    // 오류 문장이 화면에 붙은 뒤에 포커스를 옮겨야 칸 이름과 함께 읽힌다.
    flushSync(() => {
      setEmailError(next.email);
      setPwError(next.pw);
      setNameMissing(next.name);
      setConsentMissing(next.consent);
      setError(null);
    });
    const first = next.email
      ? emailRef
      : next.pw
        ? pwRef
        : next.name
          ? nameRef
          : next.consent
            ? terms
              ? privacyRef
              : termsRef
            : null;
    if (first) {
      refocus(first.current);
      return;
    }
    setBusy(true);
    try {
      const t = await api<TokenResponse>('POST', '/auth/signup', {
        email: email.trim(),
        password,
        displayName: displayName.trim(),
        role,
        consents: [
          ...(terms ? [{ type: 'TERMS_OF_SERVICE', version: policies.termsVersion }] : []),
          ...(privacy ? [{ type: 'PRIVACY_POLICY', version: policies.privacyVersion }] : []),
        ],
      });
      done.current = true;
      login(t);
      if (t.user.role === 'PARENT') {
        // 아이 등록 화면이 '가입을 마쳤어요'를 알려 준다.
        nav('/p/children/new', { replace: true, state: { onboarding: true } });
      } else {
        toast('가입을 마쳤어요. 반가워요.');
        nav('/t', { replace: true });
      }
    } catch (err) {
      // 이메일을 짚은 거절(이미 가입된 이메일, 형식)은 이메일 칸 아래에 알린다. 나머지는 버튼 위에.
      if (err instanceof ApiError && (err.code === 'EMAIL_TAKEN' || err.fieldErrors[0]?.field === 'email')) {
        const message = err.message;
        flushSync(() => setEmailError(message));
        refocus(emailRef.current);
      } else {
        setError(err);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="page-head">
        <div className="page-head-text">
          <h1>가입하기</h1>
        </div>
        <Mascot name="family" size={88} />
      </div>
      <div className="tabs" role="group" aria-label="가입 유형" aria-describedby="signup-role-hint">
        <button type="button" aria-pressed={isParent} data-demo="signup-role-parent" onClick={() => setRole('PARENT')}>
          보호자
        </button>
        <button type="button" aria-pressed={!isParent} data-demo="signup-role-teacher" onClick={() => setRole('TEACHER')}>
          기관 선생님
        </button>
      </div>
      <p className="status-line" id="signup-role-hint" aria-live="polite" style={{ margin: '-8px 0 18px' }}>
        {isParent ? '아이를 등록하고 함께 노는 시간을 기록해요.' : '어린이집·유치원·센터 등에서 아이를 돌보는 선생님이에요.'}
      </p>

      <Field
        ref={emailRef}
        id="signup-email"
        data-demo="signup-email"
        label="이메일"
        type="email"
        autoComplete="email"
        maxLength={254}
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
        id="signup-pw"
        data-demo="signup-pw"
        label="비밀번호"
        hint="영문과 숫자를 섞어 8자 이상"
        autoComplete="new-password"
        maxLength={64}
        value={password}
        error={pwError}
        onChange={(e) => {
          setPassword(e.target.value);
          setPwError(null);
          setError(null);
        }}
      />
      <Field
        ref={nameRef}
        id="signup-name"
        data-demo="signup-name"
        label={isParent ? '앱에서 부를 이름' : '표시 이름'}
        hint={isParent ? undefined : '보호자 화면에 이 이름으로 보여요.'}
        type="text"
        autoComplete="nickname"
        maxLength={30}
        placeholder={isParent ? '예: 하늘맘' : '예: 해님반 김선생'}
        value={displayName}
        error={nameMissing ? (isParent ? '앱에서 부를 이름을 써 주세요.' : '표시 이름을 써 주세요.') : null}
        onChange={(e) => {
          setDisplayName(e.target.value);
          setNameMissing(false);
          setError(null);
        }}
      />

      <div className="card" role="group" aria-label="약관 동의" style={{ paddingTop: 6, paddingBottom: 6 }}>
        <label className="check">
          <input
            type="checkbox"
            data-demo="signup-agree-all"
            checked={terms && privacy}
            onChange={(e) => setAgree(e.target.checked, e.target.checked)}
          />
          <span>
            <strong>모두 동의</strong>
          </span>
        </label>
        <label className="check">
          <input
            ref={termsRef}
            id="signup-terms"
            data-demo="signup-terms"
            type="checkbox"
            checked={terms}
            onChange={(e) => setAgree(e.target.checked, privacy)}
            aria-invalid={consentMissing && !terms ? true : undefined}
            aria-describedby={describedBy('signup-terms-desc', consentMissing && 'signup-consent-err')}
          />
          <span>
            <strong>[필수] 서비스 이용약관 동의</strong>
          </span>
        </label>
        <p className="field-hint" id="signup-terms-desc" style={CONSENT_DESC}>
          시나브로는 의료기기가 아닌 개인 건강관리(웰니스) 서비스이며 발달 상태를 판단하지 않아요.{' '}
          <Link to="/terms" className="link-btn" aria-label="서비스 이용약관 자세히 보기">
            자세히
          </Link>
        </p>
        <label className="check">
          <input
            ref={privacyRef}
            id="signup-privacy"
            data-demo="signup-privacy"
            type="checkbox"
            checked={privacy}
            onChange={(e) => setAgree(terms, e.target.checked)}
            aria-invalid={consentMissing && !privacy ? true : undefined}
            aria-describedby={describedBy('signup-privacy-desc', consentMissing && 'signup-consent-err')}
          />
          <span>
            <strong>[필수] 개인정보 수집·이용 동의</strong>
          </span>
        </label>
        <p className="field-hint" id="signup-privacy-desc" style={CONSENT_DESC}>
          이메일, 이름, 기기에서 계산한 상호작용 수치를 저장해요. 영상·소리는 저장하지 않아요. AI 관찰 기록은 아이마다
          따로 동의한 경우에만 만들어요.{' '}
          <Link to="/privacy" className="link-btn" aria-label="개인정보 처리 안내 자세히 보기">
            자세히
          </Link>
        </p>
      </div>
      {consentMissing && (
        <p className="error field-error" id="signup-consent-err">
          필수 항목에 동의해 주세요.
        </p>
      )}

      <ErrorText error={error} />
      <button type="submit" className="btn block" style={{ marginTop: 6 }} data-demo="signup-submit" aria-disabled={busy || undefined}>
        {busy ? '가입하는 중…' : '동의하고 가입하기'}
      </button>
      <p className="status-line link-row" style={{ marginTop: 14 }}>
        이미 계정이 있나요?{' '}
        <Link to="/login" className="link-btn">
          로그인
        </Link>
      </p>
    </form>
  );
}
