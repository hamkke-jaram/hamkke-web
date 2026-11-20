/*
 * 화면 아래를 돌아다니는 모찌(MochiBuddy)의 움직임 계산. 화면과 떨어진 순수 함수라 그대로 시험한다.
 *
 * 좌표: x = 모찌 가운데의 가로 위치(px, 바닥 줄 왼쪽 끝 기준), y = 바닥에서 띄운 높이(px, 위가 +).
 * 속도도 같은 방향(vy > 0이면 올라간다). 시간은 초.
 *
 * 만화 영화처럼 보이도록 애니메이션 원칙을 따른다.
 * - 찌그러짐·늘어남: 땅에 닿으면 납작해졌다가 출렁이며 돌아온다(감쇠 용수철 squash).
 * - 예비 동작: 뛰기 전에 한 번 웅크린다(crouch).
 * - 따라오는 움직임: 기울기도 용수철이라 멈출 때 한 번 더 넘어갔다 돌아온다. 들고 있으면 진자처럼 흔들린다.
 * - 표정: 눈을 깜빡이고, 가는 쪽·주위를 쳐다보고, 누르면 웃고(^^), 자면 감고, 세게 던지면 어지러워한다(@@).
 * - 쉬는 동안 할 일: 걸어가기, 제자리 뜀, 춤, 잠깐 졸기.
 * 겉모양만 바꾸는 우연(깜빡임·두리번)은 rand를 쓰지 않고 정해진 수열을 쓴다(시험에서 rand 순서를 흔들지 않게).
 */

export type BuddyMode = 'idle' | 'walk' | 'crouch' | 'air' | 'drag' | 'sleep' | 'dance';
export type BuddyEyes = 'open' | 'closed' | 'happy' | 'dizzy';

export interface BuddyBounds {
  /** 모찌 가운데가 갈 수 있는 가장 왼쪽·오른쪽(px). */
  minX: number;
  maxX: number;
  /** 바닥에서 띄울 수 있는 가장 높은 곳(px). 화면 위쪽 끝. */
  ceil: number;
}

export interface BuddyState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  mode: BuddyMode;
  /** 걸어서(뛰어서) 갈 곳. */
  targetX: number;
  /** 지금 상태가 끝날 때까지 남은 시간(멈춤·다음 뜀·웅크림·잠·춤). */
  timer: number;
  /** 땅에 내려앉은 뒤 걷기를 이어 갈지. */
  walking: boolean;
  /** 웅크렸다가 뛸 세기. 0이면 걷기 뜀. */
  pendingVy: number;
  pendingVx: number;
  /** 납작한 정도(+ 납작, - 길쭉)와 그 속도. 감쇠 용수철. */
  squash: number;
  squashV: number;
  /** 기울기(도)와 그 속도. 감쇠 용수철이라 한 번 더 넘어갔다 돌아온다. */
  lean: number;
  leanV: number;
  /** 숨쉬기·춤 같은 반복 움직임에 쓰는 시계. */
  clock: number;
  /** 손으로 세게 던졌는지(내려앉을 때 어지러워한다). */
  thrown: boolean;
  /** 남은 어지러움·웃음 시간(초). */
  dizzy: number;
  joy: number;
  /** 다음 깜빡임까지, 감고 있는 남은 시간. */
  blinkIn: number;
  blinkLeft: number;
  /** 눈동자 방향(-1 왼쪽 ~ 1 오른쪽, -1 위 ~ 1 아래)과 두리번거림. */
  lookX: number;
  lookY: number;
  lookTarget: number;
  lookIn: number;
  /** 이번에 땅에 닿은 세기(px/s). 그리는 쪽이 먼지를 피우고 0으로 돌린다. */
  impact: number;
  /** 자다가 놀라 깼는지. 그리는 쪽이 '!'를 띄우고 false로 돌린다. */
  woke: boolean;
  /** 겉모양용 수열 번호. */
  seq: number;
}

export interface BuddyPose {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotate: number;
  /** 바닥 그림자 크기(0~1)와 진하기(0~1). 높이 뜰수록 작고 옅다. */
  shadowScale: number;
  shadowOpacity: number;
  eyes: BuddyEyes;
  lookX: number;
  lookY: number;
  /** 머리 위에 별이 도는지(어지러움), 졸고 있는지. */
  stars: boolean;
  sleeping: boolean;
}

export const GRAVITY = 2600;
/** 걸을 때 한 번 뛰는 세기와 가로 속도. 한 번에 약 35px 뜨고 약 45px 옮겨 간다. */
export const HOP_VY = 420;
export const HOP_VX = 140;
/** 눌렀을 때 뛰는 세기(약 140px). 공중에서 한 번 더 누르면 조금 낮게 한 번 더 뛴다. */
export const TAP_VY = 860;
export const AIR_TAP_VY = 620;
/** 던졌을 때 속도 한계. 너무 세게 던져도 화면 밖으로 튀지 않게. */
export const MAX_THROW = 1800;
/** 이보다 빨리 놓으면 '던진 것'. 그렇게 날아가 세게 떨어지면 어지러워한다. */
const THROW_SPEED = 700;
const DIZZY_IMPACT = 1100;
const DIZZY_TIME = 2.4;

const SPRING_K = 380;
const SPRING_C = 13;
const LEAN_K = 90;
const LEAN_C = 9;
/** 이보다 세게 떨어지면 한 번 더 튀어 오른다. */
const BOUNCE_MIN = 650;
const BOUNCE_KEEP = 0.33;
const WALL_KEEP = 0.5;
const MAX_FALL = 2800;

export type Rand = () => number;
/** 그 자리(가운데 x)에 서도 되는지. 아래에 버튼·링크가 있으면 false. 모르면 늘 true. */
export type IsFree = (x: number) => boolean;
const anywhere: IsFree = () => true;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function between(rand: Rand, lo: number, hi: number) {
  return lo + rand() * (hi - lo);
}

/** 겉모양용 수열(0~1). 같은 n이면 늘 같은 값. */
function noise(n: number) {
  const v = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return v - Math.floor(v);
}

/** 처음 나타날 때: 화면 위쪽 어딘가에서 떨어진다. */
export function spawnBuddy(b: BuddyBounds, rand: Rand = Math.random): BuddyState {
  const x = b.minX + rand() * Math.max(0, b.maxX - b.minX);
  return {
    x,
    y: Math.max(0, b.ceil * 0.6),
    vx: 0,
    vy: 0,
    mode: 'air',
    targetX: x,
    timer: 0,
    walking: false,
    pendingVy: 0,
    pendingVx: 0,
    squash: 0,
    squashV: 0,
    lean: 0,
    leanV: 0,
    clock: rand() * 10,
    thrown: false,
    dizzy: 0,
    joy: 0,
    blinkIn: 1.5,
    blinkLeft: 0,
    lookX: 0,
    lookY: 0.4,
    lookTarget: 0,
    lookIn: 1,
    impact: 0,
    woke: false,
    seq: Math.floor(x),
  };
}

function toIdle(s: BuddyState, rand: Rand) {
  s.mode = 'idle';
  s.walking = false;
  s.vx = 0;
  s.vy = 0;
  s.timer = between(rand, 1.2, 3.6);
}

function hopInPlace(s: BuddyState) {
  s.walking = false;
  s.mode = 'crouch';
  s.timer = 0.1;
  s.targetX = s.x;
  s.squashV += 1.6;
}

/** 멈춰 있다가 다음에 할 일: 대개는 다른 곳으로 걸어가고, 가끔 졸거나 춤추거나 제자리에서 한 번 뛴다. */
function nextAction(s: BuddyState, b: BuddyBounds, rand: Rand, free: IsFree) {
  const span = b.maxX - b.minX;
  if (span < 40) return hopInPlace(s);
  const r = rand();
  // 제자리에서 하는 일은 아래에 누를 것이 없을 때만(버튼 위에서 오래 머물지 않게).
  if (r < 0.28 && free(s.x)) {
    if (r < 0.07) {
      s.mode = 'sleep';
      s.timer = between(rand, 7, 11);
      return;
    }
    if (r < 0.15) {
      s.mode = 'dance';
      s.timer = 1.9;
      s.joy = 1.9;
      return;
    }
    return hopInPlace(s);
  }
  // 지금 자리에서 너무 가깝지 않고, 아래에 누를 것이 없는 곳을 고른다.
  // 그런 곳이 없으면(화면 폭 전체 버튼 위) 가운데 글자를 덜 가리도록 가장자리로 간다.
  const far = Math.min(80, span / 3);
  let t = s.x;
  let fallback: number | null = null;
  for (let i = 0; i < 6; i++) {
    const c = between(rand, b.minX, b.maxX);
    if (Math.abs(c - s.x) < far) continue;
    fallback ??= c;
    if (free(c)) {
      t = c;
      fallback = null;
      break;
    }
  }
  if (fallback !== null) t = fallback < (b.minX + b.maxX) / 2 ? b.minX : b.maxX;
  if (t === s.x) t = s.x < (b.minX + b.maxX) / 2 ? b.maxX : b.minX;
  s.targetX = t;
  s.walking = true;
  s.mode = 'walk';
  s.timer = 0;
}

/** 웅크렸던 몸을 펴며 뛰어오른다. */
function launch(s: BuddyState) {
  if (s.pendingVy > 0) {
    s.vy = s.pendingVy;
    s.vx = s.pendingVx;
    s.pendingVy = 0;
    s.pendingVx = 0;
    s.squashV -= 3.4;
  } else {
    const dist = s.targetX - s.x;
    // 떠 있는 시간 동안 남은 거리만큼만 가도록(목표를 지나치지 않게).
    const airtime = (2 * HOP_VY) / GRAVITY;
    s.vx = s.walking ? Math.sign(dist) * Math.min(HOP_VX, Math.abs(dist) / airtime) : 0;
    s.vy = HOP_VY;
    s.squashV -= 2.6;
  }
  s.y = 0.01;
  s.mode = 'air';
}

/** 땅에 닿았을 때. 세게 떨어졌으면 한 번 더 튀고, 아니면 내려앉는다. */
function land(s: BuddyState, rand: Rand) {
  const impact = -s.vy;
  s.y = 0;
  s.impact = Math.max(s.impact, impact);
  // 닿는 순간 바로 납작해지고(세게 떨어질수록 더), 용수철이 출렁이며 되돌린다.
  s.squash = Math.max(s.squash, Math.min(0.38, impact * 0.00018));
  s.squashV += Math.min(3, impact * 0.0012);
  if (s.thrown && impact > DIZZY_IMPACT) s.dizzy = DIZZY_TIME;
  if (impact > BOUNCE_MIN) {
    s.vy = impact * BOUNCE_KEEP;
    s.vx *= 0.6;
    return;
  }
  s.vy = 0;
  s.vx = 0;
  s.thrown = false;
  if (s.walking) {
    s.mode = 'walk';
    s.timer = 0.16;
  } else {
    toIdle(s, rand);
    // 어지러운 동안은 그 자리에서 비틀거린다.
    s.timer = Math.max(s.timer, s.dizzy);
  }
}

/** 깜빡임·두리번. 겉모양만 바꾸므로 rand 대신 정해진 수열을 쓴다. */
function stepFace(s: BuddyState, dt: number) {
  s.joy = Math.max(0, s.joy - dt);
  s.dizzy = Math.max(0, s.dizzy - dt);
  if (s.blinkLeft > 0) s.blinkLeft = Math.max(0, s.blinkLeft - dt);
  else {
    s.blinkIn -= dt;
    if (s.blinkIn <= 0) {
      s.seq++;
      s.blinkLeft = 0.13;
      // 가끔은 두 번 연달아 깜빡인다.
      s.blinkIn = noise(s.seq + 0.5) < 0.22 ? 0.28 : 2.2 + 3 * noise(s.seq);
    }
  }
  s.lookIn -= dt;
  if (s.lookIn <= 0) {
    s.seq++;
    const n = noise(s.seq * 1.7);
    s.lookTarget = n < 0.3 ? -1 : n < 0.6 ? 1 : 0;
    s.lookIn = 1.1 + 2.2 * noise(s.seq * 2.3);
  }
  let tx = s.lookTarget;
  let ty = 0;
  if (s.mode === 'drag') {
    tx = clamp(s.vx / 600, -1, 1);
    ty = 1; // 들리면 아래(땅)를 내려다본다
  } else if (s.walking) tx = Math.sign(s.targetX - s.x);
  else if (s.mode === 'air') ty = s.vy > 0 ? -0.6 : 0.6;
  else if (s.mode === 'sleep') tx = 0;
  const k = Math.min(1, dt * 9);
  s.lookX += (tx - s.lookX) * k;
  s.lookY += (ty - s.lookY) * k;
}

/**
 * dt초만큼 움직인다. s를 고쳐서 그대로 돌려준다(한 장면에 여러 번 부르지 않으므로 새로 만들지 않는다).
 * dt는 1/20초를 넘지 않게 자른다(다른 탭에 다녀오면 시간이 크게 벌어진다).
 */
export function stepBuddy(s: BuddyState, dt: number, b: BuddyBounds, rand: Rand = Math.random, free: IsFree = anywhere): BuddyState {
  dt = clamp(dt, 0, 0.05);
  s.clock += dt;

  // 말랑한 출렁임(감쇠 용수철).
  s.squashV += (-SPRING_K * s.squash - SPRING_C * s.squashV) * dt;
  s.squash = clamp(s.squash + s.squashV * dt, -0.35, 0.45);

  // 기울기: 가는 쪽으로 기울고, 들고 있으면 진자처럼 뒤처지고, 춤추면 좌우로, 어지러우면 비틀.
  let leanTarget = 0;
  if (s.mode === 'drag') leanTarget = clamp(s.vx * 0.03, -28, 28);
  else if (s.mode === 'air') leanTarget = clamp(s.vx * 0.05, -14, 14);
  else if (s.mode === 'dance') leanTarget = 14 * Math.sin(s.clock * 2 * Math.PI * 1.6);
  else if (s.dizzy > 0) leanTarget = 9 * Math.sin(s.clock * 2 * Math.PI * 0.9);
  s.leanV += (LEAN_K * (leanTarget - s.lean) - LEAN_C * s.leanV) * dt;
  s.lean = clamp(s.lean + s.leanV * dt, -35, 35);

  stepFace(s, dt);

  if (s.mode === 'drag') return s; // 위치는 손가락이 정한다

  // 벽이 좁아져(화면 크기 바뀜) 밖에 있게 되면 안으로 넣는다.
  s.x = clamp(s.x, b.minX, Math.max(b.minX, b.maxX));
  s.targetX = clamp(s.targetX, b.minX, Math.max(b.minX, b.maxX));

  if (s.mode === 'air') {
    s.vy = Math.max(-MAX_FALL, s.vy - GRAVITY * dt);
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    if (s.x < b.minX) {
      s.x = b.minX;
      s.vx = Math.abs(s.vx) * WALL_KEEP;
    } else if (s.x > b.maxX) {
      s.x = b.maxX;
      s.vx = -Math.abs(s.vx) * WALL_KEEP;
    }
    if (s.y > b.ceil) {
      s.y = b.ceil;
      s.vy = -Math.abs(s.vy) * 0.3;
    }
    if (s.y <= 0 && s.vy <= 0) land(s, rand);
    return s;
  }

  s.y = 0;
  s.timer -= dt;
  if (s.timer > 0) return s;
  switch (s.mode) {
    case 'idle':
      nextAction(s, b, rand, free);
      break;
    case 'walk':
      if (Math.abs(s.targetX - s.x) < 6) toIdle(s, rand);
      else {
        s.mode = 'crouch';
        s.timer = 0.07;
        s.squashV += 1.4;
      }
      break;
    case 'crouch':
      launch(s);
      break;
    case 'sleep':
      // 기지개 켜듯 길게 늘어나며 깬다.
      toIdle(s, rand);
      s.squashV -= 2.2;
      break;
    case 'dance':
      toIdle(s, rand);
      break;
  }
  return s;
}

/**
 * 누르면 뛴다. 땅 위에서는 한 번 웅크렸다가(예비 동작) 뛰고 웃는다. 공중이면 조금 낮게 한 번 더.
 * 자고 있었으면 놀라서 바로 튀어 오른다(woke). 들고 있는 동안은 무시한다.
 */
export function tapBuddy(s: BuddyState, rand: Rand = Math.random): BuddyState {
  if (s.mode === 'drag') return s;
  s.walking = false;
  if (s.mode === 'sleep') {
    s.woke = true;
    s.vy = TAP_VY * 0.85;
    s.vx = 0;
    s.y = 0.01;
    s.mode = 'air';
    s.squashV -= 3.6;
    return s;
  }
  if (s.mode === 'air') {
    s.vy = Math.max(s.vy, 0) + AIR_TAP_VY;
    s.vx = between(rand, -90, 90);
    s.squashV -= 3;
    s.joy = 1;
    return s;
  }
  s.mode = 'crouch';
  s.timer = 0.09;
  s.squashV += 3.2;
  s.pendingVy = TAP_VY;
  s.pendingVx = between(rand, -90, 90);
  s.joy = 1.1;
  return s;
}

/** 땅 위에서 쉬고 있으면 x 쪽으로 뛰어간다(아래에 버튼이 와서 비켜 줄 때). */
export function moveBuddyTo(s: BuddyState, x: number): BuddyState {
  if (s.mode !== 'idle' && s.mode !== 'sleep' && s.mode !== 'dance') return s;
  s.targetX = x;
  s.walking = true;
  s.mode = 'walk';
  s.timer = 0;
  return s;
}

/** 가까운 쪽 가장자리. 비킬 곳이 없을 때 버튼 가운데 글자를 덜 가리려고 간다. */
export function nearestEdge(x: number, b: BuddyBounds): number {
  return x - b.minX <= b.maxX - x ? b.minX : b.maxX;
}

/** 아래에 누를 것이 없는 가장 가까운 자리. 없으면 null. */
export function nearestFree(x: number, b: BuddyBounds, free: IsFree, step = 16): number | null {
  if (free(x)) return x;
  for (let d = step; d <= b.maxX - b.minX; d += step) {
    if (x - d >= b.minX && free(x - d)) return x - d;
    if (x + d <= b.maxX && free(x + d)) return x + d;
  }
  return null;
}

/** 화면이 바뀌었을 때 반기듯 제자리에서 작게 한 번 뛴다. 땅 위에 있을 때만(자고 있었으면 깬다). */
export function cheerBuddy(s: BuddyState): BuddyState {
  if (s.mode === 'drag' || s.mode === 'air') return s;
  s.walking = false;
  s.vx = 0;
  s.vy = 520;
  s.y = 0.01;
  s.mode = 'air';
  s.squashV -= 2.4;
  s.joy = 0.8;
  return s;
}

/** 손가락으로 집어 들었을 때. 매달린 듯 조금 늘어난다(자고 있었으면 깬다). */
export function grabBuddy(s: BuddyState): BuddyState {
  s.mode = 'drag';
  s.walking = false;
  s.pendingVy = 0;
  s.vx = 0;
  s.vy = 0;
  s.squashV -= 2;
  return s;
}

/** 들고 있는 동안 위치를 옮긴다. vx는 기울기(진자)와 눈동자에 쓴다. */
export function dragBuddyTo(s: BuddyState, x: number, y: number, vx: number, b: BuddyBounds): BuddyState {
  s.x = clamp(x, b.minX, Math.max(b.minX, b.maxX));
  s.y = clamp(y, 0, Math.max(0, b.ceil));
  s.vx = vx;
  return s;
}

/** 놓았을 때. 손을 움직이던 속도 그대로 날아간다(던지기). */
export function releaseBuddy(s: BuddyState, vx: number, vy: number): BuddyState {
  s.mode = 'air';
  s.walking = false;
  s.vx = clamp(vx, -MAX_THROW, MAX_THROW);
  s.vy = clamp(vy, -MAX_THROW, MAX_THROW);
  s.thrown = Math.hypot(s.vx, s.vy) > THROW_SPEED;
  if (s.y <= 0) s.y = 0.01;
  return s;
}

/** 지금 상태를 그릴 모양으로 바꾼다. */
export function buddyPose(s: BuddyState): BuddyPose {
  const grounded = s.y === 0;
  let breath = 0;
  if (s.mode === 'idle' && grounded) breath = Math.sin((s.clock * 2 * Math.PI) / 2.6) * 0.03;
  else if (s.mode === 'sleep') breath = Math.sin((s.clock * 2 * Math.PI) / 3.4) * 0.06 - 0.03; // 깊고 느리게, 조금 늘어져서
  // 춤: 박자에 맞춰 통통.
  const bob = s.mode === 'dance' ? Math.abs(Math.sin(s.clock * 2 * Math.PI * 1.6)) * 0.07 : 0;
  // 빨리 오르내릴수록 세로로 늘어난다. 들고 있으면 매달린 듯 늘어난다.
  const stretch = s.mode === 'drag' ? 0.1 : s.mode === 'air' ? clamp(Math.abs(s.vy) / 5000, 0, 0.14) : 0;
  const scaleY = clamp(1 - s.squash + stretch + breath + bob, 0.6, 1.35);
  const scaleX = clamp(1 + s.squash * 0.9 - stretch * 0.7 - breath * 0.8 - bob * 0.6, 0.7, 1.45);
  const h = Math.max(0, s.y);
  let eyes: BuddyEyes = 'open';
  if (s.dizzy > 0) eyes = 'dizzy';
  else if (s.mode === 'sleep') eyes = 'closed';
  else if (s.joy > 0 || s.mode === 'dance') eyes = 'happy';
  else if (s.blinkLeft > 0 || (s.mode === 'crouch' && s.pendingVy > 0)) eyes = 'closed';
  return {
    x: s.x,
    y: h,
    scaleX,
    scaleY,
    rotate: s.lean,
    shadowScale: 1 - Math.min(h / 320, 0.65),
    shadowOpacity: 1 - Math.min(h / 420, 0.75),
    eyes,
    lookX: s.lookX,
    lookY: s.lookY,
    stars: s.dizzy > 0,
    sleeping: s.mode === 'sleep',
  };
}
