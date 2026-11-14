/** 시연의 시간 계산(순수 함수). 테스트에서 그대로 확인한다. */

/** 글자 단위로 나눈다. 한글은 완성된 음절 하나가 한 글자다(조합 과정은 흉내 내지 않는다). */
export function splitChars(text: string): string[] {
  return Array.from(text);
}

const PAUSE_AFTER = /[\s.,!?·:;)\]-]/;

/**
 * 한 글자를 넣은 뒤 기다릴 시간(ms). 기본 70ms에 ±30ms 흔들림, 공백·문장부호 뒤에는 120ms를 더 쉰다.
 * random은 0 이상 1 미만(테스트에서 고정값을 넣는다).
 */
export function charDelay(ch: string, random: () => number = Math.random) {
  const base = 70 + Math.round((random() * 2 - 1) * 30);
  return PAUSE_AFTER.test(ch) ? base + 120 : base;
}

/** 말풍선을 읽을 시간(ms). 글자 수에 비례하되 1.8~8초 사이로 둔다. */
export function readMs(title: string, body: string) {
  const chars = title.length + body.length;
  return Math.min(8000, Math.max(1800, 600 + chars * 55));
}

/** 속도 배율을 적용한 시간. */
export function scaled(ms: number, speed: number) {
  return Math.max(0, Math.round(ms / (speed > 0 ? speed : 1)));
}

/** 오늘에서 n일 뒤(음수면 전)의 'YYYY-MM-DD'(기기 시간대 기준, 날짜 칸이 쓰는 값). */
export function ymdFromToday(days: number, now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** n개월 전의 'YYYY-MM'. */
export function ymFromToday(monthsAgo: number, now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
