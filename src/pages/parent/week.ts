/** 이번 주 월요일(한국 시간, 'YYYY-MM-DD'). 서버의 주간 요약도 한국 시간 월요일로 주를 나눈다. */
export function thisWeekStart(now = Date.now()) {
  const kst = new Date(now + 9 * 60 * 60 * 1000);
  kst.setUTCDate(kst.getUTCDate() - ((kst.getUTCDay() + 6) % 7));
  return kst.toISOString().slice(0, 10);
}
