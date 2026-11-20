import type { Child, InviteCode, Policies, Role, SaveRecordResponse, TokenResponse } from '../api/types';
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

export class SeedError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export async function demoRequest<T>(token: string | null, method: string, path: string, body?: unknown): Promise<T> {
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
    throw new SeedError(res.status, msg ? `${msg} (${res.status})` : `데모 데이터를 만들지 못했어요. (${res.status})`);
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

export type DemoCredentials = Pick<DemoAccount, 'email' | 'password'>;
export type DemoPair = Record<Role, DemoCredentials>;

function newCredentials(role: Role): DemoCredentials {
  const email = `demo-${role === 'PARENT' ? 'parent' : 'teacher'}-${randomId()}@demo.hamkke.test`;
  return { email, password: randomPassword() };
}

export function newDemoPair(): DemoPair {
  return { PARENT: newCredentials('PARENT'), TEACHER: newCredentials('TEACHER') };
}

async function signup(role: Role, displayName: string, policies: Policies, {email, password}: DemoCredentials): Promise<DemoAccount> {
  const t = await demoRequest<TokenResponse>(null, 'POST', '/auth/signup', {
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

/** 지난 4주 동안 조금씩 늘어난 모습의 예시 기록(오래된 것부터). 기능별 시연 준비(features/session.ts)도 쓴다. */
export const SAMPLE_RECORDS = [
  { daysAgo: 26, analyzed: 150, joint: 57, latency: 3.2, bids: 12, responded: 7, distress: 2 },
  { daysAgo: 19, analyzed: 160, joint: 66, latency: 2.9, bids: 13, responded: 8, distress: 2 },
  { daysAgo: 12, analyzed: 155, joint: 72, latency: 2.6, bids: 12, responded: 8, distress: 1 },
  { daysAgo: 6, analyzed: 170, joint: 88, latency: 2.2, bids: 14, responded: 10, distress: 1 },
  { daysAgo: 2, analyzed: 165, joint: 96, latency: 1.9, bids: 13, responded: 10, distress: 0 },
];

/** 중간에 실패하면 이미 만든 데모 계정을 지우고 오류를 그대로 알린다(계정이 남지 않게). */
export async function createDemo(policies: Policies, onProgress: SeedProgress, pair = newDemoPair()): Promise<DemoData> {
  const made: DemoAccount[] = [];
  try {
    return await seed(policies, onProgress, made, pair);
  } catch (e) {
    await Promise.all(made.map((a) => deleteDemoAccount(a)));
    throw e;
  }
}

async function seed(policies: Policies, onProgress: SeedProgress, made: DemoAccount[], pair: DemoPair): Promise<DemoData> {
  const steps = 7 + SAMPLE_RECORDS.length;
  let done = 0;
  const tick = (label: string) => onProgress(label, ++done / steps);

  const parent = await signup('PARENT', '데모 보호자', policies, pair.PARENT);
  made.push(parent);
  tick('데모 보호자 계정을 만들었어요');

  const child = await demoRequest<Child>(parent.accessToken, 'POST', '/children', {
    nickname: '콩이',
    birthYearMonth: birthMonth(38),
    guardianConsent: { agreed: true, version: policies.guardianVersion },
  });
  tick('법정대리인 동의와 함께 아이를 등록했어요');

  const now = Date.now();
  let cardDeliveryId: number | undefined;
  for (const r of SAMPLE_RECORDS) {
    const result = await demoRequest<SaveRecordResponse>(parent.accessToken, 'POST', `/children/${child.id}/interaction-records`, {
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
    cardDeliveryId = result.coaching.delivery?.id ?? cardDeliveryId;
    tick('지난 기록 예시를 넣었어요');
  }

  await demoRequest(parent.accessToken, 'PUT', `/children/${child.id}/share-settings`, {
    jointPlay: true,
    responseLatency: true,
    distress: false,
    coachingCards: true,
    // AI 관찰 기록 관련 공유는 데모에서 켜지 않는다(AI 동의도 받지 않는다).
    aiObservations: false,
    institutionCapture: false,
  });
  tick('공유할 항목을 골랐어요');

  const code = await demoRequest<InviteCode>(parent.accessToken, 'POST', `/children/${child.id}/invite-codes`);
  tick('선생님 초대 코드를 만들었어요');

  const teacher = await signup('TEACHER', '데모 선생님', policies, pair.TEACHER);
  made.push(teacher);
  await demoRequest(teacher.accessToken, 'PUT', '/me/teacher-profile', { institution: '예시 한빛어린이집', className: '새싹반' });
  await demoRequest(teacher.accessToken, 'POST', '/teacher/links', { code: code.code });
  tick('데모 선생님이 초대 코드로 연결했어요');

  await demoRequest(teacher.accessToken, 'POST', `/children/${child.id}/goals`, {
    title: '놀잇감을 친구에게 건네 보기',
    description: '놀이 시간에 하루 한 번, 먼저 건넬 때까지 잠깐 기다려 주기',
  });
  tick('선생님이 아이 목표를 적었어요');

  const yesterday = new Date(now - 86_400_000);
  const story = await demoRequest<{id: number}>(teacher.accessToken, 'POST', `/children/${child.id}/observations`, {
    title: '콩이가 고른 블록',
    content: '콩이가 노란 블록을 골라 파란 블록 위에 올렸어요. 다음 블록을 고를 때까지 잠깐 기다려 보았어요.',
    cardDeliveryId,
    observedOn: ymd(yesterday),
  });
  await demoRequest(parent.accessToken, 'POST', `/children/${child.id}/messages`, {
    content: '집에서도 콩이가 블록을 골라요. 오늘 올려 주신 코칭을 해 볼게요.', observationId: story.id,
  });
  await demoRequest(teacher.accessToken, 'POST', `/children/${child.id}/messages`, {
    content: '좋아요. 다음 놀이에서도 콩이가 먼저 고르는 블록을 함께 살펴볼게요.', observationId: story.id,
  });
  tick('선생님 이야기와 예시 대화를 준비했어요');

  return { parent, teacher, childId: child.id };
}

/** 데모를 끝낼 때 만든 계정을 지운다(실패해도 데모 종료는 막지 않는다). */
export async function deleteDemoAccount(account: { accessToken: string; refreshToken: string; password: string }) {
  try {
    let token = account.accessToken;
    const del = () => demoRequest(token, 'DELETE', '/me', { password: account.password });
    try {
      await del();
    } catch {
      const t = await demoRequest<TokenResponse>(null, 'POST', '/auth/refresh', { refreshToken: account.refreshToken });
      token = t.accessToken;
      await del();
    }
  } catch {
    /* 이미 지워졌거나 서버에 닿지 못함: 무시 */
  }
}
