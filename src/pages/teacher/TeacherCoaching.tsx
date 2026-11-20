import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSharedDetail, watchSharedVisibility } from './useSharedDetail';
import { ApiError } from '../../api/client';
import type { Delivery } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import SubHead from '../../components/SubHead';
import { poseFor, poseSrc } from '../../components/coachingArt';
import { usePagedList, type PagedList } from '../../components/paging';
import { Loading, MoreButton, loadStateView } from '../../components/ui';
import { firstSentence, monthLabel, splitSteps } from '../parent/coachText';
import { kstDateKey } from '../parent/week';
import { DaycareCoaching } from './DaycareCoaching';
import { CoachingReviewLinks, CoachingRows, sharedDayLabel, type CoachPick } from './CoachingRows';
import { ChevronIcon } from '../parent/icons';
import { artClass } from '../parent/parentMotion';
import { sourceUrl } from '../../ai/EvidenceDetails';
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

function monthKey(iso: string) {
  return kstDateKey(Date.parse(iso)).slice(0, 7);
}

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
  picked,
  setPicked,
  pick,
  onAccessChanged,
}: {
  childId: number;
  picked: string | null;
  setPicked: (month: string) => void;
  pick?: CoachPick;
  onAccessChanged?: (reason: ApiError) => void;
}) {
  const list = useDeliveries(childId);
  const months = useMemo(() => {
    const keys: string[] = [];
    for (const d of list.items ?? []) {
      const k = monthKey(d.deliveredAt);
      if (k && !keys.includes(k)) keys.push(k);
    }
    return keys; // 최신 달이 앞
  }, [list.items]);

  if (list.loading && !list.items) return <Loading />;
  const notice = list.error && !list.items && notShared(list.error) ? <NotSharedNote />
    : loadStateView(list, '코칭을') ?? (months.length === 0 ? <p className="muted th-empty">아직 가정에서 받은 코칭이 없어요.</p> : null);
  if (notice) return <>{notice}{!pick && <CoachingReviewLinks childId={childId} />}</>;

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
      {onAccessChanged ? (
        <DaycareCoaching key={month} childId={childId} month={month} rows={rows} onAccessChanged={onAccessChanged} />
      ) : <CoachingRows childId={childId} rows={rows} pick={pick} />}
      <MoreButton list={list} label="이전 코칭 더 불러오기" />
    </>
  );
}

/** 선생님 홈 → AI 코칭 확인하기. */
export function TeacherCoachingList() {
  const id = Number(useParams().childId);
  const { user } = useAuth();
  return <SharedCoachingPage key={`${user?.id}-${id}`} childId={id} />;
}

function SharedCoachingPage({ childId }: { childId: number }) {
  const [visible, setVisible] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [accessError, setAccessError] = useState<ApiError | null>(null);
  useEffect(() => watchSharedVisibility(
    () => { setAccessError(null); setVisible(true); },
    () => setVisible(false),
  ), []);

  return (
    <div className="coach-list-page">
      <SubHead title="가정에서 공유된 코칭" icon="close" fallback="/t" />
      {!visible ? <Loading /> : accessError ? (
        <div>
          {accessError.status === 409 ? <p>공유된 코칭이 바뀌었어요.</p> : accessError.status === 401
            ? <p>로그인 상태를 확인해 주세요.</p> : <NotSharedNote />}
          <button type="button" className="btn secondary small" onClick={() => setAccessError(null)}>다시 불러오기</button>
          {accessError.status !== 401 && <CoachingReviewLinks childId={childId} />}
        </div>
      ) : (
        <CoachMonths childId={childId} picked={picked} setPicked={setPicked} onAccessChanged={setAccessError} />
      )}
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
  const [picked, setPicked] = useState<string | null>(null);
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
      <CoachMonths key={childId} childId={childId} picked={picked} setPicked={setPicked} pick={{ selectedId, onPick }} />
      {/* iOS 앱은 웹의 머리줄(×)을 감추고, 이 고르기는 따로 된 화면이 아니라 앱의 뒤로도 닿지 않는다. 늘 보이는 닫기를 둔다. */}
      <button type="button" className="btn secondary block" data-demo="th-coach-picker-cancel" onClick={onClose}>
        고르지 않고 돌아가기
      </button>
    </div>
  );
}

export function TeacherCoachingDetail() {
  const { childId, deliveryId } = useParams();
  const id = Number(childId);
  const did = Number(deliveryId);
  const nav = useNavigate();
  const list = useSharedDetail<Delivery>(`/children/${id}/card-deliveries/${did}`);
  const delivery = list.data;

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
  const reference = sourceUrl(card.sourceUrl);
  return (
    <div className="coach-detail">
      <SubHead title="가정에서 받은 코칭" fallback={`/t/children/${id}/coaching`} />
      <section className="cd-hero" aria-labelledby="tcd-title">
        <p className="cd-label">{sharedDayLabel(delivery.deliveredAt)}</p>
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
        출처: {reference ? <a href={reference} target="_blank" rel="noopener noreferrer">{card.sourceTitle}</a> : card.sourceTitle}
        {card.author && ` · 작성 ${card.author}`}
        {card.reviewer && ` · 검수 ${card.reviewer}`}
      </p>
      <button
        type="button"
        className="btn block cd-done"
        data-demo="th-coach-write"
        onClick={() => nav(`/t/children/${id}/story/new`, { state: { deliveryId: delivery.id } })}
      >
        이 코칭으로 이야기 쓰기
      </button>
    </div>
  );
}
