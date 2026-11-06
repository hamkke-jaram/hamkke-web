import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { Delivery, Goal, GoalStatus, Observation, SharedSummary } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { ErrorText, Loading, Section, WeeklyBars, WeeklyTable, formatAge, formatDate, useLoad } from '../../components/ui';

const STATUS_LABEL: Record<GoalStatus, string> = { IN_PROGRESS: '진행 중', ACHIEVED: '이뤘어요', ARCHIVED: '보관' };

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function TeacherChild() {
  const { childId } = useParams();
  const id = Number(childId);
  const { user } = useAuth();
  const summary = useLoad(() => api<SharedSummary>('GET', `/teacher/children/${id}/shared-summary?weeks=8`), [id]);
  const goals = useLoad(() => api<Goal[]>('GET', `/children/${id}/goals`), [id]);
  const notes = useLoad(() => api<Observation[]>('GET', `/children/${id}/observations?limit=30`), [id]);
  const sharesCards = summary.data?.sharedItems.includes('COACHING_CARDS') ?? false;
  const cards = useLoad(
    () => (sharesCards ? api<Delivery[]>('GET', `/children/${id}/card-deliveries?limit=5`) : Promise.resolve([] as Delivery[])),
    [id, sharesCards],
  );

  const [goalTitle, setGoalTitle] = useState('');
  const [goalDesc, setGoalDesc] = useState('');
  const [note, setNote] = useState('');
  const [noteDate, setNoteDate] = useState(today());
  const [error, setError] = useState<unknown>(null);

  if (summary.loading) return <Loading />;
  if (summary.error || !summary.data) return <ErrorText error={summary.error ?? new Error('찾을 수 없어요.')} />;
  const s = summary.data;
  const metricShared = s.sharedItems.some((i) => i !== 'COACHING_CARDS');

  async function addGoal(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api('POST', `/children/${id}/goals`, { title: goalTitle, description: goalDesc });
      setGoalTitle('');
      setGoalDesc('');
      goals.reload();
    } catch (err) {
      setError(err);
    }
  }

  async function setStatus(g: Goal, status: GoalStatus) {
    try {
      await api('PATCH', `/children/${id}/goals/${g.id}`, { status });
      goals.reload();
    } catch (err) {
      setError(err);
    }
  }

  async function removeGoal(g: Goal) {
    try {
      await api('DELETE', `/children/${id}/goals/${g.id}`);
      goals.reload();
    } catch (err) {
      setError(err);
    }
  }

  async function addNote(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api('POST', `/children/${id}/observations`, { content: note, observedOn: noteDate });
      setNote('');
      notes.reload();
    } catch (err) {
      setError(err);
    }
  }

  async function removeNote(n: Observation) {
    try {
      await api('DELETE', `/children/${id}/observations/${n.id}`);
      notes.reload();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}>
        <span className="avatar">{s.child.nickname.slice(0, 1)}</span>
        <div>
          <h1 style={{ margin: 0 }}>{s.child.nickname}</h1>
          <div className="muted">{formatAge(s.child.ageMonths)}</div>
        </div>
      </div>
      <ErrorText error={error} />

      <Section title="가정에서 공유한 기록">
        {!metricShared ? (
          <p className="muted" style={{ margin: 0 }}>
            보호자가 아직 공유한 기록 항목이 없어요.
          </p>
        ) : s.weeks.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            최근 8주 동안 기록이 없어요.
          </p>
        ) : (
          <>
            {s.sharedItems.includes('JOINT_PLAY') && (
              <>
                <div className="muted">주별 함께한 시간 비율</div>
                <WeeklyBars weeks={s.weeks} />
              </>
            )}
            <WeeklyTable weeks={s.weeks} />
          </>
        )}
      </Section>

      {sharesCards && cards.data && cards.data.length > 0 && (
        <Section title="가정에서 받은 코칭">
          {cards.data.map((d) => (
            <div key={d.id} className="list-item" style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <strong>{d.card.title}</strong>
                <div className="muted">
                  {formatDate(d.deliveredAt)}
                  {d.triedAt && ' · 가정에서 해봤어요'}
                </div>
              </div>
            </div>
          ))}
        </Section>
      )}

      <Section title="아이 목표">
        {goals.data?.length === 0 && <p className="muted">아직 목표가 없어요.</p>}
        {goals.data?.map((g) => (
          <div key={g.id} className="list-item" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div className="row wrap" style={{ gap: 6 }}>
                <strong>{g.title}</strong>
                <span className={g.status === 'ACHIEVED' ? 'chip brand' : 'chip'}>{STATUS_LABEL[g.status]}</span>
              </div>
              {g.description && <div className="muted">{g.description}</div>}
              <div className="muted">{g.teacherName}</div>
              {g.teacherId === user?.id && (
                <div className="row wrap" style={{ marginTop: 6, gap: 6 }}>
                  {g.status !== 'ACHIEVED' && (
                    <button className="btn small secondary" onClick={() => void setStatus(g, 'ACHIEVED')}>
                      이뤘어요
                    </button>
                  )}
                  {g.status !== 'IN_PROGRESS' && (
                    <button className="btn small secondary" onClick={() => void setStatus(g, 'IN_PROGRESS')}>
                      다시 진행
                    </button>
                  )}
                  {g.status !== 'ARCHIVED' && (
                    <button className="btn small ghost" onClick={() => void setStatus(g, 'ARCHIVED')}>
                      보관
                    </button>
                  )}
                  <button className="btn small ghost" onClick={() => void removeGoal(g)}>
                    삭제
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        <form onSubmit={addGoal} style={{ marginTop: 12 }}>
          <label className="field">
            <span>새 목표</span>
            <input
              type="text"
              maxLength={60}
              required
              placeholder="예: 놀이 시간에 친구에게 장난감 건네기"
              value={goalTitle}
              onChange={(e) => setGoalTitle(e.target.value)}
            />
          </label>
          <label className="field">
            <span>설명 (선택)</span>
            <textarea maxLength={500} value={goalDesc} onChange={(e) => setGoalDesc(e.target.value)} />
          </label>
          <button className="btn block" disabled={!goalTitle.trim()}>
            목표 추가
          </button>
        </form>
      </Section>

      <Section title="관찰 메모">
        <form onSubmit={addNote}>
          <label className="field">
            <span>관찰한 날</span>
            <input type="date" max={today()} required value={noteDate} onChange={(e) => setNoteDate(e.target.value)} />
          </label>
          <label className="field">
            <span>메모</span>
            <textarea
              maxLength={1000}
              required
              placeholder="잘한 점, 즐거워한 활동을 중심으로 적어 주세요."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <button className="btn block" disabled={!note.trim()}>
            메모 남기기
          </button>
        </form>
        {notes.data?.map((n) => (
          <div key={n.id} className="list-item" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div>{n.content}</div>
              <div className="muted">
                {n.observedOn.slice(5).replace('-', '/')} · {n.teacherName}
              </div>
            </div>
            {n.teacherId === user?.id && (
              <button className="btn small ghost" onClick={() => void removeNote(n)} aria-label="메모 삭제">
                삭제
              </button>
            )}
          </div>
        ))}
      </Section>
    </div>
  );
}
