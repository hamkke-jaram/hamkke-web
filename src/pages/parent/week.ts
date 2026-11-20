const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 서버와 같은 한국 달력에서 날짜를 구한다. */
export function kstDateKey(time: number) {
  return Number.isFinite(time) ? new Date(time + KST_OFFSET_MS).toISOString().slice(0, 10) : '';
}

/** 이번 주 월요일(한국 시간, 'YYYY-MM-DD'). 서버의 주간 요약도 한국 시간 월요일로 주를 나눈다. */
export function thisWeekStart(now = Date.now()) {
  const kst = new Date(now + KST_OFFSET_MS);
  kst.setUTCDate(kst.getUTCDate() - ((kst.getUTCDay() + 6) % 7));
  return kst.toISOString().slice(0, 10);
}

/** 요일 이름(월요일부터). thisWeekStats의 days와 같은 순서다. */
export const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'] as const;

export interface ThisWeek {
  /** 이번 주 월요일과 일요일(한국 시간, 'YYYY-MM-DD') */
  start: string;
  end: string;
  /** 이번 주에 찍은 영상에서 함께한 시간의 합(초) */
  totalSeconds: number;
  /** 이번 주에 찍은 영상의 기록 수 */
  count: number;
  /** 요일별 함께한 시간(초). 월요일부터 7칸 */
  days: number[];
  /** 오늘이 몇 번째 칸인지(0 = 월요일) */
  todayIndex: number;
}

/**
 * 이번 주(한국 시간 월요일~일요일)에 찍은 영상의 기록을 요일별로 모은다.
 * 주를 나누는 기준은 서버의 주간 요약과 같이 촬영 시각(recordedAt)이다(앨범의 지난 영상은 그 주로 간다).
 * 시각을 읽을 수 없는 기록과 이번 주 밖의 기록은 세지 않는다.
 */
export function thisWeekStats(
  records: readonly { recordedAt: string; jointPlaySeconds: number }[] | null | undefined,
  now = Date.now(),
): ThisWeek {
  const start = thisWeekStart(now);
  const startMs = Date.parse(`${start}T00:00:00Z`); // 한국 시간으로 옮긴 축 위의 월요일 0시
  const days = [0, 0, 0, 0, 0, 0, 0];
  let totalSeconds = 0;
  let count = 0;
  for (const r of records ?? []) {
    const t = Date.parse(r.recordedAt);
    if (!Number.isFinite(t)) continue;
    const i = Math.floor((t + KST_OFFSET_MS - startMs) / DAY_MS);
    if (i < 0 || i > 6) continue;
    const sec = Number.isFinite(r.jointPlaySeconds) && r.jointPlaySeconds > 0 ? r.jointPlaySeconds : 0;
    days[i] += sec;
    totalSeconds += sec;
    count++;
  }
  const end = new Date(startMs + 6 * DAY_MS).toISOString().slice(0, 10);
  const todayIndex = Math.min(6, Math.max(0, Math.floor((now + KST_OFFSET_MS - startMs) / DAY_MS)));
  return { start, end, totalSeconds, count, days, todayIndex };
}

/** 'YYYY-MM-DD' → '11.18' (달은 그대로, 날은 두 자리) */
export function shortDate(ymd: string) {
  const [, m, d] = ymd.split('-');
  return `${Number(m)}.${d}`;
}
