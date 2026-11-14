/**
 * 메뉴 화면과 시연 진행(FeatureHost) 사이의 작은 상태 저장소. 메뉴가 시작을 부탁하면 Host가 실행한다.
 */

export type HostPhase = 'idle' | 'preparing' | 'running' | 'cleaning';

export interface ControllerState {
  phase: HostPhase;
  /** 시작을 부탁받은 시나리오(Host가 받아 가면 비운다) */
  request: string | null;
  /** 지금 진행 중인 시나리오 */
  current: string | null;
  /** 메뉴에 보일 한 줄(예: '화면을 옮기셔서 시연을 멈추고 정리했어요') */
  message: string | null;
}

let state: ControllerState = { phase: 'idle', request: null, current: null, message: null };
const listeners = new Set<() => void>();

export function getController() {
  return state;
}

export function setController(patch: Partial<ControllerState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function subscribeController(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function requestStart(key: string) {
  if (state.phase !== 'idle') return;
  setController({ request: key, message: null });
}

// ---------- 본 시나리오 표시(이 탭에서만) ----------

const SEEN_KEY = 'hj.demo.features.seen';

export function seenKeys(): string[] {
  try {
    const raw = sessionStorage.getItem(SEEN_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function markSeen(key: string) {
  try {
    const next = Array.from(new Set([...seenKeys(), key]));
    sessionStorage.setItem(SEEN_KEY, JSON.stringify(next));
  } catch {
    /* 저장소를 쓸 수 없으면 표시하지 않는다 */
  }
}

// ---------- 속도(이 기기에서 기억) ----------

const SPEED_KEY = 'hj.demo.features.speed';

export function loadSpeed(): number {
  try {
    const v = Number(localStorage.getItem(SPEED_KEY));
    return v === 2 ? 2 : 1;
  } catch {
    return 1;
  }
}

export function saveSpeed(v: number) {
  try {
    localStorage.setItem(SPEED_KEY, String(v));
  } catch {
    /* 기억하지 못해도 이번 시연에는 적용된다 */
  }
}
