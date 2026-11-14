import { formatAge } from '../../components/ui';

/** 아이 등록·수정 화면이 같이 쓰는 도우미. */

export function monthsAgo(n: number) {
  const d = new Date();
  // 1일로 먼저 옮겨야 31일 같은 말일에 달을 빼도 날짜가 다음 달로 넘치지 않는다.
  d.setDate(1);
  d.setMonth(d.getMonth() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** 서버가 받는 생년월 모양(ChildDtos.YEAR_MONTH). */
export const YEAR_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** 등록할 수 있는 생년월 범위(만 0~6세). */
export function birthRange() {
  return { min: monthsAgo(83), max: monthsAgo(0) };
}

/** 생년월 칸의 오류 문장. 괜찮으면 undefined. */
export function birthError(birth: string): string | undefined {
  const { min, max } = birthRange();
  if (YEAR_MONTH.test(birth) && birth >= min && birth <= max) return undefined;
  // 달 고르기가 없는 브라우저에서는 범위 밖 달도 쓸 수 있어서, 모양은 맞는데 범위만 벗어나면 그렇게 알려 준다.
  return YEAR_MONTH.test(birth)
    ? '만 0~6세 아이만 등록할 수 있어요. 태어난 해와 달을 다시 확인해 주세요.'
    : '태어난 해와 달을 골라 주세요.';
}

/**
 * '지금 2세 3개월이에요'. 개월 수는 서버(Child.ageMonths)처럼 달만 세고, 표기는 아이 홈과 같은 formatAge라
 * 등록한 뒤 보이는 나이와 어긋나지 않는다. '세'로 끝나면 받침이 없어 '예요'.
 */
export function ageHint(birth: string) {
  const now = new Date();
  const months = (now.getFullYear() - Number(birth.slice(0, 4))) * 12 + (now.getMonth() + 1 - Number(birth.slice(5, 7)));
  const age = formatAge(Math.max(0, months));
  return `지금 ${age}${age.endsWith('세') ? '예요' : '이에요'}`;
}
