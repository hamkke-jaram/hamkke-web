import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../../api/client';
import type { Delivery } from '../../api/types';
import SubHead from '../../components/SubHead';
import { poseFor, poseSrc } from '../../components/coachingArt';
import { usePagedList, type PagedList } from '../../components/paging';
import { Loading, MoreButton, loadStateView } from '../../components/ui';
import { dayLabel, firstSentence, monthKey, monthLabel, splitSteps } from '../parent/coachText';
import { ChevronIcon } from '../parent/icons';
import { artClass } from '../parent/parentMotion';
import '../parent/parent.css';
import './teacher.css';

/*
 * 선생님이 보는 '가정에서 공유된 코칭'(Figma '홈_전체보기').
 * - /t/children/:id/coaching        달별 목록. 줄을 누르면 자세히.
 * - /t/children/:id/coaching/:did   자세히(그림·제목·단계·출처) + '이 코칭으로 이야기 쓰기'.
 * - 이야기 쓰기의 '코칭 첨부하기'는 같은 목록을 고르기 모드(CoachPicker)로 쓴다. 고른 줄은 연보라로 칠한다.
 * 보호자가 코칭 카드 공유를 꺼 두면 서버가 404로 답한다 → 공유를 켜면 보인다고 알린다.
 */

const PAGE = 30;

function notShared(error: unknown) {
  return error instanceof ApiError && (error.status === 404 || error.status === 403);
}

export function NotSharedNote() {
  return (
    <p className="muted th-empty" data-demo="th-coach-off">
      보호자가 코칭 카드 공유를 켜면 가정에서 받은 코칭을 볼 수 있고, 이야기에 첨부할 수 있어요.
    </p>
  );
}

export function useDeliveries(childId: number): PagedList<Delivery> {
  return usePagedList<Delivery>(`/children/${childId}/card-deliveries`, PAGE, [childId]);
}

/** 달 넘김 + 카드 줄. pick이 있으면 줄이 '고르기' 버튼이 되고, 고른 줄을 연보라로 칠한다. */
function CoachMonths({
  childId,
  list,
  pick,
}: {
  childId: number;
  list: PagedList<Delivery>;
  pick?: { selectedId: number | null; onPick: (d: Delivery) => void };
}) {
  const months = useMemo(() => {
    const keys: string[] = [];
    for (const d of list.items ?? []) {
      const k = monthKey(d.deliveredAt);
      if (!keys.includes(k)) keys.push(k);
    }
    return keys; // 최신 달이 앞
  }, [list.items]);
  const [picked, setPicked] = useState<string | null>(null);

  if (list.loading && !list.items) return <Loading />;
  if (list.error && !list.items && notShared(list.error)) return <NotSharedNote />;
  const fail = loadStateView(list, '코칭을');
  if (fail) return fail;
  if (months.length === 0) return <p className="muted th-empty">아직 가정에서 받은 코칭이 없어요.</p>;

  const month = picked && months.includes(picked) ? picked : months[0];
  const at = months.indexOf(month);
  const rows = (list.items ?? []).filter((d) => monthKey(d.deliveredAt) === month);

  return (
    <>
      <div className="month-nav">
        <button type="button" className="month-btn" aria-label="이전 달" disabled={at >= months.length - 1} onClick={() => setPicked(months[at + 1])}>
          <ChevronIcon size={22} />
        </button>
        <h2 className="month-title" aria-live="polite">
          {monthLabel(month)}
        </h2>
        <button type="button" className="month-btn next" aria-label="다음 달" disabled={at <= 0} onClick={() => setPicked(months[at - 1])}>
          <ChevronIcon size={22} />
        </button>
      </div>
      <ul className="coach-rows">
        {rows.map((d) => {
          const pose = poseFor(d.card);
          const selected = pick?.selectedId === d.id;
          const inner = (
            <>
              <span className="coach-row-art">
                <img className={artClass(pose) || undefined} src={poseSrc(pose)} alt="" width={64} height={64} loading="lazy" decoding="async" />
              </span>
              <span className="coach-row-text">
                <span className="coach-row-date">{dayLabel(d.deliveredAt)}</span>
                <strong>{d.card.title}</strong>
                <span className="coach-row-line">{firstSentence(d.card.body)}</span>
              </span>
              {selected ? (
                <span className="coach-row-check" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="22" height="22">
                    <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              ) : (
                <ChevronIcon size={20} />
              )}
            </>
          );
          return (
            <li key={d.id}>
              {pick ? (
                <button
                  type="button"
                  className={`coach-row th-pick${selected ? ' picked' : ''}`}
                  aria-pressed={selected}
                  onClick={() => pick.onPick(d)}
                >
                  {inner}
                </button>
              ) : (
                <Link to={`/t/children/${childId}/coaching/${d.id}`} state={{ delivery: d }} className="coach-row">
                  {inner}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      <MoreButton list={list} label="이전 코칭 더 불러오기" />
    </>
  );
}

/** 선생님 홈 → AI 코칭 확인하기. */
export function TeacherCoachingList() {
  const id = Number(useParams().childId);
  const list = useDeliveries(id);
  return (
    <div className="coach-list-page">
      <SubHead title="가정에서 공유된 코칭" icon="close" fallback="/t" />
      <CoachMonths childId={id} list={list} />
    </div>
  );
}

/** 이야기 쓰기의 '코칭 첨부하기': 같은 목록에서 한 장을 고른다. */
export function CoachPicker({
  childId,
  selectedId,
  onPick,
  onClose,
}: {
  childId: number;
  selectedId: number | null;
  onPick: (d: Delivery) => void;
  onClose: () => void;
}) {
  const list = useDeliveries(childId);
  return (
    <div className="coach-list-page" data-demo="th-coach-picker">
      <div className="sub-head">
        <button type="button" className="sub-head-btn" aria-label="닫기" onClick={onClose}>
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        <h1 className="sub-head-title">첨부할 코칭 고르기</h1>
        <span className="sub-head-btn" aria-hidden="true" />
      </div>
      <CoachMonths childId={childId} list={list} pick={{ selectedId, onPick }} />
    </div>
  );
}

export function TeacherCoachingDetail() {
  const { childId, deliveryId } = useParams();
  const id = Number(childId);
  const did = Number(deliveryId);
  const nav = useNavigate();
  const passed = (useLocation().state as { delivery?: Delivery } | null)?.delivery;
  const fromState = passed && passed.id === did ? passed : null;
  const list = usePagedList<Delivery>(fromState ? null : `/children/${id}/card-deliveries`, PAGE, [id, did]);
  const delivery = fromState ?? (list.items ?? []).find((d) => d.id === did);

  if (!delivery) {
    return (
      <div>
        <SubHead title="가정에서 받은 코칭" fallback={`/t/children/${id}/coaching`} />
        {list.loading ? (
          <Loading />
        ) : list.error && notShared(list.error) ? (
          <NotSharedNote />
        ) : (
          (loadStateView(list, '코칭을') ?? <p className="muted">이 코칭을 찾을 수 없어요.</p>)
        )}
      </div>
    );
  }
  const { card } = delivery;
  const pose = poseFor(card);
  return (
    <div className="coach-detail">
      <SubHead title="가정에서 받은 코칭" fallback={`/t/children/${id}/coaching`} />
      <section className="cd-hero" aria-labelledby="tcd-title">
        <p className="cd-label">{dayLabel(delivery.deliveredAt)}</p>
        <img className={`cd-art ${artClass(pose)}`.trim()} src={poseSrc(pose)} alt="" width={200} height={200} decoding="async" />
        <h2 id="tcd-title" className="cd-title">
          {card.title}
        </h2>
        <p className="cd-line">{firstSentence(card.body)}</p>
      </section>
      <section className="cd-sec" aria-labelledby="tcd-how">
        <h2 id="tcd-how">가정에서는 이렇게 해요</h2>
        <ol className="cd-steps">
          {splitSteps(card.body).map((s, i) => (
            <li key={i}>
              <span className="cd-num" aria-hidden="true">
                {i + 1}
              </span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      </section>
      <p className="muted th-source">
        출처: {card.sourceUrl ? <a href={card.sourceUrl} target="_blank" rel="noreferrer">{card.sourceTitle}</a> : card.sourceTitle}
        {card.author && ` · 작성 ${card.author}`}
        {card.reviewer && ` · 검수 ${card.reviewer}`}
      </p>
      <button
        type="button"
        className="btn block cd-done"
        data-demo="th-coach-write"
        onClick={() => nav(`/t/children/${id}/story/new`, { state: { delivery } })}
      >
        이 코칭으로 이야기 쓰기
      </button>
    </div>
  );
}
