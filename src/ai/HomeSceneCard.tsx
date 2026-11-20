import type { ReactNode } from 'react';
import type { HomeScene } from '../api/types';
import { ADULT_RESPONSE_LABEL, CHILD_STATE_LABEL, labelsOf } from './labels';
import './ai.css';

/** '2026-11-19' → '11월 19일'. 정확한 시각은 넘어오지 않으므로 날짜만 쓴다. */
export function sceneDay(date: string): string {
  const [, m, d] = date.split('-');
  return `${Number(m)}월 ${Number(d)}일`;
}

/**
 * 선생님에게 넘어가는 가정 장면 한 건(날짜, 아이 한 줄 + 태그, 보호자 한 줄 + 태그).
 * 선생님 화면과 보호자 미리보기가 같은 모양을 쓴다: 보호자가 본 그대로 선생님에게 간다.
 * 한 줄이 없으면 태그만, 태그도 없으면 그 칸을 통째로 뺀다.
 */
export default function HomeSceneCard({ scene, children }: { scene: HomeScene; children?: ReactNode }) {
  const child = labelsOf(scene.childStates, CHILD_STATE_LABEL);
  const adult = labelsOf(scene.adultResponses, ADULT_RESPONSE_LABEL);
  return (
    <article className="home-scene" aria-label={`${sceneDay(scene.observedOn)} 가정 장면`}>
      <p className="home-scene-date">{sceneDay(scene.observedOn)} · 가정에서</p>
      {(scene.childLine || child.length > 0) && (
        <div className="home-scene-part">
          <p className="ai-tag-title">아이</p>
          {scene.childLine && <p className="home-scene-line">{scene.childLine}</p>}
          <SceneChips labels={child} />
        </div>
      )}
      {(scene.parentLine || adult.length > 0) && (
        <div className="home-scene-part">
          <p className="ai-tag-title">보호자</p>
          {scene.parentLine && <p className="home-scene-line">{scene.parentLine}</p>}
          <SceneChips labels={adult} />
        </div>
      )}
      {!scene.childLine && !scene.parentLine && child.length === 0 && adult.length === 0 && (
        <p className="muted home-scene-line">이 장면에서는 전할 모습을 고르지 못했어요.</p>
      )}
      {children}
    </article>
  );
}

function SceneChips({ labels }: { labels: string[] }) {
  if (labels.length === 0) return null;
  return (
    <ul className="ai-chips">
      {labels.map((l) => (
        <li key={l} className="chip">
          {l}
        </li>
      ))}
    </ul>
  );
}
