import type { Observation, TeacherChild } from '../../api/types';
import type { Pose } from '../../components/coachingArt';
import { poseFor } from '../../components/coachingArt';

/*
 * 선생님 화면(Figma '선생님 홈화면'·'선생님 이야기')에서 함께 쓰는 작은 도우미.
 * - 지금 보고 있는 아이: 홈은 한 번에 한 아이의 이야기를 보여 주고, 떠 있는 버튼으로 다른 아이로 바꾼다.
 *   고른 아이는 이 기기에만 기억한다(서버에는 보내지 않는다).
 */

const PICKED = 'hj.teacher.child';

export function storedChildId(): number | null {
  try {
    const v = Number(localStorage.getItem(PICKED));
    return Number.isInteger(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

export function rememberChild(id: number) {
  try {
    localStorage.setItem(PICKED, String(id));
  } catch {
    /* 저장할 수 없으면(사생활 보호 창 등) 기억하지 않고 첫 아이를 보여 준다. */
  }
}

/** 기억한 아이가 목록에 있으면 그 아이, 없으면 먼저 연결된 아이. */
export function currentChild(list: TeacherChild[] | null | undefined, wanted = storedChildId()): TeacherChild | null {
  if (!list || list.length === 0) return null;
  return list.find((c) => c.id === wanted) ?? list[0];
}

/** '2026-11-20' → '11월 20일'. */
export function storyDate(observedOn: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(observedOn);
  if (!m) return observedOn;
  return `${Number(m[2])}월 ${Number(m[3])}일`;
}

/** 이 기기 날짜로 오늘('YYYY-MM-DD'). */
export function todayIso(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** 목록에 보일 제목: 제목이 있으면 제목, 없으면 본문 첫 줄(앞 20자). */
export function storyTitle(n: Pick<Observation, 'title' | 'content'>): string {
  const t = n.title?.trim();
  if (t) return t;
  const line = n.content.trim().split('\n')[0] ?? '';
  return line.length > 20 ? `${line.slice(0, 20)}…` : line;
}

/** 첨부한 카드가 없을 때 이야기 그림(이야기마다 고르게 돌아가며). */
const STORY_POSES: Pose[] = ['ball-wait', 'blocks', 'comfort', 'listen'];

/** 이야기 썸네일 그림: 첨부한 코칭 카드의 그림, 없으면 돌아가며 고른 모찌. */
export function storyPose(n: Pick<Observation, 'id' | 'card'>): Pose {
  if (n.card) return poseFor({ code: n.card.code, metricFocus: undefined as never });
  return STORY_POSES[Math.abs(n.id) % STORY_POSES.length];
}
