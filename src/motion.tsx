import { useSyncExternalStore } from 'react';

/*
 * 화면 설정 '움직이는 캐릭터'. 켜져 있으면 화면 아래에 모찌(components/MochiBuddy.tsx)가 돌아다니고,
 * 화면 속 캐릭터 그림(.mascot)이 숨 쉬듯 살짝 움직인다.
 * 고르지 않으면 기기 설정(prefers-reduced-motion: 동작 줄이기)을 따른다 — 동작 줄이기를 켠 기기에서는 꺼진다.
 * 정해진 값은 <html data-motion="on|off">로 달아 CSS가 따른다. 이 기기에만 저장한다(서버로 보내지 않는다).
 */

export type MotionPref = 'system' | 'on' | 'off';

const KEY = 'hj.motion';
const REDUCE = '(prefers-reduced-motion: reduce)';
const listeners = new Set<() => void>();

function deviceReduce() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(REDUCE).matches;
}

export function readMotionPref(): MotionPref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'on' || v === 'off' ? v : 'system';
  } catch {
    return 'system';
  }
}

/** 지금 캐릭터를 움직일지. 직접 고른 값이 기기 설정보다 먼저다. */
export function resolveMotion(p: MotionPref, reduce = deviceReduce()): boolean {
  if (p === 'on') return true;
  if (p === 'off') return false;
  return !reduce;
}

export function applyMotion(p: MotionPref = readMotionPref()) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-motion', resolveMotion(p) ? 'on' : 'off');
}

export function saveMotionPref(p: MotionPref) {
  try {
    if (p === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, p);
  } catch {
    /* 저장할 수 없는 환경이면 이번 방문에만 적용한다 */
  }
  applyMotion(p);
  listeners.forEach((l) => l());
}

/** 앱을 그리기 전에 한 번 부른다. 기기의 동작 줄이기 설정이 바뀌면 다시 적용한다. */
export function initMotion() {
  applyMotion();
  if (typeof window.matchMedia !== 'function') return;
  window.matchMedia(REDUCE).addEventListener?.('change', () => {
    applyMotion();
    listeners.forEach((l) => l());
  });
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** 고른 값('system'·'on'·'off'). */
export function useMotionPref(): MotionPref {
  return useSyncExternalStore(subscribe, readMotionPref, () => 'system');
}

/** 지금 캐릭터를 움직이는지(기기 설정까지 따진 값). */
export function useMotionOn(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => resolveMotion(readMotionPref()),
    () => false,
  );
}

/** 화면 설정 안의 '움직이는 캐릭터' 스위치. ThemeSettings가 고대비 스위치 아래에 놓는다. */
export function MotionSwitch() {
  const pref = useMotionPref();
  const on = useMotionOn();
  return (
    <label className="switch-row">
      <span className="switch-text">
        <strong>움직이는 캐릭터</strong>
        <span className="muted" id="motion-hint">
          화면 아래에서 모찌가 통통 뛰어다녀요. 끌어서 옮기거나 던질 수 있고, 누르면 폴짝 뛰어요.
          {pref === 'system' ? ' 지금은 기기 설정(동작 줄이기)을 따르고 있어요.' : ''}
        </span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={on}
        aria-describedby="motion-hint"
        data-demo="theme-switch-motion"
        onChange={(e) => saveMotionPref(e.target.checked ? 'on' : 'off')}
      />
    </label>
  );
}
