import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { haptic } from '../native';
import { BuddyFace, EYE_RIG, paintFace } from './BuddyFace';
import { buddy } from './buddyBus';
import { MASCOT_RATIO, mascotSrc, type MascotName } from './Mascot';
import {
  buddyPose,
  cheerBuddy,
  dragBuddyTo,
  grabBuddy,
  moveBuddyTo,
  nearestEdge,
  nearestFree,
  releaseBuddy,
  signalBuddy,
  spawnBuddy,
  stepBuddy,
  tapBuddy,
  type BuddyBounds,
  type BuddyState,
} from './buddyPhysics';
import './buddy.css';

/*
 * 화면 아래를 통통 뛰어다니는 모찌. 꾸밈이라 낭독하지 않고(aria-hidden) 포커스도 받지 않는다.
 * - 혼자서: 숨 쉬듯 쉬다가 다른 곳으로 뛰어가거나, 제자리에서 뛰거나, 춤추거나, 잠깐 존다(Zzz).
 *   눈을 깜빡이고 가는 쪽·주위를 쳐다본다(BuddyFace). 땅에 닿으면 먼지가 인다.
 * - 끌기: 집어서 옮기면 진자처럼 흔들리며 아래를 내려다보고, 놓으면 손을 움직이던 속도로 날아간다(던지기).
 *   세게 던져 떨어지면 머리 위로 별이 돌며 어지러워한다.
 * - 누르기: 웅크렸다가 폴짝 뛰며 웃고(^^) 하트가 떠오른다. 자고 있었으면 놀라 깬다(!).
 * - 화면이 바뀌면 반기듯 한 번 뛴다.
 * - 신호(buddyBus): 보호자·선생님이 저장·보냄 같은 일을 마치면 화면이 buddy.emit()으로 알린다.
 *   축하=크게 폴짝+하트, 응원=두 번 뜀, 인사=손 흔들기, 엿보기=가장자리에서 빼꼼, 생각=머리 위 점 세 개, 졸기.
 *   아이의 지표·기록 내용에는 반응하지 않는다(평가로 읽히지 않게).
 * - 혼자서 더: 한동안(30초) 아무 조작이 없으면 가장자리에서 엿보고, 스크롤이 끝에 닿으면 폴짝,
 *   밤(기기 시각 22~6시)에는 더 자주 존다. 다른 탭에 가 있으면 계산도 멈춘다.
 * - 버튼·링크를 가로막지 않는다: 그 위에 서 있는 동안은 누르면 아래 버튼이 눌리고(모찌는 통과),
 *   쉬는 중이면 아래에 누를 것이 없는 자리로 비켜 간다. 화면 맨 아래에는 모찌 키만큼 여백을 둔다(body.buddy-on).
 * - 입력칸에 글을 쓰는 동안은 숨는다(화면 키보드 위로 떠서 입력칸을 가리지 않게).
 * 움직임 계산은 buddyPhysics.ts. 매 장면 React를 다시 그리지 않고 transform만 바꾼다.
 * 켜고 끄기는 화면 설정 '움직이는 캐릭터'(motion.tsx).
 */

/** 모찌 너비(px). 버튼을 덜 가리도록 작게 둔다. */
const SIZE = 64;
/** 이만큼 덜 움직이고 이 시간 안에 떼면 누른 것으로 본다. */
const TAP_MOVE = 8;
const TAP_MS = 350;
/** 놓을 때 속도를 재는 구간(ms). */
const VELOCITY_WINDOW = 90;
/** 아래에 버튼이 있는지 다시 보는 간격(ms). 스크롤하면 바로 한 번 더 본다. */
const CHECK_MS = 300;
/** 모찌 아래에 있으면 비켜 주는 것들(누르거나 고르는 것). */
const CONTROL = 'a[href], button, input, select, textarea, summary, label, [role="button"], [role="switch"], [role="link"], [tabindex]:not([tabindex="-1"])';

/** 땅에 이보다 세게 닿으면 먼지가 인다(px/s). */
const DUST_IMPACT = 380;
/** 조는 동안 'z'를 띄우는 간격(초). */
const Z_EVERY = 1.1;
/** 이만큼 아무 조작이 없으면 가장자리에서 엿본다. 한 번 엿본 뒤에는 다음까지 더 기다린다(ms). */
const IDLE_PEEK_MS = 30000;
const PEEK_AGAIN_MS = 45000;

/** 기기 시각으로 밤(22~6시)인지. 밤에는 더 자주 존다. */
export function isNight(d = new Date()) {
  const h = d.getHours();
  return h >= 22 || h < 6;
}

const HEART =
  '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.1 4.3 2.4h2c.7-1.3 2.2-2.4 4.3-2.4 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z"/></svg>';

interface Sample {
  t: number;
  x: number;
  y: number;
}

interface Hold {
  id: number;
  t0: number;
  startX: number;
  startY: number;
  /** 손가락과 모찌 가운데의 가로 거리, 손가락과 모찌 발바닥의 세로 거리. 집은 자리 그대로 들고 다닌다. */
  offX: number;
  offBottom: number;
  moved: boolean;
  samples: Sample[];
}

function velocity(samples: Sample[]) {
  if (samples.length < 2) return { x: 0, y: 0 };
  const a = samples[0];
  const b = samples[samples.length - 1];
  const dt = (b.t - a.t) / 1000;
  if (dt < 0.012) return { x: 0, y: 0 };
  return { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt };
}

const TEXT_INPUT_SKIP = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image']);

/** 글을 쓰는 칸인지(화면 키보드가 올라오는 칸). */
function isTextField(el: Element | null) {
  if (!(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLInputElement) return !TEXT_INPUT_SKIP.has(el.type);
  return el.matches('textarea, select') || el.isContentEditable;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const r4 = (v: number) => Math.round(v * 10000) / 10000;

export interface MochiBuddyProps {
  /** 어떤 모찌가 다닐지. 기본 버터빛 모찌. */
  name?: MascotName;
  /** 바뀌면 반기듯 한 번 뛴다(보통 지금 화면 주소). */
  hopKey?: string;
}

export default function MochiBuddy({ name = 'dome', hopKey }: MochiBuddyProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const squishRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  const faceRef = useRef<SVGSVGElement>(null);
  const state = useRef<BuddyState | null>(null);
  const hold = useRef<Hold | null>(null);
  /** 그 자리에 서도 되는지(아래에 버튼이 없는지). 걸어갈 곳을 고를 때 쓴다. */
  const freeRef = useRef<(x: number) => boolean>(() => true);
  const [failed, setFailed] = useState(false);
  const height = Math.round(SIZE * MASCOT_RATIO[name]);

  /** 바닥 줄의 화면 위치와 모찌가 다닐 수 있는 범위. 앱 화면 폭(최대 560px) 안에서만 다닌다. */
  const measure = (): { bounds: BuddyBounds; ground: number } => {
    const layer = layerRef.current;
    const ground = layer ? layer.getBoundingClientRect().top : window.innerHeight;
    const app = document.querySelector('.app')?.getBoundingClientRect();
    const left = app ? Math.max(0, app.left) : 0;
    const right = app ? Math.min(window.innerWidth, app.right) : window.innerWidth;
    const pad = SIZE / 2 + 6;
    return {
      bounds: { minX: left + pad, maxX: Math.max(left + pad, right - pad), ceil: Math.max(0, ground - height - 4) },
      ground,
    };
  };

  /** 가운데가 x일 때 모찌 몸 아래(왼쪽·가운데·오른쪽, 위·아래)에 누를 것이 없는지. */
  const isFree = (x: number, ground = measure().ground) => {
    const layer = layerRef.current;
    for (const dx of [-SIZE * 0.38, 0, SIZE * 0.38]) {
      for (const dy of [height * 0.25, height * 0.75]) {
        for (const el of document.elementsFromPoint(x + dx, ground - dy)) {
          if (layer?.contains(el)) continue;
          if (el.closest(CONTROL)) return false;
          break; // 맨 위에 보이는 것만 본다
        }
      }
    }
    return true;
  };

  // 움직임: 한 장면마다 계산하고 transform만 바꾼다. 다른 탭에 가 있으면 브라우저가 멈춰 둔다.
  useEffect(() => {
    if (failed) return;
    let raf = 0;
    let last = performance.now();
    state.current ??= spawnBuddy(measure().bounds);
    let peeking = false;
    const paint = (s: BuddyState) => {
      const p = buddyPose(s);
      // 엿보기: 가장자리 밖(앱 화면 폭 밖)으로 숨었다가 빼꼼. 앱 폭 밖은 잘라서 숨긴다.
      const left = p.x - SIZE / 2 + p.peekShift * (SIZE + 8);
      const layer = layerRef.current;
      if (layer && p.peeking !== peeking) {
        peeking = p.peeking;
        layer.classList.toggle('peeking', peeking);
        if (peeking) {
          const app = document.querySelector('.app')?.getBoundingClientRect();
          const l = app ? Math.max(0, app.left) : 0;
          const r = app ? Math.max(0, window.innerWidth - app.right) : 0;
          layer.style.clipPath = `inset(-100vh ${r2(r)}px -40px ${r2(l)}px)`;
        } else layer.style.clipPath = '';
      }
      layer?.classList.toggle('waving', p.waving);
      layer?.classList.toggle('thinking', p.thinking);
      if (bodyRef.current) bodyRef.current.style.transform = `translate3d(${r2(left)}px, ${r2(-p.y)}px, 0)`;
      if (squishRef.current) squishRef.current.style.transform = `rotate(${r2(p.rotate)}deg) scale(${r4(p.scaleX)}, ${r4(p.scaleY)})`;
      if (shadowRef.current) {
        shadowRef.current.style.transform = `translate3d(${r2(left)}px, 0, 0) scale(${r4(p.shadowScale)})`;
        shadowRef.current.style.opacity = String(r4(p.shadowOpacity));
      }
      paintFace(faceRef.current, name, p.eyes, p.lookX, p.lookY);
      layerRef.current?.classList.toggle('dizzy', p.stars);
      // 한 번씩 생기는 효과: 착지 먼지, 놀라 깸, 조는 동안 z.
      if (s.impact > DUST_IMPACT) dust(s.x, s.impact);
      if (s.impact > 1100) haptic('medium'); // iOS 앱에서 세게 떨어지면 쿵
      s.impact = 0;
      if (s.woke) {
        s.woke = false;
        pop('buddy-bang', '!', s.x, s.y + height);
      }
      if (p.sleeping) {
        if (s.clock - lastZ > Z_EVERY) {
          lastZ = s.clock;
          pop('buddy-z', 'z', s.x + SIZE * 0.25, s.y + height * 0.85);
        }
      }
    };
    let lastZ = 0;
    const frame = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const s = state.current;
      if (s) paint(stepBuddy(s, dt, measure().bounds, Math.random, freeRef.current));
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    // 탭이 안 보이면 멈추고, 돌아오면 그 자리에서 이어 간다(밀린 시간을 한꺼번에 계산하지 않게).
    const onVisible = () => {
      cancelAnimationFrame(raf);
      if (document.hidden) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // measure·dust·pop은 ref와 height만 읽으므로 따로 넣지 않는다.
  }, [failed, height, name]);

  // 버튼·링크를 가로막지 않기: 그 위에 있으면 누름이 아래로 통과하고, 쉬는 중이면 비켜 간다.
  useEffect(() => {
    if (failed) return;
    freeRef.current = (x) => isFree(x);
    // 화면 폭 전체를 덮는 버튼 위라 비킬 곳이 없으면 가장자리로 가고(가운데 글자를 덜 가리게),
    // 잠시 다시 찾지 않는다. 그동안도 누름은 아래 버튼으로 통과한다.
    let stuckUntil = 0;
    // 한동안 조작이 없으면 엿보기. 누르기·키·스크롤·휠을 조작으로 본다.
    let lastActive = performance.now();
    let lastPeek = 0;
    const active = () => {
      lastActive = performance.now();
    };
    const check = () => {
      const s = state.current;
      const layer = layerRef.current;
      if (!s || !layer || hold.current || document.hidden) return;
      const { bounds, ground } = measure();
      s.sleepy = isNight();
      const now0 = performance.now();
      if (s.mode === 'idle' && now0 - lastActive > IDLE_PEEK_MS && now0 - lastPeek > PEEK_AGAIN_MS) {
        lastPeek = now0;
        signalBuddy(s, 'peek', bounds);
        return;
      }
      const over = !isFree(s.x, ground);
      layer.classList.toggle('passthrough', over);
      const now = performance.now();
      if (over && s.mode === 'idle' && now >= stuckUntil) {
        const to = nearestFree(s.x, bounds, (x) => isFree(x, ground), 24);
        if (to !== null) moveBuddyTo(s, to);
        else {
          stuckUntil = now + 2000;
          const edge = nearestEdge(s.x, bounds);
          if (Math.abs(edge - s.x) > 4) moveBuddyTo(s, edge);
        }
      }
    };
    let queued = 0;
    // 스크롤이 끝에 닿으면(내릴 만큼 긴 화면에서) 한 번 폴짝.
    let atEnd = false;
    const scrollEnd = () => {
      const doc = document.documentElement;
      const end = doc.scrollHeight > window.innerHeight + 80 && window.innerHeight + window.scrollY >= doc.scrollHeight - 4;
      if (end && !atEnd && state.current && !hold.current) cheerBuddy(state.current);
      atEnd = end;
    };
    const onScroll = () => {
      active();
      if (!queued) queued = requestAnimationFrame(() => ((queued = 0), check(), scrollEnd()));
    };
    const timer = window.setInterval(check, CHECK_MS);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pointerdown', active, { passive: true });
    window.addEventListener('keydown', active);
    window.addEventListener('wheel', active, { passive: true });
    document.body.classList.add('buddy-on');
    return () => {
      window.clearInterval(timer);
      cancelAnimationFrame(queued);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pointerdown', active);
      window.removeEventListener('keydown', active);
      window.removeEventListener('wheel', active);
      document.body.classList.remove('buddy-on');
      freeRef.current = () => true;
    };
    // isFree·measure는 ref와 height만 읽으므로 따로 넣지 않는다.
  }, [failed, height]);

  // 화면이 바뀌면 한 번 뛴다(처음 나타날 때는 떨어지는 중이라 건너뛴다).
  const firstKey = useRef(true);
  useEffect(() => {
    if (firstKey.current) {
      firstKey.current = false;
      return;
    }
    if (state.current) cheerBuddy(state.current);
  }, [hopKey]);

  // 화면이 보내는 신호(buddyBus). 축하에는 하트를 띄운다(뛰어오른 뒤 머리 위에서).
  useEffect(() => {
    if (failed) return;
    const timers: number[] = [];
    const off = buddy.on((kind) => {
      const s = state.current;
      if (!s || hold.current) return;
      signalBuddy(s, kind, measure().bounds);
      if (kind === 'celebrate') {
        timers.push(window.setTimeout(heart, 220), window.setTimeout(heart, 420));
      }
    });
    return () => {
      off();
      timers.forEach((t) => window.clearTimeout(t));
    };
    // measure·heart는 ref와 height만 읽으므로 따로 넣지 않는다.
  }, [failed, height]);

  // 글을 쓰는 동안은 숨긴다.
  useEffect(() => {
    const update = () => layerRef.current?.classList.toggle('typing', isTextField(document.activeElement));
    const later = () => window.setTimeout(update, 0);
    update();
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', later);
    return () => {
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', later);
    };
  }, []);

  /** 바닥 줄에 잠깐 떠올랐다 사라지는 효과 하나(하트·!·z). x는 가운데, bottom은 바닥에서의 높이. */
  function pop(className: string, content: string, x: number, bottom: number, html = false) {
    const layer = layerRef.current;
    if (!layer) return;
    const el = document.createElement('span');
    el.className = className;
    if (html) el.innerHTML = content;
    else el.textContent = content;
    el.style.left = `${r2(x)}px`;
    el.style.bottom = `${r2(bottom)}px`;
    el.style.setProperty('--drift', `${Math.round((Math.random() - 0.5) * 48)}px`);
    el.addEventListener('animationend', () => el.remove());
    layer.appendChild(el);
  }

  /** 착지 먼지: 발 양쪽으로 퍼지는 작은 구름 두 개. 세게 떨어질수록 크다. */
  function dust(x: number, impact: number) {
    const size = Math.round(Math.min(22, 8 + impact / 120));
    for (const side of [-1, 1]) {
      const layer = layerRef.current;
      if (!layer) return;
      const el = document.createElement('span');
      el.className = 'buddy-dust';
      el.style.left = `${r2(x + side * SIZE * 0.3)}px`;
      el.style.width = el.style.height = `${size}px`;
      el.style.setProperty('--dir', String(side));
      el.addEventListener('animationend', () => el.remove());
      layer.appendChild(el);
    }
  }

  const heart = () => {
    const s = state.current;
    if (s) pop('buddy-heart', HEART, s.x, s.y + height * 0.8, true);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = state.current;
    if (!s || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault(); // 그림 끌기·글자 고르기가 시작되지 않게
    try {
      // 손가락이 모찌 밖으로 빨리 나가도 계속 따라오게.
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* 이미 끝난 누름이면 잡지 못한다. 잡지 못해도 모찌 위에서는 그대로 움직인다. */
    }
    const { ground } = measure();
    const now = performance.now();
    hold.current = {
      id: e.pointerId,
      t0: now,
      startX: e.clientX,
      startY: e.clientY,
      offX: e.clientX - s.x,
      offBottom: ground - s.y - e.clientY,
      moved: false,
      samples: [{ t: now, x: e.clientX, y: e.clientY }],
    };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const h = hold.current;
    const s = state.current;
    if (!h || !s || e.pointerId !== h.id) return;
    const now = performance.now();
    h.samples.push({ t: now, x: e.clientX, y: e.clientY });
    while (h.samples.length > 2 && now - h.samples[0].t > VELOCITY_WINDOW) h.samples.shift();
    if (!h.moved) {
      if (Math.hypot(e.clientX - h.startX, e.clientY - h.startY) < TAP_MOVE) return;
      h.moved = true;
      grabBuddy(s);
      layerRef.current?.classList.add('dragging');
    }
    const { bounds, ground } = measure();
    dragBuddyTo(s, e.clientX - h.offX, ground - (e.clientY + h.offBottom), velocity(h.samples).x, bounds);
  };

  const finish = (e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const h = hold.current;
    const s = state.current;
    if (!h || !s || e.pointerId !== h.id) return;
    hold.current = null;
    layerRef.current?.classList.remove('dragging');
    if (h.moved) {
      const v = cancelled ? { x: 0, y: 0 } : velocity(h.samples);
      releaseBuddy(s, v.x, -v.y); // 화면 좌표는 아래가 +, 모찌 좌표는 위가 +
    } else if (!cancelled && performance.now() - h.t0 < TAP_MS) {
      const wasAsleep = s.mode === 'sleep';
      tapBuddy(s);
      haptic('light');
      if (!wasAsleep) heart(); // 자다 깨면 하트 대신 '!'(그리는 쪽이 띄운다)
    }
  };

  if (failed) return null;
  return (
    <div className="buddy-layer" ref={layerRef} aria-hidden="true">
      <div className="buddy-shadow" ref={shadowRef} style={{ width: SIZE }} />
      <div className="buddy" ref={bodyRef} style={{ width: SIZE }}>
        <div
          className="buddy-squish"
          ref={squishRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => finish(e, false)}
          onPointerCancel={(e) => finish(e, true)}
          onLostPointerCapture={(e) => finish(e, true)}
        >
          <img src={mascotSrc(name)} alt="" width={SIZE} height={height} draggable={false} decoding="async" onError={() => setFailed(true)} />
          <BuddyFace name={name} svgRef={faceRef} />
          {/* 인사할 때 흔드는 손(몸 색 동그라미). 평소에는 숨어 있다. */}
          <span className="buddy-hand" style={{ background: EYE_RIG[name]?.body ?? '#fddc96', bottom: Math.round(height * 0.45) }} />
        </div>
        {/* 생각할 때 머리 위 점 세 개 */}
        <div className="buddy-think" style={{ bottom: height + 4 }}>
          <span />
          <span />
          <span />
        </div>
        {/* 어지러울 때 머리 위를 도는 별. 몸이 찌그러져도 별은 그대로이게 squish 밖에 둔다. */}
        <div className="buddy-stars" style={{ bottom: height + 2 }}>
          <span>★</span>
          <span>★</span>
          <span>★</span>
        </div>
      </div>
    </div>
  );
}
