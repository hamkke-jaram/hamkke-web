import { toSelector } from './anchors';
import type { Driver, FindOptions, Target, TypeOptions } from './types';
import { setVisuals } from './visuals';

/**
 * 실제 화면을 움직이는 Driver. 사람이 쓰는 것과 같은 길로만 움직인다:
 * - 글자 넣기: 네이티브 value setter + 'input' 이벤트(React의 onChange가 실행된다. el.value=만 쓰면 React가 알아채지 못한다)
 * - 체크·스위치·버튼: el.click()(onChange·onClick·onSubmit이 그대로 실행된다)
 * - 파일: DataTransfer로 숨은 파일 칸에 넣고 'change'(파일 창은 열지 않는다)
 * 엔진이 만든 이벤트는 isTrusted가 false라서, 사람이 만진 것(true)과 섞이지 않는다.
 */

const POLL = 120;
/** 막힌 버튼이 풀리기를 기다리는 가장 긴 시간(ms) */
const CLICK_WAIT = 1500;

class StoppedError extends Error {
  constructor() {
    super('stopped');
  }
}

function wait(ms: number) {
  return new Promise<void>((r) => window.setTimeout(r, ms));
}

function visible(el: Element) {
  return el.getClientRects().length > 0;
}

/** 이름이 같은 요소가 여럿이면(목록 행마다 있는 버튼) 보이는 첫 번째를 쓴다. */
export function query(target: Target): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>(toSelector(target)));
  return all.find(visible) ?? all[0] ?? null;
}

function must(target: Target): HTMLElement {
  const el = query(target);
  if (!el) throw new Error(`화면에서 '${target.slice(1)}' 자리를 찾지 못했어요.`);
  return el;
}

/** React가 값 변화를 알아채도록 네이티브 setter로 넣고 input 이벤트를 보낸다. */
export function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function caretToEnd(el: HTMLInputElement | HTMLTextAreaElement) {
  try {
    const n = el.value.length;
    el.setSelectionRange(n, n);
  } catch {
    /* email·month·date 칸은 커서 옮기기를 지원하지 않는다 */
  }
}

/** 아래 제어 패널 높이(Overlay가 잰다). 요소가 패널에 가리지 않게 스크롤할 때 쓴다. */
function panelHeight() {
  const v = getComputedStyle(document.body).getPropertyValue('--fdemo-pad');
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

export function createDomDriver(opts: { navigate: (path: string) => void; reduced: boolean }): Driver {
  const { navigate, reduced } = opts;

  async function poll(check: () => boolean, o: { signal: AbortSignal; timeout: number; skip?: AbortSignal }, what: string) {
    const until = Date.now() + o.timeout;
    for (;;) {
      if (o.signal.aborted) throw new StoppedError();
      if (o.skip?.aborted) return;
      if (check()) return;
      if (Date.now() > until) throw new Error(what);
      await wait(POLL);
    }
  }

  async function cursorTo(el: Element) {
    if (reduced) return;
    const r = el.getBoundingClientRect();
    setVisuals({ cursor: { x: r.left + Math.min(r.width / 2, 40), y: r.top + r.height / 2 } });
    await wait(380);
  }

  return {
    async find(target: Target, o: FindOptions) {
      await poll(
        () => {
          const el = query(target);
          return !!el && (o.hidden || visible(el));
        },
        o,
        `화면에서 '${target.slice(1)}' 자리를 찾지 못했어요. 화면이 바뀌었거나 아직 불러오는 중일 수 있어요.`,
      );
    },

    async reveal(target: Target) {
      const el = query(target);
      if (!el) return;
      // 닫힌 펼침 안에 있으면 연다(사람이 펼친 것과 같은 상태가 된다).
      for (let d = el.parentElement?.closest('details'); d; d = d.parentElement?.closest('details') ?? null) {
        if (!d.open) d.open = true;
      }
      if (!visible(el)) return;
      // 아래 패널과 위 머리줄 사이(보이는 칸) 가운데쯤에 오게 한다. 늦게 불러온 내용으로 자리가 밀리면 몇 번 더 맞춘다.
      const fit = (behavior: ScrollBehavior) => {
        const r = el.getBoundingClientRect();
        const top = 64;
        const bottom = window.innerHeight - panelHeight() - 12;
        if (r.top >= top && r.bottom <= bottom) return false;
        const room = Math.max(0, bottom - top);
        const want = top + Math.max(0, (room - r.height) / 2);
        window.scrollBy({ top: r.top - want, behavior });
        return true;
      };
      fit(reduced ? 'auto' : 'smooth');
      for (let i = 0; i < 4; i++) {
        await wait(reduced ? 60 : 320);
        if (!fit('auto')) break;
      }
    },

    spotlight(target: Target | null) {
      setVisuals({ target: target ? query(target) : null, hint: null });
    },

    async type(target: Target, text: string, o: TypeOptions) {
      const el = must(target);
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
        throw new Error(`'${target.slice(1)}'은 글자를 넣는 칸이 아니에요.`);
      }
      await cursorTo(el);
      el.focus({ preventScroll: true });
      const toggle = o.reveal && el.id ? document.querySelector<HTMLElement>(`[aria-controls="${el.id}"]`) : null;
      if (toggle && el.type === 'password') toggle.click();
      if (o.clear) setNativeValue(el, '');
      if (o.instant) {
        setNativeValue(el, el.value + text);
        caretToEnd(el);
      } else {
        let i = 0;
        for (const ch of Array.from(text)) {
          if (o.signal.aborted) throw new StoppedError();
          // React가 고쳐 쓴 값(대문자·'-' 넣기) 위에 이어 쓰도록 매번 다시 읽는다.
          setNativeValue(el, el.value + ch);
          caretToEnd(el);
          await o.sleep(o.delay(ch, i++));
        }
      }
      if (toggle) {
        await o.sleep(700);
        const shown = el.type !== 'password';
        if (shown) toggle.click();
      }
    },

    async fill(target: Target, value: string) {
      const el = must(target);
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
        throw new Error(`'${target.slice(1)}'은 값을 넣는 칸이 아니에요.`);
      }
      await cursorTo(el);
      el.focus({ preventScroll: true });
      setNativeValue(el, value);
      const isDate = el instanceof HTMLInputElement && (el.type === 'date' || el.type === 'month');
      setVisuals({ hint: isDate ? `달력에서 ${value}을(를) 골랐어요` : null });
    },

    async click(target: Target) {
      const el = must(target);
      // 요청 중이라 잠깐 막힌 버튼(aria-disabled)은 눌러도 화면이 무시한다. 풀릴 때까지 잠깐 기다려 보고, 그래도 막혀 있으면 알린다.
      const blocked = () => (el as HTMLButtonElement).disabled === true || el.getAttribute('aria-disabled') === 'true';
      for (let waited = 0; blocked() && waited < CLICK_WAIT; waited += POLL) await wait(POLL);
      if (blocked()) throw new Error('이 버튼은 지금 누를 수 없는 상태예요.');
      await cursorTo(el);
      setVisuals({ ripple: Date.now() });
      el.click();
    },

    async putFile(target: Target, file: File) {
      const el = must(target);
      if (!(el instanceof HTMLInputElement) || el.type !== 'file') throw new Error('파일을 고르는 칸이 아니에요.');
      const dt = new DataTransfer();
      dt.items.add(file);
      el.files = dt.files;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },

    async goto(path: string, o: { signal: AbortSignal; timeout: number }) {
      const want = path.split('?')[0];
      if (window.location.pathname !== want) navigate(path);
      await poll(
        () => window.location.pathname === want && !!document.querySelector('main h1'),
        o,
        '화면을 여는 데 시간이 오래 걸려요.',
      );
      // 화면을 옮긴 뒤 제목으로 가는 포커스(useRouteFocus)가 끝나기를 잠깐 기다린다.
      await wait(250);
    },

    async waitRoute(route: RegExp, o: FindOptions) {
      await poll(() => route.test(window.location.pathname), o, '다음 화면으로 넘어가지 않았어요.');
      await wait(250);
    },

    text(target: Target) {
      const el = query(target);
      if (!el) return '';
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value;
      return el.textContent ?? '';
    },

    exists(target: Target) {
      return query(target) !== null;
    },

    isDisabled(target: Target) {
      const el = query(target);
      return !!el && ((el as HTMLButtonElement).disabled === true || el.getAttribute('aria-disabled') === 'true');
    },
  };
}
