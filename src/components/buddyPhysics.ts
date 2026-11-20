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

export type BuddyMode = 'idle' | 'walk' | 'crouch' | 'air' | 'drag' | 'sleep' | 'dance' | 'wave' | 'think' | 'peek';
/** 공중에 있어서 바로 못 한 일. 내려앉으면 한다(buddyBus 신호, 엿보기). */
export type BuddyQueued = 'wave' | 'think' | 'sleep' | 'peek' | null;
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
  /** 응원(cheer): 내려앉은 뒤 한 번 더 뛸 횟수. */
  hopsLeft: number;
  /** 밤(기기 시각 22~6시)이면 true. 쉬는 동안 더 자주, 더 오래 존다. 그리는 쪽이 정한다. */
  sleepy: boolean;
  /** 공중에서 받은 신호. 내려앉으면 한다. */
  queued: BuddyQueued;
  /** 엿보기 쪽(-1 왼쪽, 1 오른쪽). 0이면 엿보지 않는다. 가장자리로 걸어가는 동안에도 정해져 있다. */
  peekSide: -1 | 0 | 1;
  /** 엿보기를 시작한 뒤 흐른 시간(초). */
  peekT: number;
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
  /** 손 흔드는 중, 생각하는 중(머리 위 점 세 개). */
  waving: boolean;
  thinking: boolean;
  /** 엿보기: 가장자리 밖으로 숨은 정도(몸 너비 배수, 쪽 부호 포함). 그리는 쪽이 몸 너비를 곱해 x에 더한다. */
  peekShift: number;
  peeking: boolean;
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
/** 응원(cheer) 한 번 뛰는 세기(약 60px). */
export const CHEER_VY = 560;
/** 엿보기 한 번의 길이(초): 숨기 → 숨어 있기 → 빼꼼 → 쳐다보기 → 나오기. */
export const PEEK_TIME = 3.8;
/** 빼꼼 내민 동안 밖에 숨어 있는 몸의 비율. */
const PEEK_HIDDEN = 0.42;
const WAVE_TIME = 1.8;
const THINK_TIME = 2.6;

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
    hopsLeft: 0,
    sleepy: false,
    queued: null,
    peekSide: 0,
    peekT: 0,
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
  // 밤에는 쉬는 동안 할 일의 절반쯤이 졸기다(더 오래).
  const sleepCut = s.sleepy ? 0.18 : 0.07;
  if (r < 0.28 && free(s.x)) {
    if (r < sleepCut) {
      s.mode = 'sleep';
      s.timer = s.sleepy ? between(rand, 12, 18) : between(rand, 7, 11);
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
  if (s.hopsLeft > 0) {
    s.hopsLeft--;
    s.walking = false;
    s.mode = 'crouch';
    s.timer = 0.08;
    s.pendingVy = CHEER_VY;
    s.pendingVx = 0;
    s.joy = Math.max(s.joy, 0.8);
    return;
  }
  if (s.queued && s.dizzy <= 0) {
    const q = s.queued;
    s.queued = null;
    if (q === 'peek' && s.peekSide !== 0) {
      // 가까운 가장자리까지 걸어가서 엿본다.
      s.mode = 'walk';
      s.walking = true;
      s.timer = 0.16;
      return;
    }
    startAct(s, q);
    return;
  }
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
  else if (s.mode === 'think') {
    tx = 0.7;
    ty = -1; // 위를 올려다보며 생각
  } else if (s.mode === 'peek') {
    tx = -s.peekSide; // 화면 안쪽을 쳐다본다
    ty = 0;
  }
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
  else if (s.mode === 'wave') leanTarget = 7 * Math.sin(s.clock * 2 * Math.PI * 1.8);
  else if (s.mode === 'think') leanTarget = 6;
  else if (s.mode === 'peek') leanTarget = -s.peekSide * 16 * peekOut(s.peekT);
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
  if (s.mode === 'peek') s.peekT += dt;
  s.timer -= dt;
  if (s.timer > 0) return s;
  switch (s.mode) {
    case 'idle':
      nextAction(s, b, rand, free);
      break;
    case 'walk':
      if (Math.abs(s.targetX - s.x) < 6) {
        if (s.peekSide !== 0) startAct(s, 'peek');
        else toIdle(s, rand);
      }
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
    case 'wave':
    case 'think':
      toIdle(s, rand);
      break;
    case 'peek':
      // 다 나와서 반갑게 웃는다.
      s.peekSide = 0;
      s.peekT = 0;
      toIdle(s, rand);
      s.joy = 0.9;
      s.squashV -= 1.6;
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
  s.peekSide = 0;
  s.peekT = 0;
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
  s.peekSide = 0;
  s.peekT = 0;
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
  s.peekSide = 0;
  s.peekT = 0;
  s.queued = null;
  s.hopsLeft = 0;
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

/** 땅 위에서 바로 시작하는 동작(손 흔들기·생각·졸기·엿보기). */
function startAct(s: BuddyState, act: Exclude<BuddyQueued, null>) {
  s.vx = 0;
  s.vy = 0;
  s.walking = false;
  if (act === 'wave') {
    s.mode = 'wave';
    s.timer = WAVE_TIME;
    s.joy = WAVE_TIME;
  } else if (act === 'think') {
    s.mode = 'think';
    s.timer = THINK_TIME;
  } else if (act === 'sleep') {
    s.mode = 'sleep';
    s.timer = s.sleepy ? 14 : 8;
  } else {
    if (s.peekSide === 0) s.peekSide = -1;
    s.mode = 'peek';
    s.peekT = 0;
    s.timer = PEEK_TIME;
  }
}

/** 땅 위라서 바로 다른 동작으로 바꿔도 되는지. 공중·웅크림이면 내려앉은 뒤에 한다. */
function grounded(s: BuddyState) {
  return s.mode === 'idle' || s.mode === 'walk' || s.mode === 'sleep' || s.mode === 'dance' || s.mode === 'wave' || s.mode === 'think';
}

export type BuddySignal = 'celebrate' | 'cheer' | 'wave' | 'peek' | 'think' | 'sleep';

/**
 * buddyBus 신호에 맞춰 움직인다(보호자·선생님이 저장·보냄 같은 일을 마쳤을 때).
 * - celebrate: 크게 폴짝(하트는 그리는 쪽이 띄운다). cheer: 작게 두 번 뜀.
 * - wave: 손 흔들기, think: 위를 보며 생각(점 세 개), sleep: 졸기, peek: 가까운 가장자리에서 빼꼼.
 * 들고 있는 동안은 무시한다. 공중이면 내려앉은 뒤에 한다(뛰기는 공중에서 한 번 더 뛴다).
 */
export function signalBuddy(s: BuddyState, kind: BuddySignal, b: BuddyBounds): BuddyState {
  if (s.mode === 'drag') return s;
  if (kind !== 'peek' && s.mode === 'peek') {
    // 엿보던 중이면 그 자리(가장자리)에서 바로 나와서 한다.
    s.peekSide = 0;
    s.peekT = 0;
    s.mode = 'idle';
  }
  if (kind === 'celebrate' || kind === 'cheer') {
    s.queued = null;
    s.hopsLeft = kind === 'cheer' ? 1 : 0;
    s.joy = Math.max(s.joy, kind === 'celebrate' ? 1.4 : 1.6);
    if (s.mode === 'air') {
      s.vy = Math.max(s.vy, 0) + (kind === 'celebrate' ? AIR_TAP_VY : CHEER_VY * 0.8);
      return s;
    }
    if (s.mode === 'sleep') s.woke = true;
    s.walking = false;
    s.mode = 'crouch';
    s.timer = 0.09;
    s.squashV += 2.8;
    s.pendingVy = kind === 'celebrate' ? TAP_VY : CHEER_VY;
    s.pendingVx = 0;
    return s;
  }
  if (kind === 'peek') {
    if (s.mode === 'peek' || s.peekSide !== 0) return s;
    s.peekSide = s.x - b.minX <= b.maxX - s.x ? -1 : 1;
    s.targetX = s.peekSide < 0 ? b.minX : b.maxX;
    if (!grounded(s)) {
      s.queued = 'peek';
      return s;
    }
    if (Math.abs(s.targetX - s.x) < 6) startAct(s, 'peek');
    else {
      s.walking = true;
      s.mode = 'walk';
      s.timer = 0;
    }
    return s;
  }
  if (!grounded(s)) {
    s.queued = kind;
    return s;
  }
  startAct(s, kind);
  return s;
}

/** 엿보기에서 밖으로 숨은 정도(0 다 나옴 ~ 1 다 숨음). 숨기 → 숨어 있기 → 빼꼼 → 쳐다보기 → 나오기. */
export function peekHidden(t: number): number {
  const ease = (v: number) => 1 - (1 - v) * (1 - v);
  if (t < 0.45) return ease(t / 0.45);
  if (t < 1.1) return 1;
  if (t < 1.45) {
    // 빼꼼: 조금 더 나왔다가 제자리(통통).
    const v = (t - 1.1) / 0.35;
    return 1 - (1 - PEEK_HIDDEN) * ease(v) - 0.08 * Math.sin(v * Math.PI);
  }
  if (t < PEEK_TIME - 0.5) return PEEK_HIDDEN;
  return PEEK_HIDDEN * (1 - ease(Math.min(1, (t - (PEEK_TIME - 0.5)) / 0.5)));
}

/** 빼꼼 내민 동안만 안쪽으로 기운다(0 또는 1). */
function peekOut(t: number) {
  return t >= 1.1 && t < PEEK_TIME - 0.5 ? 1 : 0;
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
    waving: s.mode === 'wave',
    thinking: s.mode === 'think',
    peekShift: s.mode === 'peek' ? s.peekSide * peekHidden(s.peekT) : 0,
    peeking: s.mode === 'peek',
  };
}
