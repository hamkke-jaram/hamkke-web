import type { Target } from './types';

/**
 * 시연이 가리키는 화면 요소 이름을 CSS 셀렉터로 바꾼다.
 * '@이름' → [data-demo="이름"], '#아이디' → #아이디. 글자로 찾지 않는다(문구가 바뀌면 깨지므로).
 */
export function toSelector(t: Target): string {
  if (t.startsWith('@')) return `[data-demo="${cssString(t.slice(1))}"]`;
  return `#${cssIdent(t.slice(1))}`;
}

function cssString(s: string) {
  return s.replace(/["\\]/g, '\\$&');
}

/** id에 쓰이는 글자(영문·숫자·-·_)는 그대로, 나머지는 이스케이프한다. */
function cssIdent(s: string) {
  return s.replace(/[^A-Za-z0-9_-]/g, (c) => `\\${c}`).replace(/^(\d)/, '\\3$1 ');
}

/** 이름이 올바른 모양인지(소문자·숫자·-·대문자 키 이름). */
export function isTarget(v: string): v is Target {
  return /^[@#][A-Za-z][A-Za-z0-9-]*$/.test(v);
}
