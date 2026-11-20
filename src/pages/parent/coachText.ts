/*
 * 아이 홈 '오늘의 코칭' 카드의 접힌 모습에 쓰는 글자 도우미.
 * 코칭 카드는 사람이 쓴 글이라 여기서 문장을 새로 만들거나 고치지 않는다. 본문의 첫 문장을 그대로 보여 줄 뿐이고,
 * 본문 전체와 근거·출처·작성·검수는 카드를 펼치면 그대로 나온다.
 */

/** 본문의 첫 문장(마침표·물음표·느낌표까지). 문장 끝을 못 찾으면 본문 전체. 글자는 바꾸지 않는다. */
export function firstSentence(body: string | null | undefined): string {
  const text = (body ?? '').trim();
  if (!text) return '';
  // 문장 끝 부호 바로 뒤에 공백이 오는 첫 자리에서 자른다. 부호 뒤에 닫는 따옴표가 붙어 있으면("높다!" 하고 …)
  // 따온 말 안이라 문장이 이어지는 것으로 보고 자르지 않는다. 숫자 속 점(1.5초)도 뒤가 공백이 아니라 지나간다.
  const m = /^[\s\S]*?[.!?。？！](?=\s)/.exec(text);
  return (m ? m[0] : text).trim();
}

/** 카드를 받은 날: 오늘이면 '오늘 · 11.18', 아니면 '11.12'(이 기기의 날짜 기준). */
export function coachDateLabel(deliveredAt: string, now = new Date()): string {
  const d = new Date(deliveredAt);
  if (Number.isNaN(d.getTime())) return '';
  const md = `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, '0')}`;
  const today =
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  return today ? `오늘 · ${md}` : md;
}

/**
 * 카드 본문을 '이렇게 해주세요'의 단계로 나눈다(Figma 오늘의 코칭: 번호 붙은 2~4줄).
 * 문장 끝 부호 뒤 공백에서 자르고(firstSentence와 같은 규칙), maxSteps를 넘으면 남은 문장은 마지막 단계에 이어 붙인다.
 */
export function splitSteps(body: string | null | undefined, maxSteps = 4): string[] {
  const steps: string[] = [];
  let rest = (body ?? '').trim();
  while (rest) {
    const one = firstSentence(rest);
    steps.push(one);
    rest = rest.slice(one.length).trim();
  }
  if (steps.length <= maxSteps) return steps;
  return [...steps.slice(0, maxSteps - 1), steps.slice(maxSteps - 1).join(' ')];
}

/** 달 묶음 열쇠와 이름: '2026-11', '2026년 11월'(이 기기의 날짜 기준). */
export function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-');
  return `${y}년 ${Number(m)}월`;
}

/** 목록의 날짜: 어제면 '어제 · 11월 20일', 오늘이면 '오늘 · 11월 21일', 아니면 '11월 19일'. */
export function dayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const md = `${d.getMonth() + 1}월 ${d.getDate()}일`;
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (diff === 0) return `오늘 · ${md}`;
  if (diff === 1) return `어제 · ${md}`;
  return md;
}
