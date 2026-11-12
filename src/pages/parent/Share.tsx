import { useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, errorMessage } from '../../api/client';
import type { InviteCode, LinkedTeacher, ShareSettings } from '../../api/types';
import { ErrorText, Loading, Section, formatDate, useLoad } from '../../components/ui';

const ITEMS: Array<{ key: keyof Omit<ShareSettings, 'updatedAt'>; label: string; hint: string }> = [
  { key: 'jointPlay', label: '함께한 시간', hint: '주별 함께한 시간과 비율' },
  { key: 'responseLatency', label: '반응까지 걸린 시간', hint: '주별 평균' },
  { key: 'distress', label: '크게 운 횟수', hint: '주별 10분당 횟수' },
  { key: 'coachingCards', label: '받은 코칭 카드', hint: '카드 제목과 내용' },
];

export default function Share() {
  const { childId } = useParams();
  const id = Number(childId);
  const settings = useLoad(() => api<ShareSettings>('GET', `/children/${id}/share-settings`), [id]);
  const teachers = useLoad(() => api<LinkedTeacher[]>('GET', `/children/${id}/teachers`), [id]);
  const [code, setCode] = useState<InviteCode | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [issuing, setIssuing] = useState(false);
  // 렌더링 전에 연달아 눌러도 저장이 겹치지 않도록 ref로 한 번 더 막는다.
  const savingRef = useRef(false);

  async function toggle(key: keyof Omit<ShareSettings, 'updatedAt'>, value: boolean) {
    if (!settings.data || savingRef.current) return;
    const confirmed = settings.data; // 마지막으로 서버가 확인해 준 상태
    const next = { ...confirmed, [key]: value };
    savingRef.current = true;
    settings.setData(next);
    setSaving(true);
    setError(null);
    try {
      settings.setData(
        await api<ShareSettings>('PUT', `/children/${id}/share-settings`, {
          jointPlay: next.jointPlay,
          responseLatency: next.responseLatency,
          distress: next.distress,
          coachingCards: next.coachingCards,
        }),
      );
    } catch (e) {
      settings.setData(confirmed);
      setError(new Error(`공유 설정을 저장하지 못해서 이전 설정으로 되돌려 두었어요. (${errorMessage(e)})`));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function issue() {
    if (issuing) return;
    setIssuing(true);
    setError(null);
    try {
      setCode(await api<InviteCode>('POST', `/children/${id}/invite-codes`));
    } catch (e) {
      setError(e);
    } finally {
      setIssuing(false);
    }
  }

  async function unlink(t: LinkedTeacher) {
    try {
      await api('DELETE', `/children/${id}/teachers/${t.teacherId}`);
      teachers.reload();
    } catch (e) {
      setError(e);
    }
  }

  return (
    <div>
      <h1>선생님과 나누기</h1>
      <p className="lead">
        기록은 기본적으로 부모님만 볼 수 있어요. 켜 둔 항목만 연결된 선생님이 주 단위 요약으로 볼 수 있어요.
      </p>
      <ErrorText error={error} />

      <Section title="공유할 항목" action={saving ? <span className="muted">저장 중…</span> : undefined}>
        {settings.loading && <Loading />}
        {settings.data &&
          ITEMS.map((it) => (
            <label key={it.key} className="switch-row">
              <span>
                <strong>{it.label}</strong>
                <br />
                <span className="muted">{it.hint}</span>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={settings.data![it.key] as boolean}
                disabled={saving}
                onChange={(e) => void toggle(it.key, e.target.checked)}
              />
            </label>
          ))}
      </Section>

      <Section title="선생님 초대">
        <p className="muted" style={{ marginTop: 0 }}>
          코드를 선생님께 전해 주세요. 72시간 동안 한 번만 쓸 수 있어요.
        </p>
        {code && (
          <>
            <div className="code-box" aria-label="초대 코드">
              {code.code.slice(0, 4)}-{code.code.slice(4)}
            </div>
            <p className="muted">
              {new Date(code.expiresAt).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              까지 쓸 수 있어요.
            </p>
            <p className="muted">
              코드는 이 화면에서 한 번만 보여 드려요. 화면을 나가기 전에 선생님께 전해 주세요. 새 코드를 만들어도 앞서
              만든 코드는 기한까지 쓸 수 있고, 아직 쓰지 않은 코드는 3개까지 둘 수 있어요.
            </p>
            {typeof navigator.share === 'function' && (
              <button
                className="btn secondary block"
                style={{ marginBottom: 12 }}
                onClick={() =>
                  void navigator
                    .share({ text: `함께자람 초대 코드: ${code.code} (72시간 동안 한 번 사용 가능)` })
                    .catch(() => undefined)
                }
              >
                코드 보내기
              </button>
            )}
          </>
        )}
        <button className={code ? 'btn block ghost' : 'btn block'} disabled={issuing} onClick={() => void issue()}>
          {issuing ? '만드는 중…' : code ? '새 초대 코드 만들기' : '초대 코드 만들기'}
        </button>
      </Section>

      <Section title="연결된 선생님">
        {teachers.data?.length === 0 && <p className="muted">아직 연결된 선생님이 없어요.</p>}
        {teachers.data?.map((t) => (
          <div key={t.teacherId} className="list-item">
            <span className="avatar">{t.displayName.slice(0, 1)}</span>
            <span style={{ flex: 1 }}>
              <strong>{t.displayName}</strong>
              <br />
              <span className="muted">{formatDate(t.linkedAt)} 연결</span>
            </span>
            <button className="btn small danger" onClick={() => void unlink(t)}>
              연결 해제
            </button>
          </div>
        ))}
      </Section>
    </div>
  );
}
