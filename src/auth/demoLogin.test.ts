import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import type { Policies, Role } from '../api/types';
import { deleteCurrentDemoWorkspace, hasDemoConsent, isDemoWorkspaceChild, prepareDemoLogin, publishedDemoReview, publishDemoReview } from './demoLogin';

const policies: Policies = {
  termsVersion: 't1', privacyVersion: 'p1', guardianVersion: 'g1', aiAnalysisVersion: 'ai1',
  aiObservationEnabled: true, disclaimer: '',
};

type Account = { id: number; email: string; password: string; role: Role };
let accounts: Account[];
let paths: string[];
let deleted: number[];
let nextId: number;
let loseSignup: boolean;
let failDelete: number | null;
function response(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), { status });
}
function tokenResponse(account: Account) {
  return { user: { id: account.id, email: account.email, role: account.role }, accessToken: String(account.id), refreshToken: 'refresh' };
}
beforeEach(() => {
  accounts = []; paths = []; deleted = []; nextId = 1; loseSignup = false; failDelete = null;
  const store = new Map<string,string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
  vi.stubGlobal('navigator', {});
  vi.spyOn(client, 'currentSession').mockReturnValue(null);
  vi.stubGlobal('fetch', async (url: string, options: RequestInit) => {
    const path = url.slice('/api/v1'.length);
    const body = options.body ? JSON.parse(String(options.body)) : {};
    paths.push(options.method+' '+path);
    if (path === '/auth/signup') {
      const account: Account = {id: nextId++, email: body.email, password: body.password, role: body.role};
      accounts.push(account);
      if (loseSignup) { loseSignup = false; throw new TypeError('Lost response'); }
      return response(201,tokenResponse(account));
    }
    if (path === '/auth/login') {
      const account=accounts.find(a=>a.email===body.email && a.password===body.password);
      return account ? response(200,tokenResponse(account)) : response(401,{});
    }
    const bearer = new Headers(options.headers).get('Authorization');
    const account = accounts.find(a=>'Bearer '+a.id===bearer);
    if (!account) return response(401,{});
    if (path === '/me' && options.method === 'GET') return response(200,tokenResponse(account).user);
    if (path === '/me' && options.method === 'DELETE') {
      if (failDelete===account.id) return response(503,{});
      if (body.password!==account.password) return response(403,{});
      deleted.push(account.id);
      accounts=accounts.filter(a=>a!==account);
      return response(204);
    }
    if (path === '/children') return response(201,{id:100});
    if (path.endsWith('/interaction-records')) return response(201,{coaching:{delivery:{id:42}}});
    if (path.endsWith('/invite-codes')) return response(201,{code:'123456'});
    if (path.endsWith('/observations')) return response(201,{id:200});
    return response(200,{});
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('실제 로그인용 예시 기록', () => {
  it('QR 검토 예시는 이 기기의 체험 쌍에서 선생님이 완료한 내용만 보호자에게 전달한다', async () => {
    const p = await prepareDemoLogin('PARENT', policies);
    const t = await prepareDemoLogin('TEACHER', policies);
    const parent = p.tokens.user, teacher = t.tokens.user;
    const memo = '직접 확인한 선생님 메모';
    expect(publishDemoReview(parent, p.childId, memo, true)).toBeNull();
    expect(publishDemoReview(teacher, p.childId + 1, memo, true)).toBeNull();
    expect(publishedDemoReview(parent, p.childId)).toBeNull();
    const teacherEdit = { action: '블록을 한 개 내어 주세요.' };
    const teacherRecommendation = { action: '아이에게 고를 시간을 주세요.', rationale: '아이의 선택을 기다려요.' };
    const review = publishDemoReview(teacher, p.childId, memo, false, { teacherEdit, teacherRecommendation });
    expect(review).toMatchObject({ status: 'published', summary: memo, includeAction: false, teacherRecommendation });
    expect(review?.teacherEdit).toBeUndefined();
    expect(publishedDemoReview(parent, p.childId)).toEqual(review);
    expect(publishedDemoReview(parent, p.childId + 1)).toBeNull();
    expect(publishedDemoReview({ ...parent, email: 'another@example.com' }, p.childId)).toBeNull();
    expect(paths.some(path => path.includes('ai-observations'))).toBe(false);
  });

  it('동시에 시작한 두 역할이 한 쌍의 계정과 같은 아이를 쓰고 각각 비밀번호로 로그인한다', async () => {
    const [p,t] = await Promise.all([prepareDemoLogin('PARENT',policies),prepareDemoLogin('TEACHER',policies)]);
    expect(accounts).toHaveLength(2);
    expect(paths.filter(path=>path==='POST /auth/login')).toHaveLength(2);
    expect(paths.filter(path=>path.endsWith('/interaction-records'))).toHaveLength(5);
    expect(paths.filter(path=>path.endsWith('/messages'))).toHaveLength(2);
    expect(p.childId).toBe(t.childId);
    expect(isDemoWorkspaceChild(t.tokens.user,t.childId)).toBe(true);
    expect(isDemoWorkspaceChild(t.tokens.user,t.childId+1)).toBe(false);
    expect(isDemoWorkspaceChild({...p.tokens.user,email:'normal@example.com'},p.childId)).toBe(false);
    expect(hasDemoConsent(policies)).toBe(true);
    expect(hasDemoConsent({...policies,privacyVersion:'p2'})).toBe(false);
  });

  it('일반 사용자 세션이 이미 있으면 예시 계정이나 아이를 생성하지 않는다', async () => {
    accounts.push({id:55,email:'normal@example.com',password:'real-password',role:'PARENT'});
    vi.mocked(client.currentSession).mockReturnValue({accessToken:'55',refreshToken:'r'});
    await expect(prepareDemoLogin('PARENT',policies)).rejects.toThrow('로그아웃');
    expect(paths).toEqual(['GET /me']);
  });

  it('가입 응답을 받기 전에 연결이 끊겨도 다음 실행에서 미완성 계정을 확인하고 정리한다', async () => {
    loseSignup=true;
    await expect(prepareDemoLogin('PARENT',policies)).rejects.toThrow('Lost response');
    const pendingId=accounts[0].id;
    const result=await prepareDemoLogin('PARENT',policies);
    expect(deleted).toEqual([pendingId]);
    expect(accounts).toHaveLength(2);
    expect(result.tokens.user.id).not.toBe(pendingId);
  });

  it('정리를 다시 시도할 때 남은 체험 계정만 삭제한다', async () => {
    const {tokens,childId}=await prepareDemoLogin('PARENT',policies);
    vi.mocked(client.currentSession).mockReturnValue(tokens);
    failDelete=tokens.user.id;
    await expect(deleteCurrentDemoWorkspace(tokens.user)).rejects.toThrow();
    expect(accounts.map(a=>a.id)).toEqual([tokens.user.id]);
    failDelete=null;
    await deleteCurrentDemoWorkspace(tokens.user);
    expect(accounts).toEqual([]);
    expect(new Set(deleted).size).toBe(2);
    expect(isDemoWorkspaceChild(tokens.user,childId)).toBe(false);
  });
});
