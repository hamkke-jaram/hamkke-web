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
