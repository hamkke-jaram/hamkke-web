import { currentSession } from '../api/client';
import type { Policies, Role, TeacherRecommendation, TokenResponse, User } from '../api/types';
import { createDemo, demoRequest, newDemoPair, SeedError, type DemoPair } from '../demo/seed';

type Identity = Pick<User, 'id' | 'email' | 'role'>;
type Versions = Pick<Policies, 'termsVersion' | 'privacyVersion' | 'guardianVersion'>;
export type ExampleReview = {
  status: 'published'; summary: string; includeAction: boolean; reviewedAt: string;
  teacherEdit?: TeacherRecommendation;
  teacherRecommendation?: TeacherRecommendation;
};
type Workspace = {
  pair: DemoPair;
  versions: Versions;
  ids?: { PARENT: number; TEACHER: number; child: number };
  deleting?: boolean;
  exampleReview?: ExampleReview;
};
const KEY = 'hj.demo.login.v1';
const roles: Role[] = ['PARENT', 'TEACHER'];
let temporary: Workspace | null = null;
let queue = Promise.resolve();

function validId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function read(): Workspace | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return temporary;
    const item: Workspace | null = JSON.parse(raw);
    if (!item?.versions || !item.pair) return null;
    for (const role of roles) {
      const account = item.pair[role];
      const prefix = role === 'PARENT' ? 'demo-parent-' : 'demo-teacher-';
      if (!account || typeof account.email !== 'string' || !account.email.startsWith(prefix)
        || !/^[a-f0-9]{12}@demo\.hamkke\.test$/.test(account.email.slice(prefix.length))
        || typeof account.password !== 'string' || !/^Demo-[a-f0-9]{12}-[a-f0-9]{12}!$/.test(account.password)) return null;
    }
    if (item.ids && (!validId(item.ids.PARENT) || !validId(item.ids.TEACHER)
      || !validId(item.ids.child) || item.ids.PARENT === item.ids.TEACHER)) return null;
    return item;
  } catch {
    return temporary;
  }
}

function save(item: Workspace | null) {
  try {
    if (item) localStorage.setItem(KEY, JSON.stringify(item));
    else localStorage.removeItem(KEY);
    temporary = null;
  } catch {
    temporary = item;
  }
}

/** Provision and delete the pair in order, including simultaneous scans in another tab. */
async function exclusive<T>(work: () => Promise<T>): Promise<T> {
  if (navigator.locks) return await navigator.locks.request(KEY, work);
  const next = queue.then(work);
  queue = next.then(() => undefined, () => undefined);
  return next;
}

function matches(user: Identity | null | undefined, workspace: Workspace | null) {
  return !!user && !!workspace?.ids && roles.includes(user.role)
    && workspace.ids[user.role] === user.id && workspace.pair[user.role].email === user.email;
}

export function isCurrentDemoUser(user: Identity | null | undefined): boolean {
  return matches(user, read());
}

export function isDemoWorkspaceChild(user: Identity | null | undefined, childId: number): boolean {
  const workspace = read();
  return matches(user, workspace) && workspace?.ids?.child === childId;
}

export function publishedDemoReview(user: Identity | null | undefined, childId: number) {
  const workspace = read();
  if (workspace?.ids?.child !== childId || workspace.deleting || !matches(user, workspace)) return null;
  const review = workspace.exampleReview;
  return review?.status === 'published'
    && typeof review.summary === 'string' && !!review.summary.trim() && review.summary.length <= 500
    && typeof review.includeAction === 'boolean' && Number.isFinite(Date.parse(review.reviewedAt)) ? review : null;
}

export function publishDemoReview(user: Identity, childId: number, summary: string, includeAction: boolean,
  advice?: Pick<ExampleReview, 'teacherEdit' | 'teacherRecommendation'>) {
  const workspace = read();
  const text = summary.trim();
  if (!workspace?.ids || workspace.ids.child !== childId || workspace.deleting
    || user.role !== 'TEACHER' || !matches(user, workspace) || !text || text.length > 500) return null;
  const review: ExampleReview = {
    status: 'published', summary: text, includeAction, reviewedAt: new Date().toISOString(),
    teacherEdit: includeAction ? advice?.teacherEdit : undefined, teacherRecommendation: advice?.teacherRecommendation,
  };
  save({ ...workspace, exampleReview: review });
  return review;
}

export function hasDemoConsent(policies: Policies): boolean {
  const workspace = read();
  return !!workspace?.ids && !workspace.deleting
    && workspace.versions.termsVersion === policies.termsVersion
    && workspace.versions.privacyVersion === policies.privacyVersion
    && workspace.versions.guardianVersion === policies.guardianVersion;
}

async function login(workspace: Workspace, role: Role) {
  const account = workspace.pair[role];
  const result = await demoRequest<TokenResponse>(null, 'POST', '/auth/login', account);
  if (result.user.email !== account.email || result.user.role !== role || !validId(result.user.id)
    || (workspace.ids && result.user.id !== workspace.ids[role])) {
    throw new Error('체험 계정 정보를 확인하지 못했어요.');
  }
  return result;
}

/** Check every surviving identity before deleting either account. An interrupted delete is safe to resume. */
async function removePair(workspace: Workspace, order: Role[]) {
  const verified: Array<{ role: Role; token: string }> = [];
  for (const role of order) {
    let tokens: TokenResponse;
    try {
      tokens = await login(workspace, role);
    } catch (error) {
      if (error instanceof SeedError && error.status === 401) continue;
      throw error;
    }
    const user = await demoRequest<User>(tokens.accessToken, 'GET', '/me');
    if (user.id !== tokens.user.id || user.role !== role || user.email !== workspace.pair[role].email) {
      throw new Error('삭제할 체험 계정을 확인하지 못했어요.');
    }
    verified.push({ role, token: tokens.accessToken });
  }
  for (const account of verified) {
    await demoRequest(account.token, 'DELETE', '/me', { password: workspace.pair[account.role].password });
  }
  save(null);
}

export function deleteCurrentDemoWorkspace(user: Identity): Promise<void> {
  return exclusive(async () => {
    const workspace = read();
    const session = currentSession();
    if (!workspace || !matches(user, workspace) || !session) throw new Error('현재 체험 계정을 확인해 주세요.');
    const serverUser = await demoRequest<User>(session.accessToken, 'GET', '/me');
    if (!matches(serverUser, workspace) || serverUser.id !== user.id) throw new Error('로그인한 계정이 바뀌었어요.');
    save({ ...workspace, deleting: true });
    await removePair(workspace, [user.role === 'PARENT' ? 'TEACHER' : 'PARENT', user.role]);
  });
}

/** Called only on explicit demo login. Seed calls use the generated accounts' own bearer tokens. */
export function prepareDemoLogin(role: Role, policies: Policies, onProgress?: (label: string) => void) {
  return exclusive(async () => {
    let workspace = read();
    const session = currentSession();
    if (session) {
      const me = await demoRequest<User>(session.accessToken, 'GET', '/me');
      if (!matches(me, workspace)) throw new Error('내 계정으로 로그인 중이에요. 로그아웃한 뒤 체험해 주세요.');
    }
    // The credentials were saved *before* signup, so a lost response or tab closure cannot leave
    // a partially seeded pair that has no recovery record.
    if (workspace && (!workspace.ids || workspace.deleting)) {
      onProgress?.('이전 체험 준비를 정리하고 있어요.');
      await removePair(workspace, ['TEACHER', 'PARENT']);
      workspace = null;
    }
    if (!workspace) {
      const { termsVersion, privacyVersion, guardianVersion } = policies;
      workspace = { pair: newDemoPair(), versions: { termsVersion, privacyVersion, guardianVersion } };
      save(workspace);
      const data = await createDemo(policies, label => onProgress?.(label), workspace.pair);
      workspace.ids = { PARENT: data.parent.userId, TEACHER: data.teacher.userId, child: data.childId };
      save(workspace);
    }
    onProgress?.('체험 계정으로 로그인하고 있어요.');
    const tokens = await login(workspace, role);
    // This remembers the demo-entry notice only. Reconsent still uses the server's /me response.
    if (!hasDemoConsent(policies)) {
      const { termsVersion, privacyVersion, guardianVersion } = policies;
      save({ ...workspace, versions: { termsVersion, privacyVersion, guardianVersion } });
    }
    return { tokens, childId: workspace.ids!.child };
  });
}
