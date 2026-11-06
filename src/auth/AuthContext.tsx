import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, getRefreshToken, hasSession, onSessionChange, setSession } from '../api/client';
import type { Policies, TokenResponse, User } from '../api/types';

interface AuthState {
  user: User | null;
  loading: boolean;
  policies: Policies | null;
  login: (t: TokenResponse) => void;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export const FALLBACK_DISCLAIMER =
  '본 서비스는 의료기기가 아니며 발달 상태를 판단하지 않습니다. 걱정되는 점은 전문의와 상담하세요.';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [policies, setPolicies] = useState<Policies | null>(null);

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
    api<Policies>('GET', '/policies').then(setPolicies).catch(() => undefined);
    return onSessionChange(() => {
      if (!hasSession()) setUser(null);
    });
  }, [reload]);

  const login = useCallback((t: TokenResponse) => {
    setSession(t);
    setUser(t.user);
  }, []);

  const logout = useCallback(async () => {
    const token = getRefreshToken();
    if (token) await api('POST', '/auth/logout', { refreshToken: token }).catch(() => undefined);
    setSession(null);
    setUser(null);
  }, []);

  return <Ctx.Provider value={{ user, loading, policies, login, logout, reload }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('AuthProvider missing');
  return v;
}
