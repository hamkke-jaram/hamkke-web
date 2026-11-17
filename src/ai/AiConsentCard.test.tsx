import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AiConsent } from '../api/types';
import AiConsentCard from './AiConsentCard';

// 카드는 지금 동의 문서 버전만 로그인 정보에서 읽는다. 처음 그려진 모습만 확인하므로(DOM 없이 돈다) 그 값만 흉내 낸다.
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ policies: { aiAnalysisVersion: '2026-12-v2' }, reloadPolicies: () => undefined }),
}));

function render(consent: AiConsent, paused = false) {
  return renderToStaticMarkup(
    <AiConsentCard childId={7} nickname="하늘" consent={consent} paused={paused} onChange={() => undefined} />,
  );
}

const ON: AiConsent = { agreed: true, version: '2026-12-v2', agreedAt: '2026-12-01T02:00:00Z' };
const OFF: AiConsent = { agreed: false, version: null, agreedAt: null };
const OUTDATED: AiConsent = { agreed: false, version: '2026-11-v1', agreedAt: '2026-11-13T02:10:00Z' };

describe('AiConsentCard', () => {
  it('처음 꺼짐: 켜기만 보이고 끄기는 없다', () => {
    const html = render(OFF);
    expect(html).toContain('data-demo="ai-card"');
    expect(html).toContain('AI 관찰 기록 켜기');
    expect(html).toContain('지금은 꺼져 있어서 사진을 한 장도 보내지');
    expect(html).not.toContain('data-demo="ai-off"');
    expect(html).not.toContain('동의 내용이 바뀌어서');
  });

  it('켜짐: 켜져 있다는 표시와 끄기가 보인다', () => {
    const html = render(ON);
    expect(html).toContain('켜져 있어요');
    expect(html).toContain('동의 내용 버전 2026-12-v2');
    expect(html).toContain('data-demo="ai-off"');
    expect(html).toContain('AI 관찰 기록 끄기');
    expect(html).not.toContain('data-demo="ai-open"');
  });

  it('동의 문서가 바뀌어 꺼짐: 왜 꺼졌는지, 기록이 남아 있다는 것, 다시 켜기와 끄기를 함께 보인다', () => {
    const html = render(OUTDATED);
    expect(html).toContain('data-demo="ai-card-outdated"');
    expect(html).toContain('다시 동의가 필요해요');
    expect(html).toContain('동의 내용이 바뀌어서 지금은 꺼져 있어요');
    expect(html).toContain('장면 사진을 한 장도 보내지');
    expect(html).toContain('하늘의 AI 관찰 기록은 지워지지 않았어요');
    expect(html).toContain('예전 내용(버전 2026-11-v1)');
    // 다시 켜기(바뀐 내용을 읽고 나서)와, 다시 동의하지 않고 거두기
    expect(html).toContain('data-demo="ai-open"');
    expect(html).toContain('바뀐 내용 읽고 다시 켜기');
    expect(html).toContain('data-demo="ai-off"');
    expect(html).toContain('다시 동의하지 않고 끄기');
    // 처음 켜는 사람과 같은 모습으로 보이지 않는다
    expect(html).not.toContain('data-demo="ai-card"');
    expect(html).not.toContain('켜져 있어요');
  });

  it('동의 문서가 바뀌어 꺼짐 + AI 서버가 꺼져 있음: 다시 켜기는 숨기고 끄기는 남긴다', () => {
    const html = render(OUTDATED, true);
    expect(html).toContain('지금은 AI 서버가 쉬고 있어서 다시 켤 수 없어요');
    expect(html).not.toContain('data-demo="ai-open"');
    expect(html).toContain('data-demo="ai-off"');
    expect(html).toContain('다시 동의하지 않고 끄기');
  });

  it('동의한 날짜를 모르면 예전 동의 문장을 빼고 그린다', () => {
    const html = render({ ...OUTDATED, agreedAt: null });
    expect(html).toContain('동의 내용이 바뀌어서 지금은 꺼져 있어요');
    expect(html).not.toContain('예전 내용(버전');
  });
});
