import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { Child, Delivery, Goal, Observation, WeekSummary } from '../../api/types';
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

export default function ChildHome() {
  const { childId } = useParams();
  const id = Number(childId);
  const nav = useNavigate();
  const child = useLoad(() => api<Child>('GET', `/children/${id}`), [id]);
  const weekly = useLoad(() => api<{ weeks: WeekSummary[] }>('GET', `/children/${id}/weekly-summary?weeks=8`), [id]);
  const cards = useLoad(() => api<Delivery[]>('GET', `/children/${id}/card-deliveries?limit=10`), [id]);
  const goals = useLoad(() => api<Goal[]>('GET', `/children/${id}/goals`), [id]);
  const notes = useLoad(() => api<Observation[]>('GET', `/children/${id}/observations?limit=5`), [id]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<unknown>(null);

  if (child.loading) return <Loading />;
  if (child.error || !child.data) return <ErrorText error={child.error ?? new Error('아이 정보를 찾을 수 없어요.')} />;
  const c = child.data;
  const weeks = weekly.data?.weeks ?? [];
  const latest = cards.data?.[0];
  const activeGoals = (goals.data ?? []).filter((g) => g.status !== 'ARCHIVED');

  async function markTried(d: Delivery) {
    const updated = await api<Delivery>('POST', `/children/${id}/card-deliveries/${d.id}/tried`);
    cards.setData((list) => list?.map((x) => (x.id === d.id ? updated : x)) ?? null);
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

      {latest && (
        <>
          <h2>이번 코칭</h2>
          <CoachingCardView card={latest.card} delivery={latest} onTried={() => void markTried(latest)} />
        </>
      )}

      <Section title="주간 기록">
        {weekly.loading ? (
          <Loading />
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

      {cards.data && cards.data.length > 1 && (
        <details className="card">
          <summary>지난 코칭 카드 {cards.data.length - 1}장</summary>
          {cards.data.slice(1).map((d) => (
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
