import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../api/client';
import type { Card, Delivery, SupportResource, WeekSummary } from '../api/types';
import { FALLBACK_DISCLAIMER, useAuth } from '../auth/AuthContext';

export function Disclaimer() {
  const { policies } = useAuth();
  return (
    <footer className="disclaimer">
      <p style={{ margin: 0 }}>{policies?.disclaimer ?? FALLBACK_DISCLAIMER}</p>
      <p style={{ margin: '6px 0 0' }}>
        <Link to="/support">상담·기관 연결 안내</Link> · <Link to="/privacy">개인정보 처리 안내</Link>
      </p>
    </footer>
  );
}

export function Loading() {
  return <div className="spinner" role="status" aria-label="불러오는 중" />;
}

export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p className="error" role="alert">
      {errorMessage(error)}
    </p>
  );
}

/** 단순 비동기 로더. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fn()
      .then((d) => alive && (setData(d), setError(null)))
      .catch((e) => alive && setError(e))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, error, loading, reload: () => setTick((t) => t + 1), setData };
}

export function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}분 ${s}초` : `${s}초`;
}

export function formatAge(months: number) {
  if (months < 24) return `${months}개월`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  return m ? `${y}세 ${m}개월` : `${y}세`;
}

export function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

const FOCUS_LABEL: Record<string, string> = {
  JOINT_PLAY: '함께 놀기',
  RESPONSE: '반응 주고받기',
  CALM: '편안한 마음',
  GENERAL: '일상 속 양육',
};

export function CoachingCardView({ card, delivery, onTried }: { card: Card; delivery?: Delivery; onTried?: () => void }) {
  return (
    <article className="card coach-card" aria-label="코칭 카드">
      <div className="row between" style={{ marginBottom: 6 }}>
        <span className="chip brand">{FOCUS_LABEL[card.metricFocus] ?? '코칭'}</span>
        {delivery && <span className="muted">{formatDate(delivery.deliveredAt)}</span>}
      </div>
      <h3 style={{ fontSize: 18 }}>{card.title}</h3>
      <p style={{ margin: 0 }}>{card.body}</p>
      {delivery && onTried && (
        <div style={{ marginTop: 12 }}>
          {delivery.triedAt ? (
            <span className="chip brand">✓ 해봤어요</span>
          ) : (
            <button type="button" className="btn small secondary" onClick={onTried}>
              오늘 해봤어요
            </button>
          )}
        </div>
      )}
      <div className="evidence">
        <div>{card.evidenceTag}</div>
        <div>
          출처:{' '}
          {card.sourceUrl ? (
            <a href={card.sourceUrl} target="_blank" rel="noopener noreferrer">
              {card.sourceTitle}
            </a>
          ) : (
            card.sourceTitle
          )}
        </div>
        <div>
          작성: {card.author} · 검수: {card.reviewer ?? '전문가 검수 진행 중'}
        </div>
      </div>
    </article>
  );
}

export function SupportList({ resources }: { resources: SupportResource[] }) {
  return (
    <div>
      {resources.map((r) => (
        <div key={r.id} className="list-item" style={{ alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <strong>{r.name}</strong>
            <div className="muted">{r.description}</div>
            {r.hours && <div className="muted">운영: {r.hours}</div>}
          </div>
          <div className="stack" style={{ flex: 'none' }}>
            {r.phone && (
              <a className="btn small" href={`tel:${r.phone.replace(/[^0-9]/g, '')}`}>
                {r.phone} 전화
              </a>
            )}
            {r.url && (
              <a className="btn small secondary" href={r.url} target="_blank" rel="noopener noreferrer">
                누리집
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * 주간 함께한 시간 비율 막대(단일 계열). 점수·순위가 아니라 우리 집 변화만 보여 준다.
 * 막대마다 마우스/터치 툴팁(<title>)과 아래 표(접기)로 같은 값을 제공한다.
 */
export function WeeklyBars({ weeks }: { weeks: WeekSummary[] }) {
  const data = weeks.filter((w) => w.jointPlayRatio != null);
  if (data.length === 0) return <p className="muted">공유된 주간 기록이 아직 없어요.</p>;
  const W = 320;
  const H = 150;
  const top = 22;
  const bottom = 24;
  const plotH = H - top - bottom;
  const slot = W / Math.max(data.length, 4);
  const bw = Math.min(28, slot * 0.55);
  const last = data.length - 1;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="주별 함께한 시간 비율">
      <line className="axis" x1={0} x2={W} y1={top + plotH} y2={top + plotH} />
      {data.map((w, i) => {
        const ratio = Math.max(0, Math.min(1, w.jointPlayRatio ?? 0));
        const h = Math.max(2, ratio * plotH);
        const x = i * slot + (slot - bw) / 2;
        const y = top + plotH - h;
        const r = Math.min(4, bw / 2, h);
        const d = `M${x},${top + plotH} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${top + plotH} Z`;
        const label = `${w.weekStart.slice(5).replace('-', '/')}`;
        return (
          <g key={w.weekStart}>
            <path className="bar" d={d}>
              <title>{`${label} 주: 함께한 시간 ${Math.round(ratio * 100)}% · 기록 ${w.recordCount}개`}</title>
            </path>
            <text x={x + bw / 2} y={H - 6} textAnchor="middle">
              {label}
            </text>
            {i === last && (
              <text className="value" x={x + bw / 2} y={y - 6} textAnchor="middle">
                {Math.round(ratio * 100)}%
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function WeeklyTable({ weeks }: { weeks: WeekSummary[] }) {
  const has = (k: keyof WeekSummary) => weeks.some((w) => w[k] !== undefined);
  return (
    <table className="data">
      <thead>
        <tr>
          <th>주 시작</th>
          {has('jointPlayRatio') && <th>함께한 시간</th>}
          {has('responseLatencySec') && <th>반응까지</th>}
          {has('distressPerTenMinutes') && <th>크게 운 횟수(10분당)</th>}
        </tr>
      </thead>
      <tbody>
        {weeks.map((w) => (
          <tr key={w.weekStart}>
            <td>{w.weekStart.slice(5).replace('-', '/')}</td>
            {has('jointPlayRatio') && <td>{w.jointPlayRatio != null ? `${Math.round(w.jointPlayRatio * 100)}%` : '–'}</td>}
            {has('responseLatencySec') && <td>{w.responseLatencySec != null ? `${w.responseLatencySec}초` : '–'}</td>}
            {has('distressPerTenMinutes') && <td>{w.distressPerTenMinutes != null ? `${w.distressPerTenMinutes}회` : '–'}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      <div className="row between" style={{ marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
