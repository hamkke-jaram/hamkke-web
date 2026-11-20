import { api, ApiError } from '../api/client';
import type { Policies, Role, TokenResponse, User } from '../api/types';
import { newUuid } from '../api/uuid';
import { SAMPLE_RECORDS } from '../demo/seed';

/*
 * 로그인 없이 바로 시작하기(MVP). QR로 들어온 사람이 이메일·비밀번호를 만들지 않고 바로 쓰게 한다.
 * - 처음: 이 기기에서만 쓰는 계정을 공개 API(/auth/signup)로 만든다. 이메일·비밀번호는 무작위로 만들고
 *   이 기기(localStorage)에만 둔다. 약관·개인정보 처리 방침 동의는 시작 화면의 안내를 보고 '시작하기'를 누른 것으로 보낸다.
 * - 다음에: 세션이 끝났어도(로그아웃·토큰 만료) 저장해 둔 값으로 다시 로그인해 같은 기록을 이어 본다.
 * - 이 기기의 브라우저 저장소를 지우면 그 계정에는 다시 들어갈 수 없다(시작 화면에 알린다).
 * 백엔드에 따로 기능을 두지 않는다(데모 계정 만들기 demo/seed.ts와 같은 방식).
 */

const KEY = 'hj.guest';
/** 기기 계정의 이메일 끝. 이 끝으로 끝나면 화면에서 이메일 대신 '이 기기 계정'으로 보여 준다. */
export const GUEST_EMAIL_DOMAIN = '@guest.hamkke.test';

export interface GuestCredentials {
  role: Role;
  email: string;
  password: string;
}

function randomHex(bytes: number) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function readGuest(): GuestCredentials | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const g = JSON.parse(raw) as Partial<GuestCredentials> | null;
    if (!g || typeof g.email !== 'string' || typeof g.password !== 'string') return null;
    if (g.role !== 'PARENT' && g.role !== 'TEACHER') return null;
    return { role: g.role, email: g.email, password: g.password };
  } catch {
    return null;
  }
}

function saveGuest(g: GuestCredentials | null) {
  try {
    if (g) localStorage.setItem(KEY, JSON.stringify(g));
    else localStorage.removeItem(KEY);
  } catch {
    /* 저장할 수 없으면 이번 방문에만 쓴다 */
  }
}

/** 탈퇴했을 때처럼 이 기기 계정을 잊는다. */
export function forgetGuest() {
  saveGuest(null);
}

export function isGuestUser(user: Pick<User, 'email'> | null | undefined): boolean {
  return !!user && user.email.endsWith(GUEST_EMAIL_DOMAIN);
}

/** 탈퇴처럼 비밀번호가 필요한 곳에서 쓴다. 지금 로그인한 기기 계정의 것만 돌려준다. */
export function guestPasswordFor(user: Pick<User, 'email'> | null | undefined): string | null {
  const g = readGuest();
  return g && user && g.email === user.email ? g.password : null;
}

export function newGuestCredentials(role: Role): GuestCredentials {
  return {
    role,
    email: `${role === 'PARENT' ? 'p' : 't'}-${randomHex(8)}${GUEST_EMAIL_DOMAIN}`,
    // 서버 규칙(영문·숫자 섞어 8자 이상)을 넉넉히 넘긴다.
    password: `Hj-${randomHex(12)}-9a`,
  };
}

const DEFAULT_NAME: Record<Role, string> = { PARENT: '보호자', TEACHER: '선생님' };

export interface GuestStart {
  tokens: TokenResponse;
  /** 이번에 계정을 새로 만들었는지(처음 온 사람). */
  created: boolean;
}

/** 이 기기 계정으로 다시 들어간다. 저장된 계정이 없거나 서버에서 사라졌으면 null. */
export async function resumeGuest(): Promise<TokenResponse | null> {
  const g = readGuest();
  if (!g) return null;
  try {
    return await api<TokenResponse>('POST', '/auth/login', { email: g.email, password: g.password });
  } catch (e) {
    // 계정이 지워졌거나(탈퇴·서버 초기화) 비밀번호가 맞지 않으면 잊는다. 연결 문제면 그대로 둔다.
    if (e instanceof ApiError && (e.status === 401 || e.status === 404)) saveGuest(null);
    throw e;
  }
}

/**
 * '시작하기'. 이 기기 계정이 있고 역할이 같으면 다시 들어가고, 없으면 새로 만든다.
 * 다른 역할로 시작하면 새 계정을 만든다(전에 쓰던 계정은 서버에 남고 이 기기에서는 잊는다).
 */
export async function startAsGuest(role: Role, policies: Policies): Promise<GuestStart> {
  const g = readGuest();
  if (g && g.role === role) {
    try {
      const tokens = await resumeGuest();
      if (tokens) return { tokens, created: false };
    } catch (e) {
      // 계정이 사라진 경우만 새로 만든다. 연결 문제는 그대로 알린다.
      if (!(e instanceof ApiError && (e.status === 401 || e.status === 404))) throw e;
    }
  }
  const fresh = newGuestCredentials(role);
  const tokens = await api<TokenResponse>('POST', '/auth/signup', {
    email: fresh.email,
    password: fresh.password,
    displayName: DEFAULT_NAME[role],
    role,
    consents: [
      { type: 'TERMS_OF_SERVICE', version: policies.termsVersion },
      { type: 'PRIVACY_POLICY', version: policies.privacyVersion },
    ],
  });
  saveGuest(fresh);
  return { tokens, created: true };
}

/* ───── 바로 테스트(MVP 시연·내부 시험) ─────
 * 시작 화면을 누르지 않아도 보호자 계정 + 예시 아이(콩이) + 지난 4주 예시 기록을 만들어 아이 홈을 바로 연다.
 * 개발 서버이거나 VITE_INSTANT_TEST=true로 빌드했을 때만 켜진다. 운영 빌드의 기본값은 꺼짐(시작 버튼을 보여 준다).
 * 법정대리인 동의는 예시 아이(시험 데이터)에 한해 자동으로 보낸다. 예시 기록은 modelVersion 'demo-sample-data'로 표시한다.
 */
export const INSTANT_TEST = import.meta.env.DEV || import.meta.env.VITE_INSTANT_TEST === 'true';

export const SAMPLE_CHILD_NICKNAME = '콩이';

function birthMonth(monthsAgo: number) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - monthsAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * 로그인한 보호자에게 예시 아이와 기록을 넣는다. 이미 아이가 있으면 그 첫 아이를 돌려준다(두 번 넣지 않는다).
 * onProgress: 0~1.
 */
export async function seedSampleChild(policies: Policies, onProgress?: (ratio: number) => void): Promise<number> {
  const existing = await api<Array<{ id: number }>>('GET', '/children');
  if (existing.length > 0) return existing[0].id;
  const child = await api<{ id: number }>('POST', '/children', {
    nickname: SAMPLE_CHILD_NICKNAME,
    birthYearMonth: birthMonth(38),
    guardianConsent: { agreed: true, version: policies.guardianVersion },
  });
  const now = Date.now();
  const total = SAMPLE_RECORDS.length;
  for (let i = 0; i < total; i++) {
    const r = SAMPLE_RECORDS[i];
    await api('POST', `/children/${child.id}/interaction-records`, {
      clientRecordId: newUuid(),
      recordedAt: new Date(now - r.daysAgo * 86_400_000).toISOString(),
      analyzedSeconds: r.analyzed,
      jointPlaySeconds: r.joint,
      responseLatencySec: r.latency,
      childBidCount: r.bids,
      respondedBidCount: r.responded,
      distressEpisodeCount: r.distress,
      modelVersion: 'demo-sample-data',
      specVersion: 'metrics-v1',
    });
    onProgress?.((i + 1) / total);
  }
  return child.id;
}
