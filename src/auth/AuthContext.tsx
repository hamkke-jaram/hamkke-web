import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, getRefreshToken, hasSession, onSessionChange, setSession } from '../api/client';
import type { Policies, TokenResponse, User } from '../api/types';

interface AuthState {
  user: User | null;
  loading: boolean;
  policies: Policies | null;
  /** 약관·고지 정보를 여러 번 시도해도 못 불러왔을 때의 오류. 불러오면 다시 null. */
  policiesError: unknown;
  /** 약관·고지 정보를 다시 불러온다(화면의 '다시 시도' 버튼용). */
  reloadPolicies: () => void;
  /** 로그인·가입·비밀번호 변경으로 받은 새 토큰을 쓰고, 다시 동의할 약관이 있는지 /me로 확인한다. */
  login: (t: TokenResponse) => void;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
  /** 표시 이름 수정처럼 서버가 돌려준 새 사용자 정보로 바꾼다. */
  setUser: (u: User) => void;
}

const Ctx = createContext<AuthState | null>(null);

export const FALLBACK_DISCLAIMER =
  '본 서비스는 의료기기가 아니며 발달 상태를 판단하지 않습니다. 걱정되는 점은 전문의와 상담하세요.';

/** /policies 재시도 간격(ms). 처음 시도 + 이 횟수만큼 더 시도한 뒤 오류를 알린다. */
const POLICY_RETRY_DELAYS = [1000, 2000, 4000];
/** 오류를 알린 뒤에도 화면이 멈춰 있지 않도록 이 간격으로 조용히 다시 시도한다. */
const POLICY_BACKGROUND_RETRY_MS = 30000;

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [policies, setPolicies] = useState<Policies | null>(null);
  const [policiesError, setPoliciesError] = useState<unknown>(null);
  const policyRun = useRef(0);
  /** 다른 탭을 따라 받는 사용자 정보 회차. 그 사이 로그인·로그아웃하면 늦게 온 응답을 버린다. */
  const userSync = useRef(0);

  /**
   * 약관·고지 정보를 불러온다. 실패하면 간격을 늘려 가며 몇 번 더 시도하고, 그래도 안 되면 policiesError를 채운다.
   * quiet이면 이미 보이는 오류 안내를 지우지 않는다(백그라운드 재시도).
   */
  const loadPolicies = useCallback(async (quiet = false) => {
    const run = ++policyRun.current;
    if (!quiet) setPoliciesError(null);
    for (let attempt = 0; ; attempt++) {
      try {
        const p = await api<Policies>('GET', '/policies');
        if (run !== policyRun.current) return;
        setPolicies(p);
        setPoliciesError(null);
        return;
      } catch (e) {
        if (run !== policyRun.current) return;
        if (attempt >= POLICY_RETRY_DELAYS.length) {
          setPoliciesError(e);
          return;
        }
        await wait(POLICY_RETRY_DELAYS[attempt]);
        if (run !== policyRun.current) return;
      }
    }
  }, []);

  const reloadPolicies = useCallback(() => {
    void loadPolicies();
  }, [loadPolicies]);

  const reload = useCallback(async () => {
    if (!hasSession()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      setUser(await api<User>('GET', '/me'));
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    return onSessionChange((fromOtherTab) => {
      if (!hasSession()) {
        userSync.current++;
        setUser(null);
        return;
      }
      // 다른 탭에서 로그인했거나 다른 계정으로 바뀌었을 수 있다. 사용자 정보를 다시 받는다.
      // 실패해도 지금 화면은 그대로 둔다(세션이 정말 끝났으면 client가 세션을 지워 위의 분기로 온다).
      if (fromOtherTab) {
        const run = ++userSync.current;
        void api<User>('GET', '/me')
          .then((me) => {
            if (run === userSync.current && hasSession()) setUser(me);
          })
          .catch(() => undefined);
      }
    });
  }, [reload]);

  useEffect(() => {
    void loadPolicies();
    return () => {
      policyRun.current++; // 진행 중인 시도를 멈춘다
    };
  }, [loadPolicies]);

  // 여러 번 실패한 뒤에도 연결이 돌아오면(또는 일정 시간이 지나면) 조용히 다시 시도한다.
  // 그래서 policies가 null인 동안 로딩만 보여 주는 화면도 결국 풀린다.
  useEffect(() => {
    if (policies || !policiesError) return;
    const retry = () => void loadPolicies(true);
    const timer = setTimeout(retry, POLICY_BACKGROUND_RETRY_MS);
    window.addEventListener('online', retry);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('online', retry);
    };
  }, [policies, policiesError, loadPolicies]);

  const login = useCallback(
    (t: TokenResponse) => {
      userSync.current++;
      setSession(t);
      // 로그인 응답에는 다시 동의할 약관 목록(pendingConsents)이 없을 수 있다. 앞서 알던 목록을 이어 두고 /me로 확인한다.
      setUser((prev) => ({ ...t.user, pendingConsents: t.user.pendingConsents ?? (prev?.id === t.user.id ? prev.pendingConsents : undefined) }));
      void api<User>('GET', '/me')
        .then((me) => setUser((cur) => (cur && cur.id === me.id ? me : cur)))
        .catch(() => undefined);
    },
    [],
  );

  const logout = useCallback(async () => {
    const token = getRefreshToken();
    if (token) await api('POST', '/auth/logout', { refreshToken: token }).catch(() => undefined);
    setSession(null);
    setUser(null);
  }, []);

  return <Ctx.Provider value={{ user, loading, policies, policiesError, reloadPolicies, login, logout, reload, setUser }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('AuthProvider missing');
  return v;
}
