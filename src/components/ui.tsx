import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type Ref, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import { FOCUS_LABEL } from '../ai/labels';
import { errorMessage } from '../api/client';
import type { Card, Delivery, SupportResource, WeekSummary } from '../api/types';
import { FALLBACK_DISCLAIMER, useAuth } from '../auth/AuthContext';
import { useMotionOn } from '../motion';
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

const BAR_TWEEN_MS = 520;

/**
 * 막대 높이(0~1)를 지난 값에서 새 값으로 부드럽게 옮긴다. 항목을 바꿀 때 그림이 갈아 끼워지지 않고
 * 수치만큼 늘고 줄어드는 것이 보이게 하려는 것이다. 새로 생긴 막대는 0에서 자란다.
 * 처음 그릴 때는 바로 최종 높이로 그린다(서버 렌더·움직임 끔에서도 같은 그림).
 */
function useTweenedRatios(targets: Record<string, number>, motionOn: boolean): Record<string, number> {
  const [shown, setShown] = useState(targets);
  const shownRef = useRef(targets);
  const key = JSON.stringify(targets);
  useEffect(() => {
    const to = JSON.parse(key) as Record<string, number>;
    const from = shownRef.current;
    const same =
      Object.keys(to).length === Object.keys(from).length && Object.keys(to).every((k) => from[k] === to[k]);
    if (same) return;
    if (!motionOn || typeof requestAnimationFrame !== 'function') {
      shownRef.current = to;
      setShown(to);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / BAR_TWEEN_MS);
      const ease = 1 - Math.pow(1 - t, 3);
      const next: Record<string, number> = {};
      for (const k of Object.keys(to)) {
        const a = from[k] ?? 0;
        next[k] = a + (to[k] - a) * ease;
      }
      shownRef.current = next;
      setShown(next);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    // 옮기는 중에 다시 바꾸면 그 순간의 높이에서 새 값으로 이어 간다(shownRef가 중간값을 들고 있다).
    return () => cancelAnimationFrame(raf);
  }, [key, motionOn]);
  return shown;
}

/**
 * 막대를 지금 보여 줄지. false인 동안 막대는 0에 있고, true가 되는 순간 각자의 높이까지 자란다.
 * - 접히는 <details> 안: 펼쳐 있는 동안만 true. 접으면 false로 돌아가서, 펼칠 때마다 다시 자란다.
 * - 그 밖(선생님 화면 등): 처음 화면에 들어온 순간 true가 되고 그 뒤로는 바뀌지 않는다(스크롤할 때마다 자라지 않게).
 * 움직임을 끈 화면과 IntersectionObserver가 없는 환경에서는 늘 true다(막대를 0에 두지 않는다).
 */
function useBarsShown(ref: RefObject<Element | null>, motionOn: boolean, ready: boolean): boolean {
  const [shown, setShown] = useState(() => !motionOn || typeof IntersectionObserver !== 'function');
  useEffect(() => {
    if (!motionOn) {
      setShown(true);
      return;
    }
    const el = ref.current;
    if (!ready || !el) return;
    const details = el.closest('details');
    if (details) {
      const sync = () => setShown(details.open);
      sync();
      details.addEventListener('toggle', sync);
      return () => details.removeEventListener('toggle', sync);
    }
    if (typeof IntersectionObserver !== 'function') {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setShown(true);
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, motionOn, ready]);
  return shown;
}

/**
 * 고른 버튼 밑에 깔리는 바탕(thumb)의 자리. 버튼마다 너비가 달라 화면에서 재고, 화면 너비가 바뀌면 다시 잰다.
 * ready는 첫 자리를 잡은 뒤에만 켠다(처음부터 왼쪽 끝에서 미끄러져 오지 않게).
 */
function useTabThumb(ref: RefObject<HTMLDivElement | null>, selected: string) {
  const [thumb, setThumb] = useState<{ left: number; width: number; ready: boolean } | null>(null);
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const measure = () => {
      const btn = box.querySelector<HTMLElement>('button[aria-pressed="true"]');
      if (!btn) return;
      // 접힌 <details> 안이면 너비가 0으로 재어진다. 그때는 바탕을 치워 두어, 펼칠 때 0에서 늘어나는 움직임이 없게 한다.
      if (btn.offsetWidth === 0) {
        setThumb(null);
        return;
      }
      setThumb((cur) => ({ left: btn.offsetLeft, width: btn.offsetWidth, ready: cur !== null }));
    };
    measure();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    ro?.observe(box);
    return () => ro?.disconnect();
  }, [ref, selected]);
  return thumb;
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
  // 비율은 0~1 그대로, 나머지는 이 기간의 가장 큰 값을 꼭대기로 둔다(다른 집과 견주는 기준선은 없다).
  const top = metric === 'jointPlayRatio' ? 1 : Math.max(...data.map((w) => w[metric] ?? 0), 0) || 1;
  const motionOn = useMotionOn();
  const svgRef = useRef<SVGSVGElement>(null);
  const visible = useBarsShown(svgRef, motionOn, data.length > 0);
  const targets: Record<string, number> = {};
  // 보이지 않는 동안에는 모든 막대를 0에 두었다가, 보이는 순간 각자의 높이까지 자라게 한다.
  for (const w of data) targets[w.weekStart] = visible ? Math.max(0, Math.min(1, (w[metric] ?? 0) / top)) : 0;
  // 접을 때(보이지 않게 될 때)는 옮기지 않고 바로 0으로 돌려 둔다. 다시 펼치면 늘 0에서 시작한다.
  const shown = useTweenedRatios(targets, motionOn && visible);
  if (data.length === 0) return <p className="muted">{emptyText}</p>;
  const W = 320;
  const H = 150;
  const padTop = 22;
  const bottom = 24;
  const plotH = H - padTop - bottom;
  const slot = W / Math.max(data.length, 4);
  const bw = Math.min(28, slot * 0.55);
  const last = data.length - 1;
  return (
    <svg ref={svgRef} className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={info.chartLabel}>
      <line className="axis" x1={0} x2={W} y1={padTop + plotH} y2={padTop + plotH} />
      {data.map((w, i) => {
        const value = w[metric] ?? 0;
        // 항목을 바꾸는 동안은 지난 높이에서 새 높이로 옮겨 가는 중간값을 그린다.
        const ratio = shown[w.weekStart] ?? 0;
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
  const tabsRef = useRef<HTMLDivElement>(null);
  const thumb = useTabThumb(tabsRef, metric);
  const swipeFrom = useRef<{ x: number; y: number } | null>(null);

  // 그래프 위를 옆으로 밀면 옆 항목으로 넘어간다(휴대폰에서 버튼까지 손을 옮기지 않아도 되게).
  // 세로 스크롤은 그대로 두려고 가로로 충분히(48px 이상, 세로보다 크게) 민 경우만 넘긴다.
  function swipeEnd(x: number, y: number) {
    const from = swipeFrom.current;
    swipeFrom.current = null;
    if (!from || metrics.length < 2) return;
    const dx = x - from.x;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(y - from.y) * 1.5) return;
    const i = metrics.indexOf(metric);
    const next = metrics[i + (dx < 0 ? 1 : -1)];
    if (next) setPicked(next);
  }

  return (
    <>
      {metrics.length > 1 && (
        <>
          <span className="sr-only" id={labelId}>
            막대로 볼 항목
          </span>
          <div
            ref={tabsRef}
            className={`tabs tabs-slide${thumb ? ' has-thumb' : ''}`}
            role="group"
            aria-labelledby={labelId}
            style={{ marginBottom: 8 }}
          >
            {thumb && (
              <span
                className={`tabs-thumb${thumb.ready ? ' ready' : ''}`}
                aria-hidden="true"
                style={{ width: thumb.width, transform: `translateX(${thumb.left}px)` }}
              />
            )}
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
      <div
        className="chart-swipe"
        onTouchStart={(e) => {
          const t = e.touches[0];
          swipeFrom.current = e.touches.length === 1 && t ? { x: t.clientX, y: t.clientY } : null;
        }}
        onTouchEnd={(e) => {
          const t = e.changedTouches[0];
          if (t) swipeEnd(t.clientX, t.clientY);
        }}
        onTouchCancel={() => {
          swipeFrom.current = null;
        }}
      >
        <WeeklyBars weeks={weeks} metric={metric} />
      </div>
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
