import { forwardRef, useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, api, setSession } from '../api/client';
import type { Child, ConsentRecord, TokenResponse, User } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { isCurrentDemoUser } from '../auth/demoLogin';
import { DeleteDemoAccounts } from '../auth/DemoSessionTools';
import { forgetGuest, guestPasswordFor, isGuestUser } from '../auth/guest';
import { buddy } from '../components/buddyBus';
import { DangerAction, Field, PasswordField, refocus, useToast } from '../components/feedback';
import { Icon } from '../components/icons';
import { ErrorText, Loading, formatDate, useLoad } from '../components/ui';
import SubHead from '../components/SubHead';
import { ThemeSettings, useThemePref } from '../theme';
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
  // 로그인 없이 시작한 이 기기 계정(auth/guest.ts). 비밀번호를 모르므로 비밀번호 칸을 보이지 않고 저장해 둔 값을 쓴다.
  const guest = isGuestUser(user);
  const qrDemo = isCurrentDemoUser(user);
  const guestPw = guestPasswordFor(user);
  const nav = useNavigate();
  const toast = useToast();
  const isParent = user?.role === 'PARENT';
  const consents = useLoad(() => api<ConsentRecord[]>('GET', '/me/consents'), []);
  // 동의 기록에 어느 아이의 동의인지 적으려고만 불러온다. 못 불러오면 이름 없이 보여 준다.
  const kids = useLoad(() => (isParent ? api<Child[]>('GET', '/children') : Promise.resolve([] as Child[])), [isParent]);
  const [loggingOut, setLoggingOut] = useState(false);
  const [typedPassword, setPassword] = useState('');
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
      buddy.emit('cheer');
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
    toast(guest ? '처음 화면으로 나왔어요. 다시 시작하면 지금 기록을 이어서 볼 수 있어요.' : '로그아웃했어요.');
    // 시작 화면이 이 기기 계정으로 곧바로 다시 들어가지 않게 알린다.
    nav('/', { replace: true, state: { left: true } });
  }

  async function deleteAccount() {
    const password = guestPw ?? typedPassword;
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
    if (guest) forgetGuest();
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

  const nameLabel = isParent ? '앱에서 부를 이름' : '표시 이름';

  return (
    <div className="settings-page">
      {/* Figma 2판 '설정': 내 정보 · 아이 정보 · 앱 설정 · 이용 안내 · 계정 관리. 행은 테두리 없이 글과 '›'. */}
      <SubHead title="설정" fallback={isParent ? '/p' : '/t'} />
      <h2 className="menu-title">내 정보</h2>
      <div className="card soft row profile-card" style={{ gap: 14 }}>
        <div className="avatar" aria-hidden="true">
          {initial}
        </div>
        <div className="item-body">
          <div className="row wrap" style={{ gap: 8 }}>
            <strong>{user?.displayName}</strong>
            <span className="chip brand">{isParent ? '보호자' : '기관 선생님'}</span>
          </div>
          <p className="muted" style={{ margin: 0 }}>
            {qrDemo ? '이 브라우저에서 만든 체험 계정이에요' : guest ? '이 기기에서만 쓰는 계정이에요' : user?.email}
          </p>
        </div>
      </div>

      {/* 행을 누르면 그 자리에서 펼쳐진다. 닫혀 있어도 내용은 화면에 있어 시연이 찾아서 연다. */}
      <div className="menu-list" aria-label="이름·비밀번호">
        <details className="menu-details">
          <summary className="menu-row" data-demo="account-row-name">
            <Icon name="edit" />
            <h3 className="menu-text" id="account-name-h">
              {nameLabel}
            </h3>
            <span className="menu-chev" aria-hidden="true">
              ›
            </span>
          </summary>
          <form className="menu-body" onSubmit={saveName} noValidate aria-labelledby="account-name-h">
            <Field
              ref={nameRef}
              id="account-name"
              data-demo="account-name"
              label={nameLabel}
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
            <button type="submit" className="btn secondary block" data-demo="account-name-submit" aria-disabled={nameBusy || undefined}>
              {nameBusy ? '저장하는 중…' : '이름 저장'}
            </button>
          </form>
        </details>

        {/* 선생님 홈 이름 아래 '꿈나무 유치원 | 고우반'. */}
        {!isParent && <TeacherProfileRow />}

        {/* 이 기기 계정은 비밀번호를 쓰지 않으므로 바꾸기를 보이지 않는다. */}
        {!guest && !qrDemo && (
        <details className="menu-details">
          <summary className="menu-row" data-demo="account-row-pw">
            <Icon name="lock" />
            <h3 className="menu-text" id="account-pw-h">
              비밀번호 바꾸기
            </h3>
            <span className="menu-chev" aria-hidden="true">
              ›
            </span>
          </summary>
          <form className="menu-body" onSubmit={changePassword} noValidate aria-labelledby="account-pw-h">
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
            <button type="submit" className="btn secondary block" data-demo="account-pw-submit" aria-disabled={pwBusy || undefined}>
              {pwBusy ? '바꾸는 중…' : '비밀번호 바꾸기'}
            </button>
            <p className="field-hint" style={{ margin: '8px 0 0' }}>
              바꾸면 이 기기만 로그인한 채로 두고, 다른 기기에서는 다시 로그인해야 해요.
            </p>
          </form>
        </details>
        )}

      </div>

      {isParent && (
        <>
          <h2 className="menu-title" id="account-children-h">
            아이 정보
          </h2>
          <nav className="menu-list" aria-labelledby="account-children-h">
            <Link to="/p/children" className="menu-row" data-demo="account-child-list">
              <Icon name="user" />
              <span className="menu-text">등록된 아이</span>
              {kids.data && <span className="menu-value">{kids.data.length}명</span>}
              <span className="menu-chev" aria-hidden="true">
                ›
              </span>
            </Link>
            {/* 선생님 연결은 아이마다 한다. 한 명이면 그 아이의 공유 화면, 여럿이면 등록된 아이에서 고른다. */}
            <Link
              to={kids.data && kids.data.length === 1 ? `/p/children/${kids.data[0].id}/share` : '/p/children'}
              className="menu-row"
              data-demo="account-teacher-link"
            >
              <Icon name="consent" />
              <span className="menu-text">선생님 연결 관리</span>
              <span className="menu-chev" aria-hidden="true">
                ›
              </span>
            </Link>
          </nav>
        </>
      )}

      <h2 className="menu-title">앱 설정</h2>
      <div className="menu-list">
        <DarkModeRow />
        <details className="menu-details">
          <summary className="menu-row" data-demo="account-row-theme">
            <Icon name="screen" />
            <h2 className="menu-text" id="theme-settings-h">
              화면 설정
            </h2>
            <span className="menu-chev" aria-hidden="true">
              ›
            </span>
          </summary>
          <div className="menu-body" role="group" aria-labelledby="theme-settings-h">
            <ThemeSettings />
          </div>
        </details>
      </div>

      <h2 className="menu-title">이용 안내</h2>
      <nav className="menu-list" aria-label="이용 안내">
        <Link to="/privacy" className="menu-row">
          <Icon name="info" />
          <span className="menu-text">서비스 소개</span>
          <span className="menu-chev" aria-hidden="true">
            ›
          </span>
        </Link>
        <Link to="/support" className="menu-row">
          <Icon name="info" />
          <span className="menu-text">상담 · 기관 안내</span>
          <span className="menu-chev" aria-hidden="true">
            ›
          </span>
        </Link>
        <Link to="/support/facilities" className="menu-row" data-demo="account-row-facilities">
          <Icon name="info" />
          <span className="menu-text">지역 기관 찾기</span>
          <span className="menu-chev" aria-hidden="true">
            ›
          </span>
        </Link>
        <Link to="/terms" className="menu-row">
          <Icon name="consent" />
          <span className="menu-text">이용약관 · 개인정보 처리 안내</span>
          <span className="menu-chev" aria-hidden="true">
            ›
          </span>
        </Link>
      </nav>

      <h2 className="menu-title">계정 관리</h2>
      <div className="menu-list">
        <details className="menu-details">
          <summary className="menu-row" data-demo="account-row-consents">
            <Icon name="consent" />
            <h2 className="menu-text" id="account-consents-h">
              동의 기록
            </h2>
            <span className="menu-chev" aria-hidden="true">
              ›
            </span>
          </summary>
          <div className="menu-body" role="group" aria-labelledby="account-consents-h">
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
          </div>
        </details>

        <details className="menu-details">
          <summary className="menu-row" data-demo="account-row-export">
            <Icon name="download" />
            <h2 className="menu-text" id="account-export-h">
              내 데이터 내려받기
            </h2>
            <span className="menu-chev" aria-hidden="true">
              ›
            </span>
          </summary>
          <div className="menu-body" role="group" aria-labelledby="account-export-h">
            <p className="muted">
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
          </div>
        </details>
      </div>

      <div className="menu-list" style={{ marginTop: 20 }}>
        <button
          type="button"
          className="menu-row"
          data-demo="account-logout"
          aria-disabled={loggingOut || undefined}
          onClick={() => void doLogout()}
        >
          <Icon name="logout" />
          <span className="menu-text">{loggingOut ? '나가는 중…' : guest ? '처음 화면으로 나가기' : '로그아웃'}</span>
        </button>

        <details className="menu-details">
          <summary className="menu-row" data-demo="account-row-delete">
            <Icon name="leave" />
            <h2 className="menu-text" id="account-delete-h">
              {qrDemo ? '체험 계정 삭제' : '회원 탈퇴'}
            </h2>
            <span className="menu-chev" aria-hidden="true">
              ›
            </span>
          </summary>
          <div className="menu-body" role="group" aria-labelledby="account-delete-h">
            {qrDemo ? <DeleteDemoAccounts /> : <DangerAction
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
              {!guestPw && (
              <DeletePassword
                ref={pwRef}
                value={typedPassword}
                error={pwError}
                onChange={(v) => {
                  setPassword(v);
                  setPwError(null);
                }}
                onClose={resetPassword}
              />
              )}
            </DangerAction>}
          </div>
        </details>
      </div>
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

/** 앱 설정의 '다크 모드' 한 줄(Figma). 화면 설정의 밝기와 같은 값을 바꾼다(켜면 어둡게, 끄면 밝게). */
/** 선생님 기관·반 이름(PUT /me/teacher-profile). 비우고 저장하면 지운다. */
function TeacherProfileRow() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [institution, setInstitution] = useState(user?.institution ?? '');
  const [className, setClassName] = useState(user?.className ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const me = await api<User>('PUT', '/me/teacher-profile', { institution: institution.trim(), className: className.trim() });
      setUser({ ...me, pendingConsents: me.pendingConsents ?? user?.pendingConsents });
      toast('기관·반 이름을 저장했어요.');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="menu-details">
      <summary className="menu-row" data-demo="account-row-class">
        <Icon name="user" />
        <h3 className="menu-text" id="account-class-h">
          기관·반 이름
        </h3>
        <span className="menu-chev" aria-hidden="true">
          ›
        </span>
      </summary>
      <form className="menu-body" onSubmit={save} noValidate aria-labelledby="account-class-h">
        <Field
          id="account-institution"
          label="기관 이름"
          placeholder="예: 꿈나무 유치원"
          type="text"
          maxLength={40}
          value={institution}
          onChange={(e) => setInstitution(e.target.value)}
        />
        <Field
          id="account-class"
          label="반 이름"
          hint="선생님 홈 이름 아래에 보여요. 비우면 지워요."
          placeholder="예: 고우반"
          type="text"
          maxLength={30}
          value={className}
          onChange={(e) => setClassName(e.target.value)}
        />
        <ErrorText error={error} />
        <button type="submit" className="btn secondary block" aria-disabled={busy || undefined}>
          {busy ? '저장하는 중…' : '저장'}
        </button>
      </form>
    </details>
  );
}

function DarkModeRow() {
  const { pref, update, deviceDark } = useThemePref();
  const on = pref.scheme === 'dark' || (pref.scheme === 'system' && deviceDark);
  return (
    <label className="menu-row switch-menu-row">
      <Icon name="screen" />
      <span className="menu-text">다크 모드</span>
      <input
        type="checkbox"
        role="switch"
        checked={on}
        data-demo="account-dark-mode"
        onChange={(e) => update({ scheme: e.target.checked ? 'dark' : 'light' })}
      />
    </label>
  );
}
