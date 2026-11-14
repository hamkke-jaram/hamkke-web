import type { Group, Scenario } from '../types';
import { account, support } from './always';
import { aiConsent, childEdit, coaching, record, recordsList, weekly } from './home';
import { childConsent, login, reconsent, signup } from './start';
import { aiCapture, invite, inviteRevoke, share, teacherNotes, teacherUnlink } from './teacher';

/** 메뉴에 보이는 순서대로 */
export const SCENARIOS: Scenario[] = [
  signup,
  login,
  childConsent,
  reconsent,
  record,
  weekly,
  coaching,
  aiConsent,
  childEdit,
  recordsList,
  share,
  invite,
  teacherNotes,
  inviteRevoke,
  teacherUnlink,
  aiCapture,
  support,
  account,
];

export const GROUPS: { key: Group; title: string }[] = [
  { key: 'start', title: '시작하기' },
  { key: 'home', title: '집에서' },
  { key: 'teacher', title: '선생님과' },
  { key: 'always', title: '언제나' },
];

export function scenarioByKey(key: string) {
  return SCENARIOS.find((s) => s.key === key);
}
