import type { RecommendationEvidence } from '../api/types';

export function sourceUrl(url?: string | null): string | null {
  if (!url) return null;
  try {
    const source = new URL(url);
    return source.protocol === 'https:' && !source.username && !source.password ? source.href : null;
  } catch {
    return null;
  }
}

export function EvidenceDetails({ evidence }: { evidence?: RecommendationEvidence | null }) {
  const href = sourceUrl(evidence?.sourceUrl);
  if (!evidence || !href || ![evidence.reason, evidence.sourcePublisher, evidence.sourceTitle]
    .every(text => typeof text === 'string' && text.trim())) {
    return <p className="evidence-missing">이 추천에 직접 연결된 근거 자료가 아직 없어요.</p>;
  }
  const host = new URL(href).hostname;
  return <div className="recommendation-evidence" aria-label="추천 이유와 근거 자료" role="group">
    <dl>
      <dt>추천 이유</dt>
      <dd>{evidence.reason}</dd>
      <dt>근거 자료</dt>
      <dd>
        <a href={href} target="_blank" rel="noopener noreferrer">{evidence.sourcePublisher} · {evidence.sourceTitle}</a>
        {evidence.sourceSection && <span className="evidence-section">{evidence.sourceSection}</span>}
      </dd>
    </dl>
    {host === 'www.cdc.gov' && <p className="evidence-credit">미국 CDC에서 원문을 무료로 제공합니다. CDC와 미국 보건복지부, 미국 정부는 이 서비스를 보증하지 않습니다.</p>}
    {host === 'help-for-early-years-providers.education.gov.uk' && <p className="evidence-credit">
      © Crown copyright. Contains public sector information licensed under the{' '}
      <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/" target="_blank" rel="noopener noreferrer" lang="en">Open Government Licence v3.0</a>.
    </p>}
  </div>;
}
