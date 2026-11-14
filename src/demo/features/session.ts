import { currentSession, setSession, settleRefresh } from '../../api/client';
import type { Child, InviteCode, Policies, TokenResponse } from '../../api/types';
import { newUuid } from '../../api/uuid';
import { SAMPLE_RECORDS } from '../seed';
import * as netlog from './netlog';
import { ymFromToday, ymdFromToday } from './timing';
import type { AccountKey, DemoAcc, Need, ScenarioData, Services } from './types';

/**
 * 기능별 시연의 준비·정리 관리자. 시나리오마다 필요한 만큼만 시연 계정과 데이터를 만들고(공개 API만 쓴다),
 * 끝나거나 '그만 보기'를 누르면 만든 계정을 모두 지운다(아이·기록은 서버가 계정과 함께 지운다).
 * 만든 계정은 이 탭의 sessionStorage에 적어 두어, 중간에 새로 고침해도 메뉴에서 지울 수 있다.
 * 실제 사용자 계정은 건드리지 않는다: 지우는 것은 여기서 만든 계정(@demo.hamkke.test)뿐이다.
 */

const STORAGE_KEY = 'hj.demo.features';
const BASE = '/api/v1';
export const DEMO_DOMAIN = '@demo.hamkke.test';

interface Pending {
  email: string;
  password: string;
}

export interface Stored {
  parent?: DemoAcc;
  teacher?: DemoAcc;
  extra?: DemoAcc;
  childId?: number;
  /** 화면에서 가입하려고 정해 둔 계정(가입 도중 멈춰도 지울 수 있게 미리 적는다) */
  pending?: Pending[];
}

let stored: Stored = load();
const listeners = new Set<() => void>();

function load(): Stored {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Stored) : {};
  } catch {
    return {};
  }
}

function save() {
  try {
    if (hasLeftovers()) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* 저장소를 쓸 수 없으면 메모리에만 둔다 */
  }
  listeners.forEach((l) => l());
}

export function getStored(): Stored {
  return stored;
}

export function subscribeStored(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function hasLeftovers(s: Stored = stored) {
  return !!(s.parent || s.teacher || s.extra || (s.pending && s.pending.length > 0));
}

/** 이 사용자 id가 시연 계정인지(실제 계정과 구별할 때 쓴다). */
export function isDemoUser(userId: number | undefined, email?: string) {
  if (email && email.endsWith(DEMO_DOMAIN)) return true;
  if (userId === undefined) return false;
  return [stored.parent, stored.teacher, stored.extra].some((a) => a?.userId === userId);
}

// ---------- 요청 ----------

export interface CallResult<T = unknown> {
  id: number;
  status: number;
  data: T;
}

/** 시연이 화면 밖에서 보내는 요청. '서버로 간 내용'에 출처(준비·확인)와 함께 남긴다. 실패해도 던지지 않는다. */
export async function demoCall<T = unknown>(
  source: 'prep' | 'check',
  token: string | null,
  method: string,
  path: string,
  body?: unknown,
): Promise<CallResult<T>> {
  const id = netlog.begin(source, method, path, body);
  try {
    const res = await fetch(BASE + path, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text().catch(() => '');
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : undefined;
    } catch {
      data = undefined;
    }
    netlog.finish(id, res.status, data);
    return { id, status: res.status, data: data as T };
  } catch {
    netlog.finish(id, 'offline');
    return { id, status: 0, data: undefined as T };
  }
}

class PrepError extends Error {}

async function must<T>(token: string | null, method: string, path: string, body?: unknown): Promise<T> {
  const r = await demoCall<T>('prep', token, method, path, body);
  if (r.status >= 200 && r.status < 300) return r.data;
  const msg = (r.data as { message?: string } | undefined)?.message;
  if (r.status === 0) throw new PrepError('기록 서버에 닿지 못했어요. 서버가 켜져 있는지 확인해 주세요.');
  if (r.status === 429) throw new PrepError('잠시 요청이 많았어요. 1분쯤 뒤에 다시 시작해 주세요.');
  throw new PrepError(msg ? `시연을 준비하지 못했어요: ${msg} (${r.status})` : `시연을 준비하지 못했어요. (${r.status})`);
}

function randomHex(bytes = 5) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** 시연 계정 비밀번호: 영문·숫자를 섞은 임의 값(사람이 정한 비밀번호를 쓰지 않는다). */
export function demoPassword() {
  return `Demo${randomHex(4)}a1`;
}

export function demoEmail(kind: string) {
  return `demo-${kind}-${randomHex(5)}${DEMO_DOMAIN}`;
}

async function signup(role: 'PARENT' | 'TEACHER', displayName: string, policies: Policies): Promise<DemoAcc> {
  const email = demoEmail(role === 'PARENT' ? 'parent' : 'teacher');
  const password = demoPassword();
  const t = await must<TokenResponse>(null, 'POST', '/auth/signup', {
    email,
    password,
    displayName,
    role,
    consents: [
      { type: 'TERMS_OF_SERVICE', version: policies.termsVersion },
      { type: 'PRIVACY_POLICY', version: policies.privacyVersion },
    ],
  });
  return { userId: t.user.id, email, password, accessToken: t.accessToken, refreshToken: t.refreshToken };
}

// ---------- 준비 ----------

export type Progress = (label: string) => void;

/**
 * 시나리오가 필요한 것만 만든다. 남아 있던 시연 계정이 있으면 먼저 지운다(시나리오마다 새로 시작).
 * 실패하면 이미 만든 계정을 지우고 오류를 그대로 알린다.
 */
export async function prepare(need: Need, policies: Policies, onProgress: Progress): Promise<ScenarioData> {
  if (hasLeftovers()) {
    onProgress('지난 시연 계정을 지우고 있어요');
    await cleanupAll();
  }
  const data: ScenarioData = {
    aiOn: policies.aiObservationEnabled === true,
    vars: {
      guardianVersion: policies.guardianVersion,
      aiVersion: policies.aiAnalysisVersion ?? '',
      termsVersion: policies.termsVersion,
      privacyVersion: policies.privacyVersion,
    },
  };
  try {
    if (need === 'none') return data;

    onProgress('시연 보호자 계정을 만들고 있어요');
    const parent = await signup('PARENT', '시연 보호자', policies);
    stored = { ...stored, parent };
    save();
    data.parent = parent;
    if (need === 'parent') return data;

    onProgress('법정대리인 동의와 함께 아이를 등록하고 있어요');
    const child = await must<Child>(parent.accessToken, 'POST', '/children', {
      nickname: '콩이',
      birthYearMonth: ymFromToday(38),
      guardianConsent: { agreed: true, version: policies.guardianVersion },
    });
    stored = { ...stored, childId: child.id };
    save();
    data.childId = child.id;

    if (need === 'records' || need === 'linked') {
      onProgress('지난 기록 예시를 넣고 있어요');
      const now = Date.now();
      for (const r of SAMPLE_RECORDS) {
        await must(parent.accessToken, 'POST', `/children/${child.id}/interaction-records`, {
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
      }
    }

    if (need === 'child+teacher' || need === 'linked') {
      onProgress('시연 선생님 계정을 만들고 있어요');
      const teacher = await signup('TEACHER', '시연 선생님', policies);
      stored = { ...stored, teacher };
      save();
      data.teacher = teacher;
    }

    if (need === 'linked' && data.teacher) {
      onProgress('공유 항목을 고르고 선생님을 연결하고 있어요');
      await must(parent.accessToken, 'PUT', `/children/${child.id}/share-settings`, {
        jointPlay: true,
        responseLatency: true,
        distress: false,
        coachingCards: true,
        aiObservations: false,
        institutionCapture: false,
      });
      const code = await must<InviteCode>(parent.accessToken, 'POST', `/children/${child.id}/invite-codes`);
      await must(data.teacher.accessToken, 'POST', '/teacher/links', { code: code.code });
      await must(data.teacher.accessToken, 'POST', `/children/${child.id}/goals`, {
        title: '놀잇감을 친구에게 건네 보기',
        description: '놀이 시간에 하루 한 번, 먼저 건넬 때까지 잠깐 기다려 주기',
      });
      await must(data.teacher.accessToken, 'POST', `/children/${child.id}/observations`, {
        content: '블록 놀이를 하다가 친구에게 블록을 먼저 건넸어요.',
        observedOn: ymdFromToday(-1),
      });
    }
    return data;
  } catch (e) {
    await cleanupAll();
    throw e;
  }
}

// ---------- 정리 ----------

/** 계정 하나를 지운다: 가진 토큰 → 갱신 → 이메일·비밀번호로 로그인 순서로 시도한다. 실패해도 던지지 않는다. */
async function removeAccount(acc: { email: string; password: string; accessToken?: string; refreshToken?: string }) {
  const del = async (token: string) => {
    const r = await demoCall('prep', token, 'DELETE', '/me', { password: acc.password });
    return r.status >= 200 && r.status < 300;
  };
  if (acc.accessToken && (await del(acc.accessToken))) return;
  if (acc.refreshToken) {
    const r = await demoCall<TokenResponse>('prep', null, 'POST', '/auth/refresh', { refreshToken: acc.refreshToken });
    if (r.status === 200 && r.data?.accessToken && (await del(r.data.accessToken))) return;
  }
  const r = await demoCall<TokenResponse>('prep', null, 'POST', '/auth/login', { email: acc.email, password: acc.password });
  if (r.status === 200 && r.data?.accessToken) await del(r.data.accessToken);
}

/** 만든 시연 계정을 모두 지운다(추가 계정 → 선생님 → 보호자 순서). */
export async function cleanupAll() {
  const s = stored;
  stored = {};
  save();
  const list: Array<Pending & Partial<DemoAcc>> = [];
  for (const p of s.pending ?? []) {
    if (![s.extra, s.teacher, s.parent].some((a) => a?.email === p.email)) list.push(p);
  }
  if (s.extra) list.push(s.extra);
  if (s.teacher) list.push(s.teacher);
  if (s.parent) list.push(s.parent);
  for (const a of list) await removeAccount(a);
}

// ---------- 계정 바꾸기(Services) ----------

/** 화면에서 가입할 계정을 미리 적어 둔다(가입 도중 멈춰도 정리할 수 있게). */
export function notePending(p: Pending) {
  stored = { ...stored, pending: [...(stored.pending ?? []), p] };
  save();
}

export function createServices(opts: {
  data: ScenarioData;
  reload: () => Promise<void>;
  currentUserId: () => number | undefined;
}): Services {
  const { data, reload, currentUserId } = opts;

  const accountOf = (k: AccountKey) => data[k];

  /** 지금 로그인한 사람이 어느 시연 계정이면 (회전되었을 수 있는) 토큰을 그 계정에 적는다. */
  async function capture() {
    await settleRefresh();
    const cur = currentSession();
    const uid = currentUserId();
    if (!cur || uid === undefined) return;
    for (const k of ['parent', 'teacher', 'extra'] as AccountKey[]) {
      const a = data[k];
      if (a && a.userId === uid) {
        data[k] = { ...a, ...cur };
        stored = { ...stored, [k]: data[k] };
        save();
      }
    }
  }

  return {
    async switchTo(account) {
      await capture();
      const acc = account ? accountOf(account) : undefined;
      if (account && !acc) throw new Error('이 시연에 그 계정이 준비되어 있지 않아요.');
      setSession(acc ? ({ accessToken: acc.accessToken, refreshToken: acc.refreshToken } as TokenResponse) : null);
      await reload();
    },

    async adopt(account, patch) {
      await settleRefresh();
      const cur = currentSession();
      const uid = currentUserId();
      const prev = data[account];
      if (!cur || uid === undefined) return;
      const next: DemoAcc = {
        userId: uid,
        email: patch?.email ?? prev?.email ?? '',
        password: patch?.password ?? prev?.password ?? '',
        accessToken: cur.accessToken,
        refreshToken: cur.refreshToken,
      };
      data[account] = next;
      stored = { ...stored, [account]: next };
      save();
    },

    async check(account, method, path, body) {
      await capture();
      const token = account ? (accountOf(account)?.accessToken ?? null) : null;
      let r = await demoCall('check', token, method, path, body);
      if (r.status === 401 && account) {
        // 토큰이 오래되었으면 한 번 갱신해서 다시 보낸다.
        const a = accountOf(account);
        if (a) {
          const t = await demoCall<TokenResponse>('check', null, 'POST', '/auth/refresh', { refreshToken: a.refreshToken });
          if (t.status === 200 && t.data?.accessToken) {
            data[account] = { ...a, accessToken: t.data.accessToken, refreshToken: t.data.refreshToken };
            stored = { ...stored, [account]: data[account] };
            save();
            r = await demoCall('check', t.data.accessToken, method, path, body);
          }
        }
      }
      return r;
    },

    forget(account) {
      data[account] = undefined;
      const next = { ...stored };
      delete next[account];
      stored = next;
      save();
    },
  };
}
