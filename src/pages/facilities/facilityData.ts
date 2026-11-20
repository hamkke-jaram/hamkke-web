import { api } from '../../api/client';

/*
 * 지역 기관 찾기(/support/facilities)에 쓰는 자료와 도우미.
 * 서버: GET /api/v1/support-facilities?sido&category&q&page&size (로그인 없이, be-2 T-021).
 * 공공데이터를 모아 보여 줄 뿐, 시나브로가 추천·인증하는 곳이 아니다. 순위·평점·후기는 다루지 않는다.
 */

export const FACILITY_CATEGORIES = [
  'SPECIAL_SCHOOL',
  'SPECIAL_ED_SUPPORT_CENTER',
  'CHILDCARE_SUPPORT_CENTER',
  'MENTAL_HEALTH_CENTER',
  'DISABILITY_WELFARE_CENTER',
] as const;
export type FacilityCategory = (typeof FACILITY_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<FacilityCategory, string> = {
  SPECIAL_SCHOOL: '특수학교',
  SPECIAL_ED_SUPPORT_CENTER: '특수교육지원센터',
  CHILDCARE_SUPPORT_CENTER: '육아종합지원센터',
  MENTAL_HEALTH_CENTER: '정신건강복지센터',
  DISABILITY_WELFARE_CENTER: '장애인복지관',
};

export type FacilityStatus = 'PUBLIC_DATA' | 'CONFIRMED';

export interface Facility {
  id: number;
  category: FacilityCategory;
  name: string;
  sido: string;
  sigungu?: string | null;
  address?: string | null;
  phone?: string | null;
  homepage?: string | null;
  /** 설립 구분(국립·공립·사립·위탁 등) */
  operator?: string | null;
  tags?: string[] | null;
  source?: { name?: string | null; date?: string | null } | null;
  status?: FacilityStatus | null;
}

export interface FacilityPage {
  items: Facility[];
  total: number;
  page: number;
  size: number;
  counts?: Partial<Record<FacilityCategory, number>> | null;
}

/**
 * 시·도(행정 이름) 16곳. 서버에도 이 이름 그대로 보낸다.
 * 2026-07-01부터 광주광역시·전라남도가 '전남광주통합특별시'로 합쳐졌다.
 */
export const SIDO = [
  '서울특별시',
  '부산광역시',
  '대구광역시',
  '인천광역시',
  '대전광역시',
  '울산광역시',
  '세종특별자치시',
  '경기도',
  '강원특별자치도',
  '충청북도',
  '충청남도',
  '전북특별자치도',
  '전남광주통합특별시',
  '경상북도',
  '경상남도',
  '제주특별자치도',
] as const;

/** 합쳐지거나 이름이 바뀐 시·도: 예전 이름 → 지금 이름(이 기기에 예전 이름이 기억돼 있을 때 바꿔 보인다). */
const SIDO_RENAMED: Record<string, (typeof SIDO)[number]> = {
  광주광역시: '전남광주통합특별시',
  전라남도: '전남광주통합특별시',
};

export const PAGE_SIZE = 20;

/** 이 기기에 기억하는 시·도(이 키 하나만 쓴다). 서버로 보내지 않는다. */
export const SIDO_KEY = 'hj.facilities.sido';

export function readSido(): string {
  try {
    const stored = localStorage.getItem(SIDO_KEY) ?? '';
    const v = Object.prototype.hasOwnProperty.call(SIDO_RENAMED, stored) ? SIDO_RENAMED[stored] : stored;
    if (v !== stored) saveSido(v); // 예전 이름은 지금 이름으로 고쳐 둔다
    return (SIDO as readonly string[]).includes(v) ? v : '';
  } catch {
    return '';
  }
}

export function saveSido(v: string) {
  try {
    if (v) localStorage.setItem(SIDO_KEY, v);
    else localStorage.removeItem(SIDO_KEY);
  } catch {
    /* 저장할 수 없는 환경이면 이번 방문에만 쓴다 */
  }
}

export interface FacilityQuery {
  sido?: string;
  category?: FacilityCategory | null;
  q?: string;
  page?: number;
  size?: number;
}

/** 서버 주소(/api/v1 뒤). 빈 값은 빼고, 검색어는 앞뒤 공백을 지운다. */
export function facilitiesPath({ sido, category, q, page = 0, size = PAGE_SIZE }: FacilityQuery): string {
  const p = new URLSearchParams();
  if (sido) p.set('sido', sido);
  if (category) p.set('category', category);
  const query = q?.trim();
  if (query) p.set('q', query.slice(0, 50));
  p.set('page', String(page));
  p.set('size', String(size));
  return `/support-facilities?${p.toString()}`;
}

export function fetchFacilities(query: FacilityQuery) {
  return api<FacilityPage>('GET', facilitiesPath(query));
}

/** '2026-10-31' → '2026.10.31'. 모르는 모양이면 null. */
export function formatSourceDate(date?: string | null): string | null {
  const m = typeof date === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(date) : null;
  return m ? `${m[1]}.${m[2]}.${m[3]}` : null;
}

/** 전화 걸기 주소(tel:). 숫자가 너무 적으면 null. */
export function telHref(phone?: string | null): string | null {
  const digits = (phone ?? '').replace(/[^0-9]/g, '');
  return digits.length >= 3 ? `tel:${digits}` : null;
}

/** 누리집 주소: http(s)만 연다. 'www.…'처럼 앞이 빠졌으면 https://를 붙인다. 그 밖(javascript: 등)은 null. */
export function safeHomepage(url?: string | null): string | null {
  const raw = (url ?? '').trim();
  if (!raw) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/** 설립 구분(서버 값 → 이름표). 모르는 값·빈 값이면 null(카드에 보이지 않는다). */
const OPERATOR_LABEL: Record<string, string> = {
  PUBLIC: '공공',
  PRIVATE: '민간',
  NONPROFIT: '비영리',
};

export function operatorLabel(op?: string | null): string | null {
  const key = typeof op === 'string' ? op.trim().toUpperCase() : '';
  return Object.prototype.hasOwnProperty.call(OPERATOR_LABEL, key) ? OPERATOR_LABEL[key] : null;
}

/** 카드에 보일 주소: 시·도 시·군·구 + 나머지 주소(주소가 이미 시·도로 시작하면 겹쳐 쓰지 않는다). */
export function displayAddress(f: Pick<Facility, 'sido' | 'sigungu' | 'address'>): string {
  const addr = (f.address ?? '').trim();
  if (addr && (addr.startsWith(f.sido) || (f.sigungu && addr.startsWith(f.sigungu)))) return addr;
  return [f.sido, f.sigungu, addr].filter(Boolean).join(' ');
}
