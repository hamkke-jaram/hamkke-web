import { describe, expect, it } from 'vitest';
import { aiConsentState, consentCardPlace, keepsAiRecords } from './consentState';

describe('aiConsentState', () => {
  it('지금 버전에 동의해 있으면 켜짐', () => {
    expect(aiConsentState({ agreed: true, version: '2026-11-v1' })).toBe('on');
  });

  it('동의한 적이 없거나 거두었으면 처음 꺼짐', () => {
    expect(aiConsentState({ agreed: false, version: null })).toBe('off');
  });

  it('동의는 남아 있는데 문서 버전이 바뀌었으면 버전이 바뀌어 꺼짐', () => {
    expect(aiConsentState({ agreed: false, version: '2026-11-v1' })).toBe('outdated');
  });

  it('동의 상태를 아직 모르면 꺼진 것으로 본다(사진을 보내지 않는 쪽)', () => {
    expect(aiConsentState(null)).toBe('off');
    expect(aiConsentState(undefined)).toBe('off');
  });

  it('버전이 빈 글자면 예전 동의가 있는 것으로 보지 않는다', () => {
    expect(aiConsentState({ agreed: false, version: '' })).toBe('off');
    expect(aiConsentState({ agreed: false, version: '   ' })).toBe('off');
  });

  it('agreed가 true가 아닌 값이면 켜짐으로 보지 않는다', () => {
    const odd = { agreed: 'true', version: '2026-11-v1' } as unknown as { agreed: boolean; version: string };
    expect(aiConsentState(odd)).toBe('outdated');
  });
});

describe('keepsAiRecords', () => {
  it('켜짐과 버전이 바뀌어 꺼짐에서는 쌓인 기록을 보고 지울 수 있어야 한다', () => {
    expect(keepsAiRecords('on')).toBe(true);
    expect(keepsAiRecords('outdated')).toBe(true);
  });

  it('처음 꺼짐에는 남은 기록이 없다', () => {
    expect(keepsAiRecords('off')).toBe(false);
  });
});

describe('consentCardPlace', () => {
  it('켜져 있으면 AI 서버와 상관없이 아래쪽 설정 자리', () => {
    expect(consentCardPlace('on', true)).toBe('bottom');
    expect(consentCardPlace('on', false)).toBe('bottom');
  });

  it('버전이 바뀌어 꺼졌으면 AI 서버가 꺼져 있어도 위쪽에 보인다', () => {
    expect(consentCardPlace('outdated', true)).toBe('top');
    expect(consentCardPlace('outdated', false)).toBe('top');
  });

  it('처음 꺼짐은 AI 서버가 설정된 경우에만 위쪽에서 켜기를 안내한다', () => {
    expect(consentCardPlace('off', true)).toBe('top');
    expect(consentCardPlace('off', false)).toBe('none');
  });
});
