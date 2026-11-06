import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import type { Child } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { ErrorText, Loading } from '../../components/ui';

function monthsAgo(n: number) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function ChildNew() {
  const { policies } = useAuth();
  const nav = useNavigate();
  const [nickname, setNickname] = useState('');
  const [birth, setBirth] = useState('');
  const [guardian, setGuardian] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  if (!policies) return <Loading />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!policies) return;
    setBusy(true);
    setError(null);
    try {
      const c = await api<Child>('POST', '/children', {
        nickname,
        birthYearMonth: birth,
        guardianConsent: { agreed: guardian, version: policies.guardianVersion },
      });
      nav(`/p/children/${c.id}`, { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <h1>아이 등록</h1>
      <p className="lead">실명 대신 집에서 부르는 별칭을 써 주세요.</p>
      <label className="field">
        <span>별칭</span>
        <input type="text" required maxLength={20} placeholder="예: 하늘" value={nickname} onChange={(e) => setNickname(e.target.value)} />
      </label>
      <label className="field">
        <span>태어난 해와 달</span>
        <input type="month" required min={monthsAgo(83)} max={monthsAgo(0)} value={birth} onChange={(e) => setBirth(e.target.value)} />
      </label>

      <section className="card warm">
        <h2>법정대리인 동의</h2>
        <p style={{ marginTop: 0 }}>
          만 14세 미만 아동의 정보는 법정대리인(보호자)의 동의가 있어야 저장할 수 있어요. 함께자람은 아래 정보만 저장해요.
        </p>
        <ul className="muted" style={{ paddingLeft: 20 }}>
          <li>아이 별칭, 태어난 해와 달</li>
          <li>폰 안에서 계산한 상호작용 수치(영상·소리는 저장하지 않음)</li>
          <li>보호자가 공유를 허락한 항목에 한해 연결된 선생님이 보는 주간 요약</li>
        </ul>
        <p className="muted">아이 정보를 삭제하면 언제든 동의를 철회할 수 있고, 관련 기록은 즉시 지워져요.</p>
        <label className="check">
          <input type="checkbox" checked={guardian} onChange={(e) => setGuardian(e.target.checked)} />
          <span>
            <strong>[필수] 저는 이 아이의 법정대리인이며, 위 내용에 동의해요.</strong>
          </span>
        </label>
      </section>

      <ErrorText error={error} />
      <button className="btn block" disabled={busy || !guardian}>
        {busy ? '등록하는 중…' : '등록하기'}
      </button>
    </form>
  );
}
