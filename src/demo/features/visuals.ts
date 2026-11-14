/**
 * 시연 겉모습 상태(비추는 요소, 가짜 커서, 누름 물결, 짧은 표시). 화면 조작(domDriver)이 바꾸고 Overlay가 그린다.
 */
export interface Visuals {
  target: Element | null;
  cursor: { x: number; y: number } | null;
  /** 누를 때마다 1씩 늘어 물결을 다시 그린다. */
  ripple: number;
  /** 요소 곁에 잠깐 보일 짧은 표시(예: '달력에서 골랐어요') */
  hint: string | null;
}

let state: Visuals = { target: null, cursor: null, ripple: 0, hint: null };
const listeners = new Set<() => void>();

export function getVisuals() {
  return state;
}

export function setVisuals(patch: Partial<Visuals>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function resetVisuals() {
  setVisuals({ target: null, cursor: null, hint: null });
}

export function subscribeVisuals(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
