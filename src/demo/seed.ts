import type { Child, InviteCode, Policies, TokenResponse } from '../api/types';
import { newUuid } from '../api/uuid';

/**
 * 시연용 데이터 만들기. 공개 API만 쓴다(백엔드에 데모 전용 기능을 두지 않는다).
 * 만드는 것: 데모 보호자·아이(법정대리인 동의 포함)·지난 4주 예시 기록·공유 설정·초대 코드·데모 선생님(연결)·목표·관찰 메모.
 * 예시 기록은 영상 없이 넣은 숫자라 modelVersion을 'demo-sample-data'로 표시한다.
 */

export interface DemoAccount {
  /** 이 데모 계정의 사용자 id. 지금 로그인한 사람이 데모 계정인지 대조할 때 쓴다. */
  userId: number;
  email: string;
  password: string;
  accessToken: string;
  refreshToken: string;
}

export interface DemoData {
  parent: DemoAccount;
  teacher: DemoAccount;
  childId: number;
}

export type SeedProgress = (label: string, ratio: number) => void;

const BASE = '/api/v1';

class SeedError extends Error {}

async function call<T>(token: string | null, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = undefined;
  }
  if (!res.ok) {
    const msg = (data as { message?: string } | undefined)?.message;
    throw new SeedError(msg ? `${msg} (${res.status})` : `데모 데이터를 만들지 못했어요. (${res.status})`);
  }
  return data as T;
}

function randomId() {
  const a = new Uint8Array(6);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

function randomPassword() {
  return `Demo-${randomId()}-${randomId()}!`;
}

function ymd(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function birthMonth(monthsAgo: number) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - monthsAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function signup(role: 'PARENT' | 'TEACHER', displayName: string, policies: Policies): Promise<DemoAccount> {
  const email = `demo-${role === 'PARENT' ? 'parent' : 'teacher'}-${randomId()}@demo.hamkke.test`;
  const password = randomPassword();
  const t = await call<TokenResponse>(null, 'POST', '/auth/signup', {
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

/** 지난 4주 동안 조금씩 늘어난 모습의 예시 기록(오래된 것부터). */
const SAMPLE_RECORDS = [
  { daysAgo: 26, analyzed: 150, joint: 57, latency: 3.2, bids: 12, responded: 7, distress: 2 },
  { daysAgo: 19, analyzed: 160, joint: 66, latency: 2.9, bids: 13, responded: 8, distress: 2 },
  { daysAgo: 12, analyzed: 155, joint: 72, latency: 2.6, bids: 12, responded: 8, distress: 1 },
  { daysAgo: 6, analyzed: 170, joint: 88, latency: 2.2, bids: 14, responded: 10, distress: 1 },
  { daysAgo: 2, analyzed: 165, joint: 96, latency: 1.9, bids: 13, responded: 10, distress: 0 },
];

/** 중간에 실패하면 이미 만든 데모 계정을 지우고 오류를 그대로 알린다(계정이 남지 않게). */
export async function createDemo(policies: Policies, onProgress: SeedProgress): Promise<DemoData> {
  const made: DemoAccount[] = [];
  try {
    return await seed(policies, onProgress, made);
  } catch (e) {
    await Promise.all(made.map((a) => deleteDemoAccount(a)));
    throw e;
  }
}

async function seed(policies: Policies, onProgress: SeedProgress, made: DemoAccount[]): Promise<DemoData> {
  const steps = 7 + SAMPLE_RECORDS.length;
  let done = 0;
  const tick = (label: string) => onProgress(label, ++done / steps);

  const parent = await signup('PARENT', '데모 보호자', policies);
  made.push(parent);
  tick('데모 보호자 계정을 만들었어요');

  const child = await call<Child>(parent.accessToken, 'POST', '/children', {
    nickname: '콩이',
    birthYearMonth: birthMonth(38),
    guardianConsent: { agreed: true, version: policies.guardianVersion },
  });
  tick('법정대리인 동의와 함께 아이를 등록했어요');

  const now = Date.now();
  for (const r of SAMPLE_RECORDS) {
    await call(parent.accessToken, 'POST', `/children/${child.id}/interaction-records`, {
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
    tick('지난 기록 예시를 넣었어요');
  }

  await call(parent.accessToken, 'PUT', `/children/${child.id}/share-settings`, {
    jointPlay: true,
    responseLatency: true,
    distress: false,
    coachingCards: true,
    // AI 관찰 기록 관련 공유는 데모에서 켜지 않는다(AI 동의도 받지 않는다).
    aiObservations: false,
    institutionCapture: false,
  });
  tick('공유할 항목을 골랐어요');

  const code = await call<InviteCode>(parent.accessToken, 'POST', `/children/${child.id}/invite-codes`);
  tick('선생님 초대 코드를 만들었어요');

  const teacher = await signup('TEACHER', '데모 선생님', policies);
  made.push(teacher);
  await call(teacher.accessToken, 'POST', '/teacher/links', { code: code.code });
  tick('데모 선생님이 초대 코드로 연결했어요');

  await call(teacher.accessToken, 'POST', `/children/${child.id}/goals`, {
    title: '놀잇감을 친구에게 건네 보기',
    description: '놀이 시간에 하루 한 번, 먼저 건넬 때까지 잠깐 기다려 주기',
  });
  tick('선생님이 아이 목표를 적었어요');

  const yesterday = new Date(now - 86_400_000);
  await call(teacher.accessToken, 'POST', `/children/${child.id}/observations`, {
    content: '블록 놀이를 하다가 친구에게 블록을 먼저 건넸어요. 친구와 눈을 맞추고 웃는 시간도 길어졌어요.',
    observedOn: ymd(yesterday),
  });
  tick('선생님이 관찰 메모를 남겼어요');

  return { parent, teacher, childId: child.id };
}

/** 데모를 끝낼 때 만든 계정을 지운다(실패해도 데모 종료는 막지 않는다). */
export async function deleteDemoAccount(account: { accessToken: string; refreshToken: string; password: string }) {
  try {
    let token = account.accessToken;
    const del = () => call(token, 'DELETE', '/me', { password: account.password });
    try {
      await del();
    } catch {
      const t = await call<TokenResponse>(null, 'POST', '/auth/refresh', { refreshToken: account.refreshToken });
      token = t.accessToken;
      await del();
    }
  } catch {
    /* 이미 지워졌거나 서버에 닿지 못함: 무시 */
  }
}
