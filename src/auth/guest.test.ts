import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Policies } from '../api/types';
import { GUEST_EMAIL_DOMAIN, guestPasswordFor, isGuestUser, newGuestCredentials, readGuest, resumeGuest, startAsGuest } from './guest';

/* 로그인 없이 시작하기(auth/guest.ts). fetch와 localStorage만 가짜로 바꾼다. */

const POLICIES: Policies = {
  termsVersion: 't-1',
  privacyVersion: 'p-1',
  guardianVersion: 'g-1',
  disclaimer: '',
  aiAnalysisVersion: 'a-1',
  aiObservationEnabled: false,
};

interface Call {
  path: string;
  body: Record<string, unknown>;
}

let calls: Call[] = [];
let store: Map<string, string>;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function tokens(email: string, role = 'PARENT') {
  return { accessToken: 'acc', refreshToken: 'ref', accessTokenExpiresIn: 1800, user: { id: 7, email, displayName: '보호자', role } };
}

function mockServer(handler: (c: Call) => Response) {
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    const c = { path: url.replace('/api/v1', ''), body: init.body ? JSON.parse(String(init.body)) : {} };
    calls.push(c);
    return handler(c);
  });
}

beforeEach(() => {
  calls = [];
  store = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('로그인 없이 시작하기(guest)', () => {
  it('처음이면 무작위 이메일·비밀번호로 계정을 만들고 약관·개인정보 동의 버전을 함께 보낸 뒤 이 기기에 둔다', async () => {
    mockServer((c) => json(201, tokens(String(c.body.email))));
    const r = await startAsGuest('PARENT', POLICIES);
    expect(r.created).toBe(true);
    expect(calls.map((c) => c.path)).toEqual(['/auth/signup']);
    const body = calls[0].body;
    expect(String(body.email).endsWith(GUEST_EMAIL_DOMAIN)).toBe(true);
    expect(body.role).toBe('PARENT');
    expect(body.consents).toEqual([
      { type: 'TERMS_OF_SERVICE', version: 't-1' },
      { type: 'PRIVACY_POLICY', version: 'p-1' },
    ]);
    // 서버 규칙: 영문·숫자를 섞은 8자 이상
    expect(String(body.password)).toMatch(/^(?=.*[A-Za-z])(?=.*\d).{8,}$/);
    expect(readGuest()).toMatchObject({ role: 'PARENT', email: body.email, password: body.password });
  });

  it('다음에는 같은 계정으로 다시 들어간다(새로 만들지 않는다)', async () => {
    const g = newGuestCredentials('PARENT');
    store.set('hj.guest', JSON.stringify(g));
    mockServer((c) => json(200, tokens(String(c.body.email))));
    const r = await startAsGuest('PARENT', POLICIES);
    expect(r.created).toBe(false);
    expect(calls).toEqual([{ path: '/auth/login', body: { email: g.email, password: g.password } }]);
  });

  it('서버에서 계정이 사라졌으면(401) 잊고 새로 만든다', async () => {
    store.set('hj.guest', JSON.stringify(newGuestCredentials('PARENT')));
    mockServer((c) =>
      c.path === '/auth/login' ? json(401, { code: 'INVALID_CREDENTIALS', message: '맞지 않아요' }) : json(201, tokens(String(c.body.email))),
    );
    const r = await startAsGuest('PARENT', POLICIES);
    expect(r.created).toBe(true);
    expect(calls.map((c) => c.path)).toEqual(['/auth/login', '/auth/signup']);
  });

  it('연결 문제(5xx)면 계정을 잊지 않고 오류를 그대로 알린다', async () => {
    const g = newGuestCredentials('PARENT');
    store.set('hj.guest', JSON.stringify(g));
    mockServer(() => json(503, { code: 'UNAVAILABLE', message: '점검 중' }));
    await expect(startAsGuest('PARENT', POLICIES)).rejects.toThrow();
    expect(readGuest()?.email).toBe(g.email);
    expect(calls.map((c) => c.path)).toEqual(['/auth/login']);
  });

  it('다른 역할로 시작하면 새 계정을 만든다', async () => {
    store.set('hj.guest', JSON.stringify(newGuestCredentials('PARENT')));
    mockServer((c) => json(201, tokens(String(c.body.email), 'TEACHER')));
    const r = await startAsGuest('TEACHER', POLICIES);
    expect(r.created).toBe(true);
    expect(calls[0].body.role).toBe('TEACHER');
    expect(readGuest()?.role).toBe('TEACHER');
  });

  it('저장된 계정이 없으면 이어 열기는 아무것도 하지 않는다', async () => {
    mockServer(() => json(500, {}));
    expect(await resumeGuest()).toBeNull();
    expect(calls).toEqual([]);
  });

  it('이 기기 계정인지 알아보고, 탈퇴에 쓸 비밀번호는 지금 로그인한 그 계정 것만 준다', () => {
    const g = newGuestCredentials('PARENT');
    store.set('hj.guest', JSON.stringify(g));
    expect(isGuestUser({ email: g.email })).toBe(true);
    expect(isGuestUser({ email: 'a@example.com' })).toBe(false);
    expect(guestPasswordFor({ email: g.email })).toBe(g.password);
    expect(guestPasswordFor({ email: 'a@example.com' })).toBeNull();
  });
});
