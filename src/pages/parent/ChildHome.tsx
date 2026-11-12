import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../../api/client';
import type { Child, Delivery, Goal, Observation, RecordItem, WeekSummary } from '../../api/types';
import {
  CoachingCardView,
  ErrorText,
  Loading,
  Section,
  WeeklyBars,
  WeeklyTable,
  formatAge,
  formatDate,
  useLoad,
} from '../../components/ui';

const GOAL_STATUS: Record<string, string> = { IN_PROGRESS: '진행 중', ACHIEVED: '이뤘어요', ARCHIVED: '보관' };
/** 서버의 ChildService.MAX_CHILDREN_PER_PARENT와 같은 값. */
const MAX_CHILDREN = 5;
/** 서버의 기록 목록 최대 개수(RecordService.list). */
const RECORD_WINDOW = 100;

/** 서버 RecordResponse에는 저장 시각(createdAt)도 있다. 저장 순서를 알아내는 데만 쓴다. */
type SavedRecord = RecordItem & { createdAt: string };

/**
 * 서버에 가장 나중에 저장된 기록을 고른다. 목록은 촬영 시각(recordedAt) 순이라
 * 갤러리에서 예전 영상을 골라 기록하면 방금 저장한 기록이 맨 앞에 오지 않으므로, 저장 시각과 id로 다시 고른다.
 * 한계: 서버가 촬영 시각 기준 최근 RECORD_WINDOW개만 주므로, 그보다 오래된 촬영일의 영상으로
 * 새로 기록하면 그 기록은 여기서 보이지 않는다(이때는 카드 쪽 비교로 '이번 코칭'이 유지된다).
 */
function newestSaved(records: SavedRecord[] | null): SavedRecord | undefined {
  let best: SavedRecord | undefined;
  for (const r of records ?? []) {
    const diff = best ? Date.parse(r.createdAt) - Date.parse(best.createdAt) : 1;
    if (diff > 0 || (diff === 0 && r.id > best!.id)) best = r;
  }
  return best;
}

export default function ChildHome() {
  const { childId } = useParams();
  const id = Number(childId);
  const nav = useNavigate();
  const child = useLoad(() => api<Child>('GET', `/children/${id}`), [id]);
  const weekly = useLoad(() => api<{ weeks: WeekSummary[] }>('GET', `/children/${id}/weekly-summary?weeks=8`), [id]);
  const cards = useLoad(() => api<Delivery[]>('GET', `/children/${id}/card-deliveries?limit=10`), [id]);
  const goals = useLoad(() => api<Goal[]>('GET', `/children/${id}/goals`), [id]);
  const notes = useLoad(() => api<Observation[]>('GET', `/children/${id}/observations?limit=5`), [id]);
  // 최근 기록들. 가장 나중에 저장된 기록에 카드 대신 상담·기관 안내가 나갔는지 확인하는 데 쓴다.
  const records = useLoad(
    () => api<SavedRecord[]>('GET', `/children/${id}/interaction-records?limit=${RECORD_WINDOW}`),
    [id],
  );
  const siblings = useLoad(() => api<Child[]>('GET', '/children'), []);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<unknown>(null);
  // state는 다시 그려진 뒤에야 바뀌므로, 빠르게 두 번 눌러도 한 번만 보내도록 ref로도 막는다.
  const triedBusy = useRef(false);
  const [triedError, setTriedError] = useState<unknown>(null);

  if (child.loading) return <Loading />;
  if (child.error || !child.data) return <ErrorText error={child.error ?? new Error('아이 정보를 찾을 수 없어요.')} />;
  const c = child.data;
  const weeks = weekly.data?.weeks ?? [];
  // 가장 나중에 저장된 기록에 카드 대신 안내가 나갔다면(NEEDS_ATTENTION) '이번 코칭' 자리에 안내를 보여 주고,
  // 예전 카드는 모두 지난 카드 목록으로 보낸다. 카드는 기록 저장 직후에 전달되므로, 그 안내 기록보다
  // 나중에 전달된 카드가 있으면(=그 뒤에 저장된 기록의 카드) 카드를 보여 준다.
  const newest = newestSaved(records.data);
  const newestCard = cards.data?.[0];
  const showGuidance =
    newest?.changeTrend === 'NEEDS_ATTENTION' && (!newestCard || Date.parse(newest.createdAt) >= Date.parse(newestCard.deliveredAt));
  const latest = records.loading || showGuidance ? undefined : newestCard;
  const pastCards = cards.data ? (showGuidance ? cards.data : cards.data.slice(1)) : [];
  const activeGoals = (goals.data ?? []).filter((g) => g.status !== 'ARCHIVED');
  const childCount = siblings.data?.length ?? 0;

  async function markTried(d: Delivery) {
    if (triedBusy.current) return;
    triedBusy.current = true;
    setTriedError(null);
    try {
      const updated = await api<Delivery>('POST', `/children/${id}/card-deliveries/${d.id}/tried`);
      cards.setData((list) => list?.map((x) => (x.id === d.id ? updated : x)) ?? null);
    } catch (e) {
      setTriedError(new Error(`'해봤어요'를 저장하지 못했어요. 잠시 후 다시 눌러 주세요. (${errorMessage(e)})`));
    } finally {
      triedBusy.current = false;
    }
  }

  async function removeChild() {
    try {
      await api('DELETE', `/children/${id}`);
      nav('/p', { replace: true });
    } catch (e) {
      setDeleteError(e);
    }
  }

  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}>
        <span className="avatar">{c.nickname.slice(0, 1)}</span>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0 }}>{c.nickname}</h1>
          <div className="muted">{formatAge(c.ageMonths)}</div>
        </div>
        <Link to={`/p/children/${id}/share`} className="btn small secondary">
          선생님과 공유
        </Link>
      </div>

      <Link to={`/p/children/${id}/record`} className="btn block" style={{ marginBottom: 16, minHeight: 56, fontSize: 17 }}>
        오늘 함께 논 영상 기록하기
      </Link>

      {showGuidance && (
        <section className="card warm" aria-label="상담·기관 연결 안내">
          <h2>함께 이야기 나눌 곳도 있어요</h2>
          <p style={{ marginTop: 0 }}>
            꾸준히 기록해 주셔서 고마워요. 기록은 그날의 컨디션이나 촬영 환경에 따라서도 달라질 수 있어요. 마음이 쓰이실
            때는 혼자 고민하지 마시고 전문가나 가까운 기관과 편하게 이야기 나눠 보시는 것도 도움이 될 수 있어요.
          </p>
          <Link to="/support" className="btn block secondary">
            상담·기관 연결 안내 보기
          </Link>
        </section>
      )}

      {latest && (
        <>
          <h2>이번 코칭</h2>
          <CoachingCardView card={latest.card} delivery={latest} onTried={() => void markTried(latest)} />
          <ErrorText error={triedError} />
        </>
      )}

      <Section title="주간 기록">
        {weekly.loading ? (
          <Loading />
        ) : weekly.error ? (
          <div>
            <p className="error" role="alert">
              주간 기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
            </p>
            <button type="button" className="btn small secondary" onClick={weekly.reload}>
              다시 불러오기
            </button>
          </div>
        ) : weeks.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            첫 기록을 남기면 주 단위로 변화를 모아 보여 드려요. 매일 볼 필요는 없어요. 한 주에 한두 번이면 충분해요.
          </p>
        ) : (
          <>
            <div className="muted" style={{ marginBottom: 4 }}>
              주별 함께한 시간 비율
            </div>
            <WeeklyBars weeks={weeks} />
            <details>
              <summary>주별 숫자로 보기</summary>
              <WeeklyTable weeks={weeks} />
            </details>
          </>
        )}
      </Section>

      {(activeGoals.length > 0 || (notes.data?.length ?? 0) > 0) && (
        <Section title="선생님 이야기">
          {activeGoals.map((g) => (
            <div key={g.id} className="list-item" style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div className="row" style={{ gap: 6 }}>
                  <strong>{g.title}</strong>
                  <span className={g.status === 'ACHIEVED' ? 'chip brand' : 'chip'}>{GOAL_STATUS[g.status]}</span>
                </div>
                {g.description && <div className="muted">{g.description}</div>}
                <div className="muted">{g.teacherName}</div>
              </div>
            </div>
          ))}
          {notes.data?.map((n) => (
            <div key={n.id} className="list-item" style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div>{n.content}</div>
                <div className="muted">
                  {n.observedOn.slice(5).replace('-', '/')} · {n.teacherName}
                </div>
              </div>
            </div>
          ))}
        </Section>
      )}

      {pastCards.length > 0 && (
        <details className="card">
          <summary>지난 코칭 카드 {pastCards.length}장</summary>
          {pastCards.map((d) => (
            <div key={d.id} className="list-item">
              <div style={{ flex: 1 }}>
                <strong>{d.card.title}</strong>
                <div className="muted">
                  {formatDate(d.deliveredAt)}
                  {d.triedAt && ' · 해봤어요'}
                </div>
              </div>
            </div>
          ))}
        </details>
      )}

      {/* 아이 목록을 못 불러와도 '+ 아이 추가'는 보여 준다. 5명 제한은 서버가 지킨다. */}
      {!siblings.loading && (
        <div className="row" style={{ justifyContent: 'center', gap: 8, marginBottom: 14 }}>
          {childCount > 1 && (
            <Link to="/p" className="btn small ghost">
              다른 아이 보기
            </Link>
          )}
          {childCount < MAX_CHILDREN ? (
            <Link to="/p/children/new" className="btn small ghost">
              + 아이 추가
            </Link>
          ) : (
            <span className="muted">아이는 {MAX_CHILDREN}명까지 등록할 수 있어요.</span>
          )}
        </div>
      )}

      <details className="card">
        <summary>아이 정보 삭제(동의 철회)</summary>
        <p className="muted">
          {c.nickname}의 모든 기록, 코칭 카드, 공유 설정, 선생님 연결과 메모가 즉시 지워지고 되돌릴 수 없어요.
        </p>
        <ErrorText error={deleteError} />
        {confirmDelete ? (
          <div className="row">
            <button className="btn secondary" style={{ flex: 1 }} onClick={() => setConfirmDelete(false)}>
              취소
            </button>
            <button className="btn danger" style={{ flex: 1 }} onClick={() => void removeChild()}>
              삭제하기
            </button>
          </div>
        ) : (
          <button className="btn danger block" onClick={() => setConfirmDelete(true)}>
            삭제
          </button>
        )}
      </details>
    </div>
  );
}
