import { useEffect, useState } from 'react';
import { MotionSwitch, saveMotionPref, useMotionPref } from './motion';

/*
 * 화면 설정(밝기·고대비). 고르지 않은 항목은 기기 설정(prefers-color-scheme, prefers-contrast)을 따른다.
 * 둘 다 기기 설정이면 <html>에 data-theme을 달지 않아 styles.css의 미디어 쿼리만으로 정해진다.
 * 하나라도 직접 고르면 나머지는 지금의 기기 설정으로 채워 data-theme(light·dark·hc-light·hc-dark)을 단다.
 * 이 기기에만 저장한다(서버로 보내지 않는다).
 */

export type Scheme = 'system' | 'light' | 'dark';
export type Contrast = 'system' | 'more' | 'normal';
export interface ThemePref {
  scheme: Scheme;
  contrast: Contrast;
}

const KEY = 'hj.theme';
const DEFAULT: ThemePref = { scheme: 'system', contrast: 'system' };
const listeners = new Set<() => void>();

function media(q: string) {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(q).matches;
}

export function readThemePref(): ThemePref {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const p = JSON.parse(raw) as Partial<ThemePref>;
    return {
      scheme: p.scheme === 'light' || p.scheme === 'dark' ? p.scheme : 'system',
      contrast: p.contrast === 'more' || p.contrast === 'normal' ? p.contrast : 'system',
    };
  } catch {
    return DEFAULT;
  }
}

/** 지금 화면에 쓰일 테마. null이면 data-theme 없이 기기 설정을 그대로 따른다. */
export function resolveTheme(p: ThemePref): string | null {
  if (p.scheme === 'system' && p.contrast === 'system') return null;
  const dark = p.scheme === 'dark' || (p.scheme === 'system' && media('(prefers-color-scheme: dark)'));
  const high = p.contrast === 'more' || (p.contrast === 'system' && media('(prefers-contrast: more)'));
  if (high) return dark ? 'hc-dark' : 'hc-light';
  return dark ? 'dark' : 'light';
}

export function applyTheme(p: ThemePref = readThemePref()) {
  const t = resolveTheme(p);
  const root = document.documentElement;
  if (t) root.setAttribute('data-theme', t);
  else root.removeAttribute('data-theme');
}

export function saveThemePref(p: ThemePref) {
  try {
    if (p.scheme === 'system' && p.contrast === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* 저장할 수 없는 환경이면 이번 방문에만 적용한다 */
  }
  applyTheme(p);
  listeners.forEach((l) => l());
}

/** 앱을 그리기 전에 한 번 부른다. 기기 설정이 바뀌면(밤에 다크로 바뀌는 등) 다시 적용한다. */
export function initTheme() {
  applyTheme();
  if (typeof window.matchMedia !== 'function') return;
  for (const q of ['(prefers-color-scheme: dark)', '(prefers-contrast: more)']) {
    window.matchMedia(q).addEventListener?.('change', () => {
      applyTheme();
      listeners.forEach((l) => l());
    });
  }
}

/** 화면 설정 값과 바꾸는 함수, 지금 기기가 다크·고대비인지. */
export function useThemePref() {
  const [pref, setPref] = useState<ThemePref>(readThemePref);
  const [, bump] = useState(0);
  useEffect(() => {
    const l = () => {
      setPref(readThemePref());
      bump((n) => n + 1);
    };
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  const update = (next: Partial<ThemePref>) => saveThemePref({ ...pref, ...next });
  return {
    pref,
    update,
    deviceDark: media('(prefers-color-scheme: dark)'),
    deviceHighContrast: media('(prefers-contrast: more)'),
  };
}

const SCHEMES: Array<{ value: Scheme; label: string }> = [
  { value: 'system', label: '기기 설정' },
  { value: 'light', label: '밝게' },
  { value: 'dark', label: '어둡게' },
];

/** 화면 설정의 내용(밝기·고대비·움직이는 캐릭터). 제목은 쓰는 쪽에서 붙인다 — 내 정보 화면은 목록 행 제목 아래에 펼쳐 보인다. */
export function ThemeSettings() {
  const { pref, update, deviceHighContrast } = useThemePref();
  const motionPref = useMotionPref();
  const highOn = pref.contrast === 'more' || (pref.contrast === 'system' && deviceHighContrast);
  return (
    <>
      <p className="field-label" id="theme-scheme-label">
        밝기
      </p>
      <div className="tabs" role="group" aria-labelledby="theme-scheme-label">
        {SCHEMES.map((s) => (
          <button key={s.value} type="button" aria-pressed={pref.scheme === s.value} onClick={() => update({ scheme: s.value })}>
            {s.label}
          </button>
        ))}
      </div>
      <label className="switch-row">
        <span className="switch-text">
          <strong>고대비</strong>
          <span className="muted" id="theme-contrast-hint">
            글자와 테두리를 더 진하게 보여 줘요.
            {pref.contrast === 'system' ? ' 지금은 기기 설정(대비 높이기)을 따르고 있어요.' : ''}
          </span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={highOn}
          aria-describedby="theme-contrast-hint"
          onChange={(e) => update({ contrast: e.target.checked ? 'more' : 'normal' })}
        />
      </label>
      <MotionSwitch />
      {(pref.scheme !== 'system' || pref.contrast !== 'system' || motionPref !== 'system') && (
        <p className="status-line">
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              update({ scheme: 'system', contrast: 'system' });
              saveMotionPref('system');
            }}
          >
            기기 설정으로 되돌리기
          </button>
        </p>
      )}
    </>
  );
}
