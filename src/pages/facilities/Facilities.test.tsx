import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Facilities, { FacilityCard } from './Facilities';
import {
  CATEGORY_LABEL,
  FACILITY_CATEGORIES,
  SIDO,
  SIDO_KEY,
  displayAddress,
  facilitiesPath,
  fetchFacilities,
  formatSourceDate,
  operatorLabel,
  readSido,
  safeHomepage,
  saveSido,
  telHref,
  type Facility,
  type FacilityPage,
} from './facilityData';

const fake: Facility = {
  id: 7,
  category: 'SPECIAL_ED_SUPPORT_CENTER',
  name: '해오름 특수교육지원센터',
  sido: '경기도',
  sigungu: '수원시',
  address: '팔달구 효원로 1',
  phone: '031-123-4567',
  homepage: 'www.example.kr',
  operator: 'PUBLIC',
  tags: ['발달장애', '순회교육'],
  source: { name: '교육부 특수교육 기관 현황', date: '2026-10-31' },
  status: 'PUBLIC_DATA',
};

// 시험 환경(node)에는 브라우저 저장소가 없어 메모리로 흉내 낸다.
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
});

afterEach(() => {
  vi.restoreAllMocks();
  store.clear();
});

describe('지역 기관 찾기 도우미', () => {
  it('서버 주소: 빈 조건은 빼고, 검색어는 다듬고, 쪽·크기를 붙인다', () => {
    expect(facilitiesPath({})).toBe('/support-facilities?page=0&size=20');
    expect(facilitiesPath({ sido: '경기도', category: 'SPECIAL_SCHOOL', q: '  해오름 ', page: 2 })).toBe(
      `/support-facilities?sido=${encodeURIComponent('경기도')}&category=SPECIAL_SCHOOL&q=${encodeURIComponent('해오름')}&page=2&size=20`,
    );
    expect(facilitiesPath({ q: '   ' })).not.toContain('q=');
  });

  it('가짜 응답으로 불러온다(로그인 없이 GET)', async () => {
    const page: FacilityPage = { items: [fake], total: 1, page: 0, size: 20, counts: { SPECIAL_ED_SUPPORT_CENTER: 1 } };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(page), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const res = await fetchFacilities({ sido: '경기도' });
    expect(res.items[0].name).toBe('해오름 특수교육지원센터');
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`/api/v1/support-facilities?sido=${encodeURIComponent('경기도')}&page=0&size=20`);
    expect((init as RequestInit).method).toBe('GET');
  });

  it('기준일·전화·누리집·주소 모양', () => {
    expect(formatSourceDate('2026-10-31')).toBe('2026.10.31');
    expect(formatSourceDate('어제')).toBeNull();
    expect(telHref('031-123-4567')).toBe('tel:0311234567');
    expect(telHref('-')).toBeNull();
    expect(safeHomepage('www.example.kr')).toBe('https://www.example.kr/');
    expect(safeHomepage('javascript:alert(1)')).toBeNull();
    expect(safeHomepage('ftp://x.kr')).toBeNull();
    expect(displayAddress(fake)).toBe('경기도 수원시 팔달구 효원로 1');
    expect(displayAddress({ ...fake, address: '경기도 수원시 팔달구 효원로 1' })).toBe('경기도 수원시 팔달구 효원로 1');
  });

  it('시·도는 이 기기에 키 하나로 기억하고, 모르는 값은 버린다', () => {
    saveSido('부산광역시');
    expect(localStorage.getItem(SIDO_KEY)).toBe('부산광역시');
    expect(readSido()).toBe('부산광역시');
    localStorage.setItem(SIDO_KEY, '아무데나');
    expect(readSido()).toBe('');
  });

  it('시·도는 16곳이고, 예전에 기억한 광주광역시·전라남도는 전남광주통합특별시로 바꿔 보인다', () => {
    expect(SIDO).toHaveLength(16);
    expect(SIDO).toContain('전남광주통합특별시');
    expect(SIDO).not.toContain('광주광역시' as never);
    expect(SIDO).not.toContain('전라남도' as never);
    for (const old of ['광주광역시', '전라남도']) {
      localStorage.setItem(SIDO_KEY, old);
      expect(readSido()).toBe('전남광주통합특별시');
      expect(localStorage.getItem(SIDO_KEY)).toBe('전남광주통합특별시');
    }
  });

  it('설립 구분: 서버 값을 한국어 이름표로, 모르는 값·빈 값은 보이지 않게', () => {
    expect(operatorLabel('PUBLIC')).toBe('공공');
    expect(operatorLabel('PRIVATE')).toBe('민간');
    expect(operatorLabel('NONPROFIT')).toBe('비영리');
    expect(operatorLabel(null)).toBeNull();
    expect(operatorLabel('GOVERNMENT')).toBeNull();
    expect(operatorLabel('constructor')).toBeNull();
    const h = renderToStaticMarkup(
      <MemoryRouter>
        <FacilityCard facility={{ ...fake, operator: 'SOMETHING_NEW', tags: [] }} />
      </MemoryRouter>,
    );
    expect(h).not.toContain('SOMETHING_NEW');
    expect(h).not.toContain('fac-tags');
  });

  it('유형 다섯 가지에 모두 이름이 있다', () => {
    for (const c of FACILITY_CATEGORIES) expect(CATEGORY_LABEL[c]).toBeTruthy();
  });
});

describe('기관 카드', () => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <FacilityCard facility={fake} />
    </MemoryRouter>,
  );

  it('전화 버튼 이름표에 기관 이름이 들어가고, 누리집은 새 창(안전한 rel)', () => {
    expect(html).toContain('aria-label="해오름 특수교육지원센터에 전화 걸기, 031-123-4567"');
    expect(html).toContain('href="tel:0311234567"');
    expect(html).toContain('href="https://www.example.kr/"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('data-demo="facilities-call"');
  });

  it('공공데이터 기준일과 설립 구분·태그를 보여 주고, 순위·평점·후기는 없다', () => {
    expect(html).toContain('공공데이터 · 기준일 2026.10.31');
    expect(html).toContain('<li>공공</li>');
    expect(html).not.toContain('PUBLIC');
    expect(html).toContain('순회교육');
    expect(html).not.toMatch(/평점|별점|후기|리뷰|순위|추천해요/);
  });

  it('확인된 곳은 \'확인됨\'', () => {
    const h = renderToStaticMarkup(
      <MemoryRouter>
        <FacilityCard facility={{ ...fake, status: 'CONFIRMED' }} />
      </MemoryRouter>,
    );
    expect(h).toContain('확인됨');
    expect(h).not.toContain('기준일');
  });

  it('위험한 누리집 주소는 버튼을 만들지 않는다', () => {
    const h = renderToStaticMarkup(
      <MemoryRouter>
        <FacilityCard facility={{ ...fake, homepage: 'javascript:alert(1)', phone: null }} />
      </MemoryRouter>,
    );
    expect(h).not.toContain('javascript:');
    expect(h).not.toContain('facilities-homepage');
    expect(h).not.toContain('tel:');
  });
});

describe('화면', () => {
  it('처음 그릴 때: 추천·인증이 아니라는 안내와 기록을 보내지 않는다는 안내, 지역·검색·유형 칩', () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => undefined));
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <Facilities />
      </MemoryRouter>,
    );
    expect(html).toContain('시나브로가 추천하거나 인증한 곳이 아니에요');
    expect(html).toContain('아이 기록은 어디에도 가지 않아요');
    expect(html).toContain('기관에 직접 확인해 주세요');
    expect(html).toContain('data-demo="facilities-sido"');
    expect(html).toContain('data-demo="facilities-search"');
    expect(html).toContain('data-demo="facilities-cat-SPECIAL_SCHOOL"');
    expect(html).toContain('role="search"');
  });
});
