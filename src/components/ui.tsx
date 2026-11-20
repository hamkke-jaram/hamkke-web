import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { Link } from 'react-router-dom';
import { FOCUS_LABEL } from '../ai/labels';
import { errorMessage } from '../api/client';
import type { Card, Delivery, SupportResource, WeekSummary } from '../api/types';
import { FALLBACK_DISCLAIMER, useAuth } from '../auth/AuthContext';
import { artMotionFor, poseFor, poseSrc, type Pose } from './coachingArt';

export function Disclaimer() {
  const { policies } = useAuth();
  return (
    <footer className="disclaimer">
      <p style={{ margin: 0 }}>{policies?.disclaimer ?? FALLBACK_DISCLAIMER}</p>
      <p style={{ margin: '12px 0 0' }}>
        <Link to="/support">상담·기관 연결 안내</Link> · <Link to="/privacy">개인정보 처리 안내</Link>
      </p>
    </footer>
  );
}

/** 불러오는 중: 화면 자리를 미리 잡는 막대 세 줄(움직이는 캐릭터가 켜져 있으면 빛이 지나간다). */
export function Loading() {
  return (
    <div className="loading-skeleton" role="status" aria-label="불러오는 중">
      <div className="skeleton" />
      <div className="skeleton" />
      <div className="skeleton" />
    </div>
  );
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

/** 초 → '1분 52초'. 딱 떨어지면 '3분'(‘3분 0초’로 쓰지 않는다). */
export function formatDuration(sec: number) {
  const total = Math.max(0, Math.round(sec));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m === 0) return `${s}초`;
  return s ? `${m}분 ${s}초` : `${m}분`;
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

export function CoachingCardView({
  card,
  delivery,
  onTried,
  triedRef,
}: {
  card: Card;
  delivery?: Delivery;
  onTried?: () => void;
  /** '✓ 해봤어요' 표시. 누른 버튼이 이 표시로 바뀌면 여기로 포커스를 옮길 수 있다. */
  triedRef?: Ref<HTMLSpanElement>;
}) {
  const pose = poseFor(card);
  // 그림을 못 불러오면 그 자리를 비운다(깨진 그림 표시를 보이지 않는다). 카드가 바뀌어 다른 그림이 되면 다시 시도한다.
  const [failedPose, setFailedPose] = useState<Pose | null>(null);
  return (
    <article className="card coach-card" aria-label="코칭 카드">
      <div className="coach-head">
        {failedPose !== pose && (
          <span className="coach-art">
            <img
              className={artMotionFor(pose)}
              src={poseSrc(pose)}
              alt=""
              width={96}
              height={96}
              loading="lazy"
              decoding="async"
              onError={() => setFailedPose(pose)}
            />
          </span>
        )}
        <div className="coach-head-text">
          <div className="row between wrap" style={{ marginBottom: 6 }}>
            <span className="chip brand">{FOCUS_LABEL[card.metricFocus] ?? '코칭'}</span>
            {delivery && <span className="muted">{formatDate(delivery.deliveredAt)}</span>}
          </div>
          <h3 style={{ fontSize: 18 }}>{card.title}</h3>
        </div>
      </div>
      <p style={{ margin: 0 }}>{card.body}</p>
      {delivery && onTried && (
        <div style={{ marginTop: 12 }}>
          {delivery.triedAt ? (
            <span className="chip brand" ref={triedRef} tabIndex={-1}>
              ✓ 해봤어요
            </span>
          ) : (
            <button type="button" className="btn small secondary" data-demo="coach-tried" onClick={onTried}>
              오늘 해봤어요
            </button>
          )}
        </div>
      )}
      <div className="evidence" data-demo="coach-evidence">
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
        // 좁은 화면에서 긴 전화 버튼이 카드 밖으로 밀려나지 않게, 자리가 모자라면 버튼이 글 아래 줄로 내려간다.
        <div key={r.id} className="list-item" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 150px', minWidth: 0 }}>
            <strong>{r.name}</strong>
            <div className="muted">{r.description}</div>
            {r.hours && <div className="muted">운영: {r.hours}</div>}
          </div>
          <div className="stack" style={{ flex: 'none' }}>
            {r.phone && (
              <a className="btn small tonal" href={`tel:${r.phone.replace(/[^0-9]/g, '')}`}>
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

/** 주간 기록에서 막대로 볼 수 있는 항목. 점수·순위가 아니라 우리 집 변화만 보여 준다. */
export type WeekMetric = 'jointPlayRatio' | 'responseLatencySec' | 'distressPerTenMinutes';

export const WEEK_METRICS: { key: WeekMetric; label: string; chartLabel: string; format: (v: number) => string }[] = [
  { key: 'jointPlayRatio', label: '함께한 시간', chartLabel: '주별 함께한 시간 비율', format: (v) => `${Math.round(v * 100)}%` },
  { key: 'responseLatencySec', label: '반응까지', chartLabel: '주별 아이 소리에 답하기까지 걸린 시간(평균)', format: (v) => `${v}초` },
  { key: 'distressPerTenMinutes', label: '크게 운 횟수', chartLabel: '주별 크게 운 횟수(10분당)', format: (v) => `${v}회` },
];

function metricInfo(metric: WeekMetric) {
  return WEEK_METRICS.find((m) => m.key === metric) ?? WEEK_METRICS[0];
}

/** 이 주간 기록에 값이 하나라도 있는 항목만(공유하지 않은 항목은 서버가 빼고 준다). */
export function availableMetrics(weeks: WeekSummary[]): WeekMetric[] {
  return WEEK_METRICS.filter((m) => weeks.some((w) => w[m.key] != null)).map((m) => m.key);
}

/**
 * 주간 막대(단일 계열). 기본은 함께한 시간 비율이고, metric으로 다른 항목을 고를 수 있다.
 * 막대마다 마우스/터치 툴팁(<title>)과 아래 표(접기)로 같은 값을 제공한다.
 */
export function WeeklyBars({
  weeks,
  metric = 'jointPlayRatio',
  emptyText = '공유된 주간 기록이 아직 없어요.',
}: {
  weeks: WeekSummary[];
  metric?: WeekMetric;
  emptyText?: string;
}) {
  const info = metricInfo(metric);
  const data = weeks.filter((w) => w[metric] != null);
  if (data.length === 0) return <p className="muted">{emptyText}</p>;
  // 비율은 0~1 그대로, 나머지는 이 기간의 가장 큰 값을 꼭대기로 둔다(다른 집과 견주는 기준선은 없다).
  const top = metric === 'jointPlayRatio' ? 1 : Math.max(...data.map((w) => w[metric] ?? 0), 0) || 1;
  const W = 320;
  const H = 150;
  const padTop = 22;
  const bottom = 24;
  const plotH = H - padTop - bottom;
  const slot = W / Math.max(data.length, 4);
  const bw = Math.min(28, slot * 0.55);
  const last = data.length - 1;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={info.chartLabel}>
      <line className="axis" x1={0} x2={W} y1={padTop + plotH} y2={padTop + plotH} />
      {data.map((w, i) => {
        const value = w[metric] ?? 0;
        const ratio = Math.max(0, Math.min(1, value / top));
        const h = Math.max(2, ratio * plotH);
        const x = i * slot + (slot - bw) / 2;
        const y = padTop + plotH - h;
        const r = Math.min(4, bw / 2, h);
        const d = `M${x},${padTop + plotH} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${padTop + plotH} Z`;
        const label = `${w.weekStart.slice(5).replace('-', '/')}`;
        return (
          <g key={w.weekStart}>
            <path className={i === last ? 'bar now' : 'bar'} d={d}>
              <title>{`${label} 주: ${info.label} ${info.format(value)} · 기록 ${w.recordCount}개`}</title>
            </path>
            <text x={x + bw / 2} y={H - 6} textAnchor="middle">
              {label}
            </text>
            {i === last && (
              <text className="value" x={x + bw / 2} y={y - 6} textAnchor="middle">
                {info.format(value)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * 주간 기록 막대 + 항목 고르기. 값이 있는 항목이 둘 이상일 때만 고르는 줄을 보인다.
 * 고른 항목은 화면에 있는 동안만 기억한다.
 */
export function WeeklyChart({ weeks, idPrefix }: { weeks: WeekSummary[]; idPrefix: string }) {
  const metrics = availableMetrics(weeks);
  const [picked, setPicked] = useState<WeekMetric>('jointPlayRatio');
  const metric = metrics.includes(picked) ? picked : (metrics[0] ?? 'jointPlayRatio');
  const info = metricInfo(metric);
  const labelId = `${idPrefix}-metric-label`;
  return (
    <>
      {metrics.length > 1 && (
        <>
          <span className="sr-only" id={labelId}>
            막대로 볼 항목
          </span>
          <div className="tabs" role="group" aria-labelledby={labelId} style={{ marginBottom: 8 }}>
            {WEEK_METRICS.filter((m) => metrics.includes(m.key)).map((m) => (
              <button
                key={m.key}
                type="button"
                aria-pressed={metric === m.key}
                data-demo={`weekly-metric-${m.key}`}
                onClick={() => setPicked(m.key)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </>
      )}
      <p className="muted" style={{ margin: '0 0 4px' }} aria-live="polite">
        {info.chartLabel}
      </p>
      <WeeklyBars weeks={weeks} metric={metric} />
    </>
  );
}

export function WeeklyTable({ weeks }: { weeks: WeekSummary[] }) {
  const has = (k: keyof WeekSummary) => weeks.some((w) => w[k] !== undefined && w[k] !== null);
  return (
    <table className="data">
      <thead>
        <tr>
          <th>주 시작</th>
          {has('recordCount') && <th>기록</th>}
          {has('jointPlayRatio') && <th>함께한 시간</th>}
          {has('responseLatencySec') && <th>반응까지</th>}
          {has('distressPerTenMinutes') && (
            <th>
              크게 운 횟수 <span style={{ whiteSpace: 'nowrap' }}>(10분당)</span>
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {weeks.map((w) => (
          <tr key={w.weekStart}>
            <td>{w.weekStart.slice(5).replace('-', '/')}</td>
            {has('recordCount') && <td>{w.recordCount != null ? `${w.recordCount}개` : '–'}</td>}
            {has('jointPlayRatio') && <td>{w.jointPlayRatio != null ? `${Math.round(w.jointPlayRatio * 100)}%` : '–'}</td>}
            {has('responseLatencySec') && <td>{w.responseLatencySec != null ? `${w.responseLatencySec}초` : '–'}</td>}
            {has('distressPerTenMinutes') && <td>{w.distressPerTenMinutes != null ? `${w.distressPerTenMinutes}회` : '–'}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** useLoad·usePagedList 결과 중 불러오는 상태를 그리는 데 필요한 것. */
interface LoadLike {
  loading: boolean;
  error: unknown;
  data?: unknown;
  items?: unknown;
  reload: () => void;
}

/**
 * 처음 불러오는 중이면 불러오는 표시, 불러오지 못했으면 '…을 불러오지 못했어요 + 다시 불러오기'를 그린다.
 * 둘 다 아니면 null이라 `loadStateView(x, '메모') ?? 목록` 처럼 쓴다. 이미 받아 둔 내용이 있으면 그것을 그대로 둔다.
 */
export function loadStateView(load: LoadLike, what?: string): ReactNode {
  const has = load.data != null || load.items != null;
  if (load.loading && !has) return <Loading />;
  if (load.error && !has) {
    return (
      <div>
        <p className="error" role="alert">
          {what ? `${what} 불러오지 못했어요. ` : ''}
          {errorMessage(load.error)}
        </p>
        <button type="button" className="btn small secondary" onClick={load.reload}>
          다시 불러오기
        </button>
      </div>
    );
  }
  return null;
}

/**
 * 목록 아래 '더 보기'. 다음 쪽이 있을 수 있을 때만 보인다. 다 불러와서 버튼이 사라지면
 * '모두 보여 드렸어요' 문장으로 포커스를 옮겨 누른 자리를 잃지 않게 한다.
 */
export function MoreButton({
  list,
  demo,
  label = '더 보기',
}: {
  list: { hasMore: boolean; loadingMore: boolean; moreError: unknown; loadMore: () => void };
  demo?: string;
  label?: string;
}) {
  const [clicked, setClicked] = useState(false);
  const endRef = useRef<HTMLParagraphElement>(null);
  const showEnd = clicked && !list.hasMore && !list.loadingMore;
  useEffect(() => {
    if (showEnd) endRef.current?.focus();
  }, [showEnd]);
  if (showEnd) {
    return (
      <p ref={endRef} className="muted" tabIndex={-1} style={{ margin: '10px 0 0' }}>
        모두 보여 드렸어요.
      </p>
    );
  }
  if (!list.hasMore) return null;
  return (
    <div style={{ marginTop: 10 }}>
      <ErrorText error={list.moreError} />
      <button
        type="button"
        className="btn small secondary"
        data-demo={demo}
        // 초점을 잃지 않게 disabled 대신 aria-disabled. 겹친 요청은 loadMore가 막는다.
        aria-disabled={list.loadingMore || undefined}
        onClick={() => {
          setClicked(true);
          list.loadMore();
        }}
      >
        {list.loadingMore ? '불러오는 중…' : label}
      </button>
    </div>
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
