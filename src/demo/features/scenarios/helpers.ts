import * as netlog from '../netlog';
import type { Narration, ScenarioData, Where } from '../types';

/** 말풍선 한 개. where: 이 기기 안에서(device) / 기록 서버로(server) / AI 서버로(ai) */
export function n(title: string, body: string, ...where: Where[]): Narration {
  return where.length ? { title, body, where } : { title, body };
}

export function childId(d: ScenarioData) {
  if (d.childId === undefined) throw new Error('시연용 아이가 준비되지 않았어요.');
  return d.childId;
}

export const childHome = (d: ScenarioData) => `/p/children/${childId(d)}`;
export const teacherChild = (d: ScenarioData) => `/t/children/${childId(d)}`;

/** 서버가 준 sharedItems를 한국어로 */
const SHARED_NAME: Record<string, string> = {
  JOINT_PLAY: '함께한 시간',
  RESPONSE_LATENCY: '반응까지 걸린 시간',
  DISTRESS: '크게 운 횟수',
  COACHING_CARDS: '코칭 카드',
  AI_OBSERVATIONS: 'AI 관찰 기록',
  INSTITUTION_CAPTURE: '기관 촬영 허락',
};

export function sharedNames(data: unknown): string {
  const items = (data as { sharedItems?: string[] } | undefined)?.sharedItems;
  if (!Array.isArray(items)) return '(응답에서 항목을 읽지 못했어요)';
  if (items.length === 0) return '없음';
  return items.map((i) => SHARED_NAME[i] ?? i).join(', ');
}

export function hasShared(data: unknown, item: string) {
  const items = (data as { sharedItems?: string[] } | undefined)?.sharedItems;
  return Array.isArray(items) && items.includes(item);
}

export function isOk(status: number) {
  return status >= 200 && status < 300;
}

/** 가장 최근에 끝난 같은 요청의 상태(없으면 null). 서버 판(옛 서버에는 없는 기능)에 따라 설명을 고를 때 쓴다. */
export function lastStatus(method: string, path: RegExp): number | 'offline' | null {
  const e = [...netlog.getEntries()].reverse().find((x) => x.status !== 'pending' && netlog.matches(x, method, path));
  return e ? (e.status as number | 'offline') : null;
}

export function lastOk(method: string, path: RegExp) {
  const s = lastStatus(method, path);
  return typeof s === 'number' && isOk(s);
}
