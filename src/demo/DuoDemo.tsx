import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { setSession } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import BrandMark from '../components/BrandMark';
import { ErrorText, Loading } from '../components/ui';
import { cleanupAll, getStored, prepare } from './features/session';
import type { ScenarioData } from './features/types';
import './duo.css';

/*
 * /demo/duo — 보호자 화면과 선생님 화면을 나란히 띄워 둘이 주고받는 모습을 한 화면에 담는다(시연 영상용, 개발·시연 빌드에서만).
 * - '시연 준비'가 시연 보호자·아이(콩이)·지난 기록·시연 선생님을 만들고 연결한다(features/session.ts prepare('linked')).
 * - 두 휴대폰은 서로 다른 주소(localhost · 127.0.0.1)로 연다. 브라우저 저장소가 주소마다 따로라 한 화면에 두 계정이 함께 로그인된다.
 *   계정 토큰은 주소의 # 뒤(서버로 가지 않는다)로 넘기고, 받은 화면(/demo/duo/enter)이 곧바로 지운다.
 * - 한쪽에서 보낸 이야기는 몇 초 안에 다른 쪽에 나타나고(talk/talk.ts), 아이 홈·선생님 화면의 배지가 바로 늘어난다.
 */

type Side = 'PARENT' | 'TEACHER';

interface Pane {
  label: string;
  path: (childId: number) => string;
}

const PAGES: Record<Side, Pane[]> = {
  PARENT: [
    { label: '아이 홈', path: (c) => `/p/children/${c}` },
    { label: '이야기', path: (c) => `/p/children/${c}/talk` },
  ],
  TEACHER: [
    { label: '아이 화면', path: (c) => `/t/children/${c}` },
    { label: '이야기', path: (c) => `/t/children/${c}/talk` },
  ],
};

/** 두 휴대폰에 쓸 서로 다른 주소. 같은 컴퓨터의 개발 서버를 이름만 달리 부른다. */
export function duoOrigins(loc: { protocol: string; port: string }) {
  const port = loc.port ? `:${loc.port}` : '';
  return { PARENT: `${loc.protocol}//localhost${port}`, TEACHER: `${loc.protocol}//127.0.0.1${port}` };
}

export function enterUrl(origin: string, tokens: { accessToken: string; refreshToken: string }, to: string, nonce: number) {
  const hash = new URLSearchParams({ a: tokens.accessToken, r: tokens.refreshToken, to, n: String(nonce) });
  return `${origin}/demo/duo/enter#${hash.toString()}`;
}

export default function DuoDemo() {
  const { policies, policiesError, reloadPolicies } = useAuth();
  // 새로 고쳐도(개발 서버가 다시 불러와도) 만들어 둔 시연 계정으로 바로 이어서 보여 준다(prepare가 세션 저장소에 둔다).
  const [data, setData] = useState<ScenarioData | null>(() => {
    const s = getStored();
    return s.parent && s.teacher && s.childId
      ? { parent: s.parent, teacher: s.teacher, childId: s.childId, aiOn: false, vars: {} }
      : null;
  });
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [page, setPage] = useState<Record<Side, number>>({ PARENT: 0, TEACHER: 1 });
  // 같은 화면을 다시 누르면 새로 연다(nonce가 바뀌어 주소가 달라진다).
  const [nonce, setNonce] = useState<Record<Side, number>>({ PARENT: 1, TEACHER: 1 });
  const origins = useMemo(() => duoOrigins(window.location), []);

  async function start() {
    if (!policies || busy) return;
    setBusy(true);
    setError(null);
    try {
      setData(await prepare('linked', policies, setLabel));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function end() {
    setBusy(true);
    try {
      await cleanupAll();
    } finally {
      setData(null);
      setBusy(false);
    }
  }

  const ready = data?.parent && data.teacher && data.childId;

  return (
    <div className="duo">
      <header className="duo-head">
        <div className="duo-brand">
          <BrandMark />
          <div>
            <h1>보호자 ↔ 선생님 함께 보기</h1>
            <p>한쪽에서 이야기를 보내면 몇 초 안에 다른 쪽에 나타나요. 시연 영상은 이 화면을 그대로 녹화하면 돼요.</p>
          </div>
        </div>
        <div className="duo-actions">
          {ready ? (
            <>
              <button type="button" className="btn small secondary" onClick={() => void start()} aria-disabled={busy || undefined}>
                처음부터 다시
              </button>
              <button type="button" className="btn small ghost" onClick={() => void end()} aria-disabled={busy || undefined}>
                시연 계정 지우기
              </button>
            </>
          ) : null}
        </div>
      </header>

      {!ready && (
        <section className="duo-start card">
          {policiesError != null && !policies ? (
            <>
              <ErrorText error={policiesError} />
              <button type="button" className="btn" onClick={reloadPolicies}>
                다시 시도
              </button>
            </>
          ) : busy ? (
            <>
              <Loading />
              <p className="muted">{label || '시연을 준비하고 있어요…'}</p>
            </>
          ) : (
            <>
              <p>
                시연 보호자와 아이(콩이), 지난 4주 기록, 시연 선생님을 만들어 연결해요. 선생님이 목표 하나와 관찰 메모 하나를 남겨 둔
                상태로 시작해요.
              </p>
              <button type="button" className="btn" data-demo="duo-start" onClick={() => void start()} aria-disabled={!policies || undefined}>
                시연 준비하기
              </button>
              {error != null && <ErrorText error={error} />}
            </>
          )}
        </section>
      )}

      {ready && data.parent && data.teacher && data.childId && (
        <div className="duo-phones">
          {(['PARENT', 'TEACHER'] as const).map((side) => {
            const acc = side === 'PARENT' ? data.parent! : data.teacher!;
            const pane = PAGES[side][page[side]];
            return (
              <section key={side} className="duo-col" aria-label={side === 'PARENT' ? '보호자 휴대폰' : '선생님 휴대폰'}>
                <div className="duo-col-head">
                  <span className={`duo-who ${side === 'PARENT' ? 'parent' : 'teacher'}`}>
                    {side === 'PARENT' ? '보호자' : '선생님'}
                  </span>
                  <div className="tabs duo-tabs" role="group" aria-label="처음 열 화면">
                    {PAGES[side].map((p, i) => (
                      <button
                        key={p.label}
                        type="button"
                        aria-pressed={page[side] === i}
                        onClick={() => {
                          setPage((s) => ({ ...s, [side]: i }));
                          setNonce((n) => ({ ...n, [side]: n[side] + 1 }));
                        }}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="duo-phone">
                  <iframe
                    key={`${side}-${nonce[side]}`}
                    title={side === 'PARENT' ? '보호자 화면' : '선생님 화면'}
                    src={enterUrl(origins[side], acc, pane.path(data.childId!), nonce[side])}
                  />
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * /demo/duo/enter#a=…&r=…&to=… — 함께 보기의 한쪽 휴대폰. 주소의 # 뒤에 받은 계정으로 들어가고 #을 곧바로 지운 뒤 to로 간다.
 * 시연 빌드에서만 있는 경로다.
 */
export function DuoEnter() {
  const { reload } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const p = new URLSearchParams(loc.hash.replace(/^#/, ''));
    const a = p.get('a');
    const r = p.get('r');
    const to = p.get('to') ?? '/';
    window.history.replaceState(null, '', loc.pathname); // 토큰이 주소에 남지 않게
    if (!a || !r || !to.startsWith('/')) {
      nav('/', { replace: true });
      return;
    }
    setSession({ accessToken: a, refreshToken: r, accessTokenExpiresIn: 0, user: { id: 0, email: '', displayName: '', role: 'PARENT' } });
    void reload().then(() => nav(to, { replace: true }));
  }, [loc, nav, reload]);
  return <Loading />;
}
