import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import type { Delivery } from '../../api/types';
import SubHead from '../../components/SubHead';
import TriableCard from '../../components/TriableCard';
import { poseFor, poseSrc } from '../../components/coachingArt';
import { usePagedList } from '../../components/paging';
import { Loading, MoreButton, loadStateView } from '../../components/ui';
import { dayLabel, firstSentence, monthKey, monthLabel, splitSteps } from './coachText';
import { ChevronIcon } from './icons';
import { artClass, useTriedCheer } from './parentMotion';
import './parent.css';

/*
 * Figma 2판 코칭 화면 두 개.
 * - /p/children/:id/coaching        '홈_전체보기': 달별로 받은 코칭 카드 목록(‹ 2026년 11월 ›).
 * - /p/children/:id/coaching/:did   '오늘의 코칭': 색 띠(그림·제목·한 줄) → 이렇게 해주세요(단계) → 왜 도움이 될까요?(근거·출처) → 확인하고 홈으로.
 * 카드 내용은 서버의 코칭 카드 그대로다(사람이 쓰고 출처가 있는 카드). 단계는 본문 문장을 나눈 것이다.
 */

const PAGE = 30;

/**
 * '왜 도움이 될까요?' 상자: 공통 코칭 카드(근거·출처·작성·검수, '오늘 해봤어요') 그대로.
 * '오늘 해봤어요'를 누르면 하트가 떠오르고 돌아다니는 모찌가 기뻐한다(보호자가 한 일에만 반응한다).
 */
function WhyCard({ childId, delivery, onUpdated }: { childId: number; delivery: Delivery; onUpdated: (d: Delivery) => void }) {
  const cheer = useTriedCheer(delivery, onUpdated);
  return (
    <div className="cd-why-card p-hearts-host">
      <TriableCard childId={childId} delivery={delivery} onUpdated={cheer.onUpdated} />
      {cheer.hearts}
    </div>
  );
}

export function CoachingList() {
  const { childId } = useParams();
  const id = Number(childId);
  const list = usePagedList<Delivery>(`/children/${id}/card-deliveries`, PAGE, [id]);
  const months = useMemo(() => {
    const keys: string[] = [];
    for (const d of list.items ?? []) {
      const k = monthKey(d.deliveredAt);
      if (!keys.includes(k)) keys.push(k);
    }
    return keys; // 최신 달이 앞
  }, [list.items]);
  const [picked, setPicked] = useState<string | null>(null);
  const month = picked && months.includes(picked) ? picked : months[0];
  const at = month ? months.indexOf(month) : -1;
  const rows = (list.items ?? []).filter((d) => monthKey(d.deliveredAt) === month);

  return (
    <div className="coach-list-page">
      <SubHead title="코칭 전체 보기" icon="close" fallback={`/p/children/${id}`} />
      {list.loading ? (
        <Loading />
      ) : (
        loadStateView(list, '코칭 카드를') ??
        (months.length === 0 ? (
          <p className="muted">아직 받은 코칭이 없어요. 영상을 기록하면 오늘의 코칭을 받아요.</p>
        ) : (
          <>
            <div className="month-nav">
              <button
                type="button"
                className="month-btn"
                aria-label="이전 달"
                disabled={at >= months.length - 1}
                onClick={() => setPicked(months[at + 1])}
              >
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
              {rows.map((d, i) => (
                <li key={d.id}>
                  <Link to={`/p/children/${id}/coaching/${d.id}`} state={{ delivery: d }} className="coach-row">
                    <span className={`coach-row-art${i % 2 ? ' lavender' : ''}`}>
                      <img
                        className={artClass(poseFor(d.card)) || undefined}
                        src={poseSrc(poseFor(d.card))}
                        alt=""
                        width={64}
                        height={64}
                        loading="lazy"
                        decoding="async"
                      />
                    </span>
                    <span className="coach-row-text">
                      <span className="coach-row-date">{dayLabel(d.deliveredAt)}</span>
                      <strong>{d.card.title}</strong>
                      <span className="coach-row-line">{firstSentence(d.card.body)}</span>
                    </span>
                    <ChevronIcon size={20} />
                  </Link>
                </li>
              ))}
            </ul>
            <MoreButton list={list} label="이전 코칭 더 불러오기" />
          </>
        ))
      )}
    </div>
  );
}

export function CoachingDetail() {
  const { childId, deliveryId } = useParams();
  const id = Number(childId);
  const did = Number(deliveryId);
  const nav = useNavigate();
  const passed = (useLocation().state as { delivery?: Delivery } | null)?.delivery;
  // 홈·목록에서 오면 카드를 그대로 받아 쓴다. 주소로 바로 열면 최근 카드에서 찾는다.
  const list = usePagedList<Delivery>(passed && passed.id === did ? null : `/children/${id}/card-deliveries`, PAGE, [id, did]);
  const [current, setCurrent] = useState<Delivery | null>(null);
  const delivery = current ?? (passed && passed.id === did ? passed : (list.items ?? []).find((d) => d.id === did));

  if (!delivery) {
    return (
      <div>
        <SubHead title="오늘의 코칭" fallback={`/p/children/${id}`} />
        {list.loading ? <Loading /> : (loadStateView(list, '코칭 카드를') ?? <p className="muted">이 코칭 카드를 찾을 수 없어요.</p>)}
      </div>
    );
  }
  const { card } = delivery;
  const steps = splitSteps(card.body);
  return (
    <div className="coach-detail">
      <SubHead title="오늘의 코칭" fallback={`/p/children/${id}`} />
      <section className="cd-hero" aria-labelledby="cd-title">
        <p className="cd-label">{dayLabel(delivery.deliveredAt)}</p>
        {/* 모찌 그림의 움직임은 공용(coachingArt.ts의 artMotionFor, fe-2 — parentMotion.tsx artClass로 붙인다). 설정이 꺼져 있으면 정지 그림. */}
        <img className={`cd-art ${artClass(poseFor(card))}`.trim()} src={poseSrc(poseFor(card))} alt="" width={200} height={200} decoding="async" />
        <h2 id="cd-title" className="cd-title">
          {card.title}
        </h2>
        <p className="cd-line">{firstSentence(card.body)}</p>
      </section>

      <section className="cd-sec" aria-labelledby="cd-how">
        <h2 id="cd-how">이렇게 해주세요</h2>
        <ol className="cd-steps">
          {steps.map((s, i) => (
            <li key={i}>
              <span className="cd-num" aria-hidden="true">
                {i + 1}
              </span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="cd-why" aria-labelledby="cd-why-h">
        <h2 id="cd-why-h">왜 도움이 될까요?</h2>
        {/* 근거·출처·작성·검수와 '오늘 해봤어요'는 공통 카드 그대로(카드는 늘 출처와 함께 전한다). */}
        <WhyCard childId={id} delivery={delivery} onUpdated={setCurrent} />
      </section>

      <button type="button" className="btn block cd-done" onClick={() => nav(`/p/children/${id}`)}>
        확인하고 홈으로
      </button>
    </div>
  );
}
