import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/*
 * iOS 앱(ios/, SwiftUI가 이 웹앱을 WKWebView로 띄움)과 주고받는 다리.
 * 앱 안에서 열리면 window.webkit.messageHandlers.hamkke가 있다. 브라우저에서는 아무것도 하지 않는다.
 * - 웹 → 앱: { type: 'ready' } 처음 그렸을 때, { type: 'route', path, title, canGoBack } 화면이 바뀔 때,
 *   { type: 'haptic', style } 눌렀을 때의 진동(버튼·모찌·세게 떨어짐).
 * - 앱 → 웹: window.hjNavigate(path) 아래 탭을 눌렀을 때, window.hjBack() 위의 뒤로 버튼.
 * 앱 안에서는 <html class="ios-app">를 달아 웹의 상단바를 숨긴다(앱의 머리줄이 대신한다).
 * 주고받는 것은 화면 주소·제목·진동 종류뿐이다(기록·토큰·아이 정보는 보내지 않는다).
 */

export type HapticStyle = 'light' | 'medium' | 'soft' | 'success';

export type NativeMessage =
  | { type: 'ready' }
  | { type: 'route'; path: string; title: string; canGoBack: boolean }
  | { type: 'haptic'; style: HapticStyle };

interface Handler {
  postMessage(m: NativeMessage): void;
}

declare global {
  interface Window {
    webkit?: { messageHandlers?: { hamkke?: Handler } };
    hjNavigate?: (path: string) => void;
    hjBack?: () => void;
  }
}

function handler(): Handler | undefined {
  return typeof window !== 'undefined' ? window.webkit?.messageHandlers?.hamkke : undefined;
}

export function inIosApp(): boolean {
  return !!handler();
}

export function postNative(m: NativeMessage) {
  try {
    handler()?.postMessage(m);
  } catch {
    /* 앱이 메시지를 받지 못해도 웹은 그대로 동작한다 */
  }
}

export function haptic(style: HapticStyle) {
  postNative({ type: 'haptic', style });
}

/** 지금 화면 제목: 본문 첫 제목(h1). 없으면 앱 이름. */
function screenTitle() {
  const h1 = document.querySelector('main h1');
  const t = h1?.textContent?.replace(/\s+/g, ' ').trim();
  return t || '시나브로';
}

/** 누르면 짧게 진동할 것들(버튼·목록 행·스위치). */
const TAPPABLE = 'button, a.btn, a.menu-row, a.kid-row, summary, [role="switch"], input[type="checkbox"]';

/** Layout 안에 한 번 둔다. 앱 밖에서는 아무것도 하지 않는다. */
export function NativeBridge() {
  const nav = useNavigate();
  const { pathname } = useLocation();
  // useNavigate는 화면이 바뀔 때마다 새 함수를 줄 수 있다. 앱과의 연결(ready·hjNavigate)은 한 번만 하도록 ref로 최신 것을 쓴다.
  const navRef = useRef(nav);
  navRef.current = nav;

  useEffect(() => {
    if (!inIosApp()) return;
    const root = document.documentElement;
    root.classList.add('ios-app');
    window.hjNavigate = (path: string) => navRef.current(path);
    window.hjBack = () => navRef.current(-1);
    const onClick = (e: MouseEvent) => {
      if (e.target instanceof Element && e.target.closest(TAPPABLE)) haptic('soft');
    };
    document.addEventListener('click', onClick, true);
    postNative({ type: 'ready' });
    return () => {
      root.classList.remove('ios-app');
      delete window.hjNavigate;
      delete window.hjBack;
      document.removeEventListener('click', onClick, true);
    };
  }, []);

  // 화면이 바뀌면 주소와 제목을 알린다. 제목은 불러온 뒤나 같은 주소에서도 바뀌므로(예: 준비 화면 → 시작 화면,
  // '콩이의 하루') 본문이 바뀔 때마다 살펴 제목이 달라졌으면 다시 알린다.
  useEffect(() => {
    if (!inIosApp()) return;
    let last = '';
    const send = (force: boolean) => {
      const title = screenTitle();
      if (!force && title === last) return;
      last = title;
      const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
      postNative({ type: 'route', path: pathname, title, canGoBack: idx > 0 });
    };
    const first = window.setTimeout(() => send(true), 60);
    let queued = 0;
    const obs = new MutationObserver(() => {
      window.clearTimeout(queued);
      queued = window.setTimeout(() => send(false), 120);
    });
    const main = document.querySelector('main');
    if (main) obs.observe(main, { childList: true, subtree: true, characterData: true });
    return () => {
      window.clearTimeout(first);
      window.clearTimeout(queued);
      obs.disconnect();
    };
  }, [pathname]);

  return null;
}
