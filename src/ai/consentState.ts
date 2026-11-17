import type { AiConsent } from '../api/types';

/**
 * 아이별 'AI 관찰 기록' 동의가 지금 어떤 상태인지(GET /children/{id}/ai-consent, hamkke-api/docs/api.md 9장).
 *
 * - 'on': 지금 동의 문서 버전에 동의해 있다. 장면 사진을 보낼 수 있다.
 * - 'outdated': 동의는 거두지 않았는데 동의 문서 버전이 바뀌었다(`agreed: false`, `version: "<예전 버전>"`).
 *   서버는 다시 동의하기 전까지 분석 토큰을 주지 않는다(사진이 한 장도 나가지 않는다). 그동안 쌓인 기록은 서버에
 *   그대로 있고, 보호자는 보고 지울 수 있으며 다시 동의하지 않고 거둘 수도 있다(DELETE ai-consent).
 * - 'off': 동의한 적이 없거나 거두었다(`version: null`). 남아 있는 AI 관찰 기록이 없다.
 */
export type AiConsentState = 'on' | 'outdated' | 'off';

export function aiConsentState(consent: Pick<AiConsent, 'agreed' | 'version'> | null | undefined): AiConsentState {
  if (!consent) return 'off';
  if (consent.agreed === true) return 'on';
  return typeof consent.version === 'string' && consent.version.trim() !== '' ? 'outdated' : 'off';
}

/**
 * 그동안 쌓인 AI 관찰 기록이 서버에 남아 있을 수 있는 상태인지. 이때는 AI 서버가 꺼져 있어도, 동의 문서가
 * 바뀌었어도 기록 목록(보기·지우기)과 '끄고 기록 지우기'를 보여 준다.
 */
export function keepsAiRecords(state: AiConsentState): boolean {
  return state !== 'off';
}

/** 아이 홈에서 동의 카드를 두는 자리. */
export type ConsentCardPlace = 'top' | 'bottom' | 'none';

/**
 * - 켜져 있으면 아래쪽 설정 자리.
 * - 버전이 바뀌어 꺼졌으면 위쪽: 왜 꺼졌는지 먼저 보여야 한다. AI 서버가 꺼져 있어도 보여 준다(기록 지우기·끄기는 된다).
 * - 처음부터 꺼져 있으면 위쪽에서 켜기를 안내하되, AI 서버가 설정되지 않았으면 그리지 않는다(서버가 새 동의를 받지 않는다).
 */
export function consentCardPlace(state: AiConsentState, aiOn: boolean): ConsentCardPlace {
  if (state === 'on') return 'bottom';
  if (state === 'outdated') return 'top';
  return aiOn ? 'top' : 'none';
}
