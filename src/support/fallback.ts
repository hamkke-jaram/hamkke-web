import type { SupportResource } from '../api/types';

/**
 * 상담·기관 안내의 내장 사본. 서버(GET /support-resources)에 닿지 못해도
 * 번호는 언제나 보여야 하므로 앱 안에 같은 목록을 둔다.
 * hamkke-api의 db/migration/V3__seed_support_resources.sql + V4(119·112 분리)와 내용을 맞춘다(바꿀 때 함께 바꾼다).
 */
export const FALLBACK_SUPPORT_RESOURCES: SupportResource[] = [
  {
    id: 1,
    name: '긴급 상황 119 (구급·화재)',
    description: '아이나 가족이 다쳤거나 몸이 많이 아픈 급한 상황이면 바로 119에 연락하세요.',
    phone: '119',
    url: null,
    hours: '24시간',
    category: 'EMERGENCY',
  },
  {
    id: 8,
    name: '긴급 상황 112 (경찰)',
    description: '아이나 가족의 안전이 걱정되는 급한 상황이면 바로 112에 연락하세요.',
    phone: '112',
    url: null,
    hours: '24시간',
    category: 'EMERGENCY',
  },
  {
    id: 2,
    name: '자살예방상담전화 109',
    description: '마음이 많이 힘들고 지칠 때 전화로 이야기를 나눌 수 있어요.',
    phone: '109',
    url: null,
    hours: '24시간',
    category: 'CRISIS',
  },
  {
    id: 3,
    name: '정신건강위기상담전화',
    description: '정신건강과 관련해 도움이 필요할 때 상담을 받고 가까운 기관을 안내받을 수 있어요.',
    phone: '1577-0199',
    url: null,
    hours: '24시간',
    category: 'CRISIS',
  },
  {
    id: 4,
    name: '보건복지상담센터 129',
    description: '양육, 돌봄, 복지 서비스에 대해 상담하고 지역 기관을 안내받을 수 있어요.',
    phone: '129',
    url: null,
    hours: null,
    category: 'COUNSEL',
  },
  {
    id: 5,
    name: '지역 정신건강복지센터',
    description:
      '부모님 마음 건강을 위한 상담을 지역에서 받을 수 있어요. 국가정신건강정보포털에서 가까운 센터를 찾을 수 있어요.',
    phone: null,
    url: 'https://www.mentalhealth.go.kr',
    hours: null,
    category: 'CENTER',
  },
  {
    id: 6,
    name: '장애아동지원센터 · 발달장애인지원센터',
    description:
      '아이 발달 지원 서비스와 지역 기관 연결을 안내받을 수 있어요. 거주지 시·군·구청이나 129에 문의해 주세요.',
    phone: null,
    url: null,
    hours: null,
    category: 'CENTER',
  },
  {
    id: 7,
    name: '영유아 건강검진 안내 (건강iN)',
    description: '영유아 건강검진과 발달 관련 검사는 국민건강보험공단 건강iN에서 안내받을 수 있어요.',
    phone: null,
    url: 'https://hi.nhis.or.kr',
    hours: null,
    category: 'INFO',
  },
];

/**
 * V4 이전 서버는 '긴급 상황 119 · 112' 한 항목(전화 119)만 주므로, 목록에 112가 없을 때만 112 버튼을 따로 붙인다.
 * 서버 목록에는 없는 화면 전용 항목이므로 seed id와 겹치지 않는 음수 id를 쓴다.
 */
export const POLICE_112: SupportResource = {
  id: -112,
  name: '경찰 112',
  description: '안전이 걱정되는 급한 상황이면 바로 112(경찰)에 연락하세요.',
  phone: '112',
  url: null,
  hours: '24시간',
  category: 'EMERGENCY',
};

/** 목록에 112 전화 버튼이 없으면 긴급 상황 항목 바로 뒤(없으면 맨 앞)에 넣는다. */
export function withPolice112(list: SupportResource[]): SupportResource[] {
  if (list.some((r) => r.phone?.replace(/[^0-9]/g, '') === '112')) return list;
  const at = list.findIndex((r) => r.category === 'EMERGENCY');
  const out = [...list];
  out.splice(at + 1, 0, POLICE_112);
  return out;
}
