import { forwardRef, useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ApiError, api, setSession } from '../api/client';
import type { Child, ConsentRecord, TokenResponse, User } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { DangerAction, Field, PasswordField, refocus, useToast } from '../components/feedback';
import { ErrorText, Loading, formatDate, useLoad } from '../components/ui';
import { ThemeSettingsCard } from '../theme';
import './extra.css';

const CONSENT_LABEL: Record<string, string> = {
  TERMS_OF_SERVICE: '서비스 이용약관',
  PRIVACY_POLICY: '개인정보 수집·이용',
  CHILD_DATA_GUARDIAN: '아동 정보 법정대리인 동의',
  CHILD_IMAGE_AI_ANALYSIS: 'AI 관찰 기록 법정대리인 동의',
};

/** 아이에 딸린 동의(아이를 지우면 childId가 비지만 기록은 남는다). */
const CHILD_CONSENTS = ['CHILD_DATA_GUARDIAN', 'CHILD_IMAGE_AI_ANALYSIS'];

/** 내려받는 파일 이름(서버의 Content-Disposition과 같다). */
const EXPORT_FILE_NAME = 'hamkke-jaram-export.json';

/** 가입과 같은 규칙(ACC-01): 8~64자, 영문과 숫자를 함께. */
function isGoodPassword(v: string) {
  return v.length >= 8 && v.length <= 64 && /[A-Za-z]/.test(v) && /[0-9]/.test(v);
}

/** JSON을 파일로 내려받게 한다(이 기기에만 저장된다). */
function saveJson(data: unknown, fileName: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 내려받기가 시작된 뒤에 주소를 거둔다.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export default function Account() {
  const { user, logout, login, setUser } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const isParent = user?.role === 'PARENT';
  const consents = useLoad(() => api<ConsentRecord[]>('GET', '/me/consents'), []);
  // 동의 기록에 어느 아이의 동의인지 적으려고만 불러온다. 못 불러오면 이름 없이 보여 준다.
  const kids = useLoad(() => (isParent ? api<Child[]>('GET', '/children') : Promise.resolve([] as Child[])), [isParent]);
  const [loggingOut, setLoggingOut] = useState(false);
  const [password, setPassword] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const pwRef = useRef<HTMLInputElement>(null);

  // 표시 이름
  const [name, setName] = useState(user?.displayName ?? '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameFormError, setNameFormError] = useState<unknown>(null);
  const [nameBusy, setNameBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (user?.displayName) setName(user.displayName);
  }, [user?.displayName]);

  // 비밀번호 바꾸기
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [curPwError, setCurPwError] = useState<string | null>(null);
  const [newPwError, setNewPwError] = useState<string | null>(null);
  const [pwFormError, setPwFormError] = useState<unknown>(null);
  const [pwBusy, setPwBusy] = useState(false);
  const curPwRef = useRef<HTMLInputElement>(null);
  const newPwRef = useRef<HTMLInputElement>(null);

  // 내 데이터 내려받기
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<unknown>(null);

  const initial = user?.displayName ? Array.from(user.displayName)[0] : '';

  // 확인 상자를 닫으면(취소) 입력한 비밀번호와 오류를 지운다. 다시 열었을 때 남아 있지 않게.
  const resetPassword = useCallback(() => {
    setPassword('');
    setPwError(null);
  }, []);

  async function saveName(e: FormEvent) {
    e.preventDefault();
    if (nameBusy) return;
    const trimmed = name.trim();
    if (!trimmed) {
      flushSync(() => {
        setNameError(isParent ? '앱에서 부를 이름을 써 주세요.' : '표시 이름을 써 주세요.');
        setNameFormError(null);
      });
      refocus(nameRef.current);
      return;
    }
    if (trimmed === user?.displayName) {
      toast('바뀐 내용이 없어요.');
      return;
    }
    setNameBusy(true);
    setNameFormError(null);
    try {
      const me = await api<User>('PATCH', '/me', { displayName: trimmed });
      setUser(me);
      toast('이름을 바꿨어요.');
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors[0]?.field === 'displayName') {
        const message = err.message;
        flushSync(() => setNameError(message));
        refocus(nameRef.current);
      } else {
        setNameFormError(err);
      }
    } finally {
      setNameBusy(false);
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    if (pwBusy) return;
    const next = {
      cur: curPw ? null : '지금 쓰는 비밀번호를 입력해 주세요.',
      nw: !isGoodPassword(newPw)
        ? '영문과 숫자를 섞어 8~64자로 써 주세요.'
        : newPw === curPw
          ? '지금 쓰는 비밀번호와 다르게 정해 주세요.'
          : null,
    };
    flushSync(() => {
      setCurPwError(next.cur);
      setNewPwError(next.nw);
      setPwFormError(null);
    });
    if (next.cur || next.nw) {
      refocus(next.cur ? curPwRef.current : newPwRef.current);
      return;
    }
    setPwBusy(true);
    try {
      const t = await api<TokenResponse>('PUT', '/me/password', { currentPassword: curPw, newPassword: newPw });
      // 서버가 이 기기에 새 토큰을 주고, 다른 기기의 로그인은 모두 끝낸다.
      login(t);
      setCurPw('');
      setNewPw('');
      toast('비밀번호를 바꿨어요. 다른 기기에서는 다시 로그인해 주세요.');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INVALID_CREDENTIALS') {
        flushSync(() => setCurPwError('지금 쓰는 비밀번호가 맞지 않아요.'));
        refocus(curPwRef.current);
      } else if (err instanceof ApiError && err.fieldErrors[0]?.field === 'newPassword') {
        const message = err.message;
        flushSync(() => setNewPwError(message));
        refocus(newPwRef.current);
      } else {
        setPwFormError(err);
      }
    } finally {
      setPwBusy(false);
    }
  }

  async function exportData() {
    if (exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      const data = await api<unknown>('GET', '/me/export');
      saveJson(data, EXPORT_FILE_NAME);
      toast('내 데이터 파일을 내려받았어요.');
    } catch (err) {
      setExportError(err);
    } finally {
      setExporting(false);
    }
  }

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

  /** 동의 기록 한 줄의 '· 콩이' 부분. 아이에 딸린 동의가 아니면 빈 문자열. */
  function childPart(c: ConsentRecord) {
    if (!CHILD_CONSENTS.includes(c.type)) return '';
    if (c.childId == null) return ' · 삭제한 아이';
    const kid = kids.data?.find((k) => k.id === c.childId);
    return kid ? ` · ${kid.nickname}` : '';
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

      <section className="card" aria-labelledby="account-settings-h">
        <h2 id="account-settings-h">계정 설정</h2>
        <form className="account-form" onSubmit={saveName} noValidate>
          <Field
            ref={nameRef}
            id="account-name"
            data-demo="account-name"
            label={isParent ? '앱에서 부를 이름' : '표시 이름'}
            hint={isParent ? undefined : '보호자 화면에 이 이름으로 보여요.'}
            type="text"
            autoComplete="nickname"
            maxLength={30}
            value={name}
            error={nameError}
            onChange={(e) => {
              setName(e.target.value);
              setNameError(null);
              setNameFormError(null);
            }}
          />
          <ErrorText error={nameFormError} />
          <button type="submit" className="btn secondary block" data-demo="account-name-submit" disabled={nameBusy}>
            {nameBusy ? '저장하는 중…' : '이름 저장'}
          </button>
        </form>

        <form className="account-form" onSubmit={changePassword} noValidate aria-labelledby="account-pw-h">
          <h3 id="account-pw-h" style={{ marginTop: 0 }}>
            비밀번호 바꾸기
          </h3>
          <PasswordField
            ref={curPwRef}
            id="account-pw-current"
            data-demo="account-pw-current"
            label="지금 비밀번호"
            autoComplete="current-password"
            maxLength={64}
            value={curPw}
            error={curPwError}
            onChange={(e) => {
              setCurPw(e.target.value);
              setCurPwError(null);
              setPwFormError(null);
            }}
          />
          <PasswordField
            ref={newPwRef}
            id="account-pw-new"
            data-demo="account-pw-new"
            label="새 비밀번호"
            hint="영문과 숫자를 섞어 8자 이상"
            autoComplete="new-password"
            maxLength={64}
            value={newPw}
            error={newPwError}
            onChange={(e) => {
              setNewPw(e.target.value);
              setNewPwError(null);
              setPwFormError(null);
            }}
          />
          <ErrorText error={pwFormError} />
          <button type="submit" className="btn secondary block" data-demo="account-pw-submit" disabled={pwBusy}>
            {pwBusy ? '바꾸는 중…' : '비밀번호 바꾸기'}
          </button>
          <p className="field-hint" style={{ margin: '8px 0 0' }}>
            바꾸면 이 기기만 로그인한 채로 두고, 다른 기기에서는 다시 로그인해야 해요.
          </p>
        </form>
      </section>

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
          consents.data.map((c) => (
            <div key={`${c.type}-${c.childId ?? 'none'}-${c.agreedAt}`} className="list-item">
              <div className="item-body">
                <div>
                  {CONSENT_LABEL[c.type] ?? '그 밖의 동의'}
                  {childPart(c)}
                </div>
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

      <section className="card" aria-labelledby="account-export-h">
        <h2 id="account-export-h">내 데이터 내려받기</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          {isParent
            ? '계정 정보, 동의 기록, 아이별 기록·코칭 카드·공유 설정·연결된 선생님 이름·목표·메모·AI 관찰 기록을 한 파일(JSON)로 내려받아요.'
            : '계정 정보, 동의 기록, 연결된 아이와 내가 남긴 목표·메모를 한 파일(JSON)로 내려받아요.'}{' '}
          파일은 이 기기에만 저장돼요. 아이 기록이 담겨 있으니 안전한 곳에 보관해 주세요.
        </p>
        <ErrorText error={exportError} />
        <button
          type="button"
          className="btn secondary block"
          data-demo="account-export"
          aria-disabled={exporting || undefined}
          onClick={() => void exportData()}
        >
          {exporting ? '파일을 만드는 중…' : '내 데이터 내려받기'}
        </button>
      </section>

      <button
        type="button"
        className="btn secondary block"
        style={{ margin: '4px 0 28px' }}
        data-demo="account-logout"
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
          demo="account-delete"
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
      data-demo="account-delete-pw"
      label="비밀번호 확인"
      autoComplete="current-password"
      value={value}
      error={error}
      onChange={(e) => onChange(e.target.value)}
    />
  );
});
