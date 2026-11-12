import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { currentSession, setSession, settleRefresh } from '../api/client';
import type { TokenResponse } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { deleteDemoAccount, type DemoAccount, type DemoData } from './seed';
import { DEMO_STEPS, type DemoRole } from './steps';

/**
 * 전체 흐름 보기(시연 모드). 개발 서버이거나 VITE_DEMO_MODE=true로 빌드했을 때만 켜진다.
 * 데모 진행 상태는 이 탭의 sessionStorage에 둔다. 로그인 토큰은 앱 전체가 쓰는 localStorage에 있으므로
 * 데모 중에는 같은 브라우저의 다른 탭도 데모 계정으로 보인다.
 */
export const DEMO_ENABLED = import.meta.env.DEV || import.meta.env.VITE_DEMO_MODE === 'true';

const STORAGE_KEY = 'hj.demo';

interface Stored {
  data: DemoData;
  step: number;
  role: DemoRole;
}

interface DemoState {
  active: boolean;
  step: number;
  total: number;
  switching: boolean;
  /** 지금 로그인한 계정이 이 단계의 데모 계정이 아님(다른 탭에서 로그인·로그아웃 등) */
  mismatch: boolean;
  start: (data: DemoData) => Promise<void>;
  goTo: (step: number) => Promise<void>;
  /** 이 단계의 데모 계정으로 다시 로그인해 이어 간다(mismatch일 때). */
  resume: () => Promise<void>;
  end: (opts?: { navigate?: boolean }) => Promise<void>;
}

const Ctx = createContext<DemoState | null>(null);

function load(): Stored | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

function save(s: Stored | null) {
  try {
    if (s) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* 저장소를 쓸 수 없으면 메모리에만 둔다 */
  }
}

function accountOf(data: DemoData, role: DemoRole): DemoAccount | null {
  if (role === 'PARENT') return data.parent;
  if (role === 'TEACHER') return data.teacher;
  return null;
}

function pathOf(step: number, data: DemoData) {
  return DEMO_STEPS[step].path.replace(':id', String(data.childId));
}

export function DemoProvider({ children }: { children: ReactNode }) {
  const nav = useNavigate();
  const { user, loading, reload } = useAuth();
  const [stored, setStored] = useState<Stored | null>(() => (DEMO_ENABLED ? load() : null));
  const [switching, setSwitching] = useState(false);
  const ref = useRef(stored);
  ref.current = stored;
  const userRef = useRef(user);
  userRef.current = user;

  const commit = useCallback((s: Stored | null) => {
    ref.current = s;
    setStored(s);
    save(s);
  }, []);

  /**
   * 지금 계정의 (회전되었을 수 있는) 토큰을 데모 데이터에 다시 적는다.
   * 진행 중인 토큰 갱신을 먼저 기다리고, 지금 로그인한 사람이 그 데모 계정일 때만 적는다
   * (다른 탭에서 바뀐 실제 계정 토큰을 데모 데이터에 넣지 않기 위해서).
   */
  const captureActive = useCallback(async (s: Stored): Promise<DemoData> => {
    await settleRefresh();
    const cur = currentSession();
    const acc = accountOf(s.data, s.role);
    if (!cur || !acc || userRef.current?.id !== acc.userId) return s.data;
    const updated = { ...acc, ...cur };
    return s.role === 'PARENT' ? { ...s.data, parent: updated } : { ...s.data, teacher: updated };
  }, []);

  /** 단계 상태를 먼저 저장한 뒤 토큰을 바꾼다(그 사이 새로고침돼도 상태와 토큰이 어긋나지 않게). */
  const enter = useCallback(
    async (data: DemoData, step: number) => {
      const role = DEMO_STEPS[step].role;
      commit({ data, step, role });
      const acc = accountOf(data, role);
      setSession(acc ? ({ accessToken: acc.accessToken, refreshToken: acc.refreshToken } as TokenResponse) : null);
      await reload();
      nav(pathOf(step, data));
      window.scrollTo({ top: 0 });
    },
    [commit, nav, reload],
  );

  const goTo = useCallback(
    async (step: number) => {
      const s = ref.current;
      if (!s) return;
      const index = Math.max(0, Math.min(DEMO_STEPS.length - 1, step));
      setSwitching(true);
      try {
        if (DEMO_STEPS[index].role === s.role && userRef.current?.id === accountOf(s.data, s.role)?.userId) {
          commit({ ...s, step: index });
          nav(pathOf(index, s.data));
          window.scrollTo({ top: 0 });
        } else {
          await enter(await captureActive(s), index);
        }
      } finally {
        setSwitching(false);
      }
    },
    [captureActive, commit, enter, nav],
  );

  const resume = useCallback(async () => {
    const s = ref.current;
    if (!s) return;
    setSwitching(true);
    try {
      await enter(s.data, s.step);
    } finally {
      setSwitching(false);
    }
  }, [enter]);

  const start = useCallback(
    async (data: DemoData) => {
      setSwitching(true);
      try {
        await enter(data, 0);
      } finally {
        setSwitching(false);
      }
    },
    [enter],
  );

  const end = useCallback(
    async (opts?: { navigate?: boolean }) => {
      const s = ref.current;
      if (!s) return;
      setSwitching(true);
      try {
        // 먼저 데모 상태와 로그인을 정리한다. 계정 삭제가 중간에 끊겨도(새로고침 등) 데모에 갇히지 않게 하려는 순서다.
        const data = await captureActive(s);
        commit(null);
        // 지금 로그인한 사람이 데모 계정일 때만 로그아웃한다(다른 탭에서 로그인한 실제 계정은 건드리지 않는다).
        const me = userRef.current?.id;
        if (me === undefined || me === data.parent.userId || me === data.teacher.userId) {
          setSession(null);
          await reload();
        }
        if (opts?.navigate !== false) nav('/', { replace: true });
        await Promise.all([deleteDemoAccount(data.teacher), deleteDemoAccount(data.parent)]);
      } finally {
        setSwitching(false);
      }
    },
    [captureActive, commit, nav, reload],
  );

  const active = stored !== null;
  const expected = stored ? accountOf(stored.data, stored.role) : null;
  const mismatch = active && !loading && !switching && (!user || user.id !== expected?.userId);

  // 시연 중에는 아래 안내 패널에 화면이 가리지 않도록 여백을 둔다(높이는 DemoTour가 잰다).
  useEffect(() => {
    document.body.classList.toggle('demo-on', active);
    return () => document.body.classList.remove('demo-on');
  }, [active]);

  return (
    <Ctx.Provider
      value={{ active, step: stored?.step ?? 0, total: DEMO_STEPS.length, switching, mismatch, start, goTo, resume, end }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useDemo() {
  const v = useContext(Ctx);
  if (!v) throw new Error('DemoProvider missing');
  return v;
}
