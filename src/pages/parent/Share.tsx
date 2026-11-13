import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, errorMessage } from '../../api/client';
import type { AiConsent, InviteCode, LinkedTeacher, ShareSettings } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { ErrorText, Loading, Section, formatDate, useLoad } from '../../components/ui';

type ShareKey = keyof Omit<ShareSettings, 'updatedAt'>;
interface ShareItem {
  key: ShareKey;
  label: string;
  hint: string;
}

const ITEMS: ShareItem[] = [
  { key: 'jointPlay', label: '함께한 시간', hint: '주별 함께한 시간과 비율' },
  { key: 'responseLatency', label: '반응까지 걸린 시간', hint: '주별 평균' },
  { key: 'distress', label: '크게 운 횟수', hint: '주별 10분당 횟수' },
  { key: 'coachingCards', label: '받은 코칭 카드', hint: '카드 제목과 내용' },
];

/** AI 관찰 기록에 딸린 항목. AI 서버가 설정된 경우에 보여 준다(꺼져 있어도 이미 켜 둔 항목이 있으면 끌 수 있게 보여 준다). */
const AI_ITEMS: ShareItem[] = [
  {
    key: 'aiObservations',
    label: '가정의 AI 관찰 기록',
    hint: '가정에서 만든 AI 관찰 기록(글)을 연결된 선생님도 볼 수 있어요.',
  },
  {
    key: 'institutionCapture',
    label: '기관에서 촬영해 관찰 기록 남기기',
    hint: '연결된 선생님이 기관에서 이 아이의 장면 사진을 찍어 AI 관찰 기록을 남길 수 있어요. AI 관찰 기록이 켜져 있는 동안에만 돼요.',
  },
];

export default function Share() {
  const { childId } = useParams();
  const id = Number(childId);
  const settings = useLoad(() => api<ShareSettings>('GET', `/children/${id}/share-settings`), [id]);
  const teachers = useLoad(() => api<LinkedTeacher[]>('GET', `/children/${id}/teachers`), [id]);
  const { policies } = useAuth();
  const aiOn = policies?.aiObservationEnabled === true;
  // 기관 촬영은 AI 관찰 기록이 켜져 있어야 동작한다. 꺼져 있으면 그 사실을 알려 준다(확인하지 못하면 안내만 생략).
  const aiConsent = useLoad(
    () => (aiOn ? api<AiConsent>('GET', `/children/${id}/ai-consent`).catch(() => null) : Promise.resolve(null)),
    [id, aiOn],
  );
  // AI 서버가 꺼져 있어도, 이미 켜 둔 AI 공유 항목은 여기서 끌 수 있어야 한다(선생님에게는 이미 있는 기록이 계속 보인다).
  // 한 번 보인 항목은 끈 뒤에도 이 화면에 있는 동안은 그대로 둔다(누르자마자 줄이 사라지지 않게).
  const aiShared = settings.data?.aiObservations === true || settings.data?.institutionCapture === true;
  const [aiSharedSeen, setAiSharedSeen] = useState(false);
  useEffect(() => {
    if (aiShared) setAiSharedSeen(true);
  }, [aiShared]);
  const showAiItems = aiOn || aiShared || aiSharedSeen;
  const [code, setCode] = useState<InviteCode | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [issuing, setIssuing] = useState(false);
  // 렌더링 전에 연달아 눌러도 저장이 겹치지 않도록 ref로 한 번 더 막는다.
  const savingRef = useRef(false);

  async function toggle(key: ShareKey, value: boolean) {
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
          aiObservations: next.aiObservations === true,
          institutionCapture: next.institutionCapture === true,
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

  const switchRow = (it: ShareItem) => (
    <label key={it.key} className="switch-row">
      <span>
        <strong>{it.label}</strong>
        <br />
        <span className="muted">{it.hint}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={settings.data?.[it.key] === true}
        disabled={saving}
        onChange={(e) => void toggle(it.key, e.target.checked)}
      />
    </label>
  );

  return (
    <div>
      <h1>선생님과 나누기</h1>
      <p className="lead">
        기록은 기본적으로 부모님만 볼 수 있어요. 켜 둔 항목만 연결된 선생님이 주 단위 요약으로 볼 수 있어요.
      </p>
      <ErrorText error={error} />

      <Section title="공유할 항목" action={saving ? <span className="muted">저장 중…</span> : undefined}>
        {settings.loading && <Loading />}
        {settings.data && ITEMS.map(switchRow)}
      </Section>

      {showAiItems && settings.data && (
        <Section title="AI 관찰 기록 나누기" action={saving ? <span className="muted">저장 중…</span> : undefined}>
          <p className="muted" style={{ marginTop: 0 }}>
            AI 관찰 기록은 AI가 장면 사진을 보고 적은 짧은 글이에요. 사진은 살펴본 직후 지워서 누구에게도 보이지 않아요.
          </p>
          {policies != null && !aiOn && (
            <p className="notice">
              지금은 AI 서버가 쉬고 있어서 새 관찰 기록은 만들 수 없어요. 켜 둔 항목은 여기서 끌 수 있어요.
            </p>
          )}
          {AI_ITEMS.map(switchRow)}
          {aiConsent.data && !aiConsent.data.agreed && (
            <p className="notice" style={{ marginBottom: 0 }}>
              지금은 이 아이의 AI 관찰 기록이 꺼져 있어요. <Link to={`/p/children/${id}`}>아이 홈</Link>에서 켜야 선생님이
              기관에서 촬영할 수 있어요.
            </p>
          )}
        </Section>
      )}

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
