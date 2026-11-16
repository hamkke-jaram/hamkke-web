import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, api, errorMessage } from '../../api/client';
import type { AiConsent, Child, InviteCode, LinkedTeacher, ShareSettings } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { BackLink, DangerAction, useToast } from '../../components/feedback';
import { ErrorText, Loading, Section, formatDate, loadStateView, useLoad } from '../../components/ui';
import '../extra.css';

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

/** 선생님이 볼 수 있는 항목. '기관에서 촬영'은 가정 기록을 보여 주는 게 아니라 허락이라 세지 않는다. */
const VISIBLE_KEYS: ShareKey[] = ['jointPlay', 'responseLatency', 'distress', 'coachingCards', 'aiObservations'];

const UNLINK_DETAIL =
  '선생님은 더 이상 이 아이의 기록을 볼 수 없어요. 이미 남긴 목표와 메모는 남아요. 다시 연결하려면 새 초대 코드가 필요해요.';

/** 'ABCD2345' → 'ABCD-2345' (보기 쉽게. 서버는 '-'를 빼고 받는다). */
function formatCode(code: string) {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** 초대 코드를 만든 때와 기한: '11월 16일 오후 3:00' */
function formatExpiry(iso: string) {
  return new Date(iso).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function Share() {
  const { childId } = useParams();
  const id = Number(childId);
  const home = `/p/children/${id}`;
  const toast = useToast();
  // 뒤로 줄에 아이 별칭을 쓰려고만 불러온다. 못 불러오면 '아이 홈'으로 둔다.
  const child = useLoad(() => api<Child>('GET', `/children/${id}`), [id]);
  const nickname = child.data?.id === id ? child.data.nickname : undefined;
  const settings = useLoad(() => api<ShareSettings>('GET', `/children/${id}/share-settings`), [id]);
  const teachers = useLoad(() => api<LinkedTeacher[]>('GET', `/children/${id}/teachers`), [id]);
  // 아직 쓰지 않았고 기한이 남은 초대 코드(최신순). 다시 보고 복사하거나 취소할 수 있다.
  const codes = useLoad(() => api<InviteCode[]>('GET', `/children/${id}/invite-codes`), [id]);
  const codesTitleRef = useRef<HTMLHeadingElement>(null);
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
  // 저장하지 못한 항목의 오류는 그 항목이 있는 칸에 보여 준다.
  const [saveError, setSaveError] = useState<{ key: ShareKey; error: unknown } | null>(null);
  const [issueError, setIssueError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [issuing, setIssuing] = useState(false);
  // 렌더링 전에 연달아 눌러도 저장이 겹치지 않도록 ref로 한 번 더 막는다.
  const savingRef = useRef(false);
  const copyRef = useRef<HTMLButtonElement>(null);
  const focusCopy = useRef(false);
  const teachersTitleRef = useRef<HTMLHeadingElement>(null);

  // 코드를 만들면 새로 나타난 [코드 복사]로 초점을 옮긴다(코드와 기한이 함께 읽힌다).
  useEffect(() => {
    if (!code || !focusCopy.current) return;
    focusCopy.current = false;
    copyRef.current?.focus();
  }, [code]);

  async function toggle(key: ShareKey, value: boolean) {
    if (!settings.data || savingRef.current) return;
    const confirmed = settings.data; // 마지막으로 서버가 확인해 준 상태
    const next = { ...confirmed, [key]: value };
    savingRef.current = true;
    settings.setData(next);
    setSaving(true);
    setSaveError(null);
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
      toast('공유 설정을 저장했어요.');
    } catch (e) {
      settings.setData(confirmed);
      setSaveError({
        key,
        error: new Error(`공유 설정을 저장하지 못해서 이전 설정으로 되돌려 두었어요. (${errorMessage(e)})`),
      });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function issue() {
    if (issuing) return;
    setIssuing(true);
    setIssueError(null);
    try {
      const next = await api<InviteCode>('POST', `/children/${id}/invite-codes`);
      focusCopy.current = true;
      setCode(next);
      codes.reload();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'INVITE_LIMIT_REACHED') {
        setIssueError(
          new Error(`${e.message} 아래 '쓸 수 있는 초대 코드'에서 쓰지 않을 코드를 취소하면 새로 만들 수 있어요.`),
        );
        codes.reload();
      } else {
        setIssueError(e);
      }
    } finally {
      setIssuing(false);
    }
  }

  async function copyCode(c: InviteCode) {
    try {
      if (typeof navigator.clipboard?.writeText !== 'function') throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(formatCode(c.code));
      toast('코드를 복사했어요. 선생님께 전해 주세요.');
    } catch {
      toast('복사하지 못했어요. 코드를 보고 직접 전해 주세요.');
    }
  }

  /** 초대 코드 취소. 실패하면 오류를 던져 확인 상자 안에 보이게 한다. */
  async function revoke(c: InviteCode) {
    await api('DELETE', `/children/${id}/invite-codes/${encodeURIComponent(c.code)}`);
    // 줄이 사라지기 전에 초점을 목록 제목으로 옮겨 둔다.
    codesTitleRef.current?.focus();
    codes.setData((list) => list?.filter((x) => x.code !== c.code) ?? null);
    if (code?.code === c.code) setCode(null);
    toast('초대 코드를 취소했어요. 이제 이 코드로는 연결할 수 없어요.');
  }

  /** 실패하면 오류를 던져 확인 상자 안에 보이게 한다. */
  async function unlink(t: LinkedTeacher) {
    await api('DELETE', `/children/${id}/teachers/${t.teacherId}`);
    // 줄이 사라지기 전에 초점을 목록 제목으로 옮겨 둔다.
    teachersTitleRef.current?.focus();
    teachers.setData((list) => list?.filter((x) => x.teacherId !== t.teacherId) ?? null);
    toast('연결을 해제했어요.');
    teachers.reload();
  }

  const switchRow = (it: ShareItem) => {
    const base = `share-${it.key}`;
    return (
      <label key={it.key} className="switch-row">
        <span className="switch-text">
          <strong id={`${base}-label`}>{it.label}</strong>
          <span className="muted" id={`${base}-hint`}>
            {it.hint}
          </span>
        </span>
        <input
          type="checkbox"
          role="switch"
          data-demo={`share-switch-${it.key}`}
          aria-labelledby={`${base}-label`}
          aria-describedby={`${base}-hint`}
          checked={settings.data?.[it.key] === true}
          // disabled로 두면 저장하는 동안 초점이 body로 빠진다. 겹친 저장은 toggle()의 savingRef가 막는다.
          aria-disabled={saving || undefined}
          onChange={(e) => void toggle(it.key, e.target.checked)}
        />
      </label>
    );
  };

  const saveErrorIn = (items: ShareItem[]) =>
    saveError && items.some((it) => it.key === saveError.key) ? <ErrorText error={saveError.error} /> : null;

  const sharedCount = settings.data ? VISIBLE_KEYS.filter((k) => settings.data?.[k] === true).length : 0;
  const savingNote = saving ? <span className="muted">저장 중…</span> : undefined;

  return (
    <div>
      <BackLink to={home} label={nickname ?? '아이 홈'} />
      <h1>선생님과 나누기</h1>
      <p className="lead">
        기록은 기본적으로 부모님만 볼 수 있어요. 켜 둔 항목만 연결된 선생님이 주 단위 요약으로 볼 수 있어요.
      </p>
      {/* 두 카드(공유할 항목·AI 관찰 기록)를 함께 센 화면 전체 요약이라 카드보다 위에 둔다. */}
      {settings.data && (
        <p className="status-line" style={{ margin: '0 0 16px' }} data-demo="share-status">
          {sharedCount
            ? `선생님이 볼 수 있는 항목 ${sharedCount}개`
            : settings.data.institutionCapture
              ? '가정 기록은 공유하지 않아요. 기관 촬영만 허락했어요.'
              : '지금은 아무것도 공유하지 않아요'}
        </p>
      )}

      <Section title="공유할 항목" action={savingNote}>
        {settings.loading && !settings.data && <Loading />}
        {!settings.loading && !settings.data && settings.error != null && (
          <>
            <ErrorText error={settings.error} />
            <button type="button" className="btn small secondary" onClick={settings.reload}>
              다시 불러오기
            </button>
          </>
        )}
        {settings.data && (
          <>
            {ITEMS.map(switchRow)}
            {saveErrorIn(ITEMS)}
          </>
        )}
      </Section>

      {showAiItems && settings.data && (
        <Section title="AI 관찰 기록 나누기" action={savingNote}>
          <p className="muted" style={{ marginTop: 0 }}>
            AI 관찰 기록은 AI가 장면 사진을 보고 적은 짧은 글이에요. 사진은 살펴본 직후 지워서 누구에게도 보이지 않아요.
          </p>
          {policies != null && !aiOn && (
            <p className="notice">
              지금은 AI 서버가 쉬고 있어서 새 관찰 기록은 만들 수 없어요. 켜 둔 항목은 여기서 끌 수 있어요.
            </p>
          )}
          {AI_ITEMS.map(switchRow)}
          {saveErrorIn(AI_ITEMS)}
          {aiConsent.data && !aiConsent.data.agreed && (
            <p className="notice" style={{ marginBottom: 0 }}>
              지금은 이 아이의 AI 관찰 기록이 꺼져 있어요. <Link to={home}>아이 홈</Link>에서 켜야 선생님이 기관에서
              촬영할 수 있어요.
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
            <div className="code-box" role="group" aria-label="초대 코드">
              <span id="share-invite-code">{formatCode(code.code)}</span>
            </div>
            <p className="muted" id="share-invite-exp">
              {formatExpiry(code.expiresAt)}까지 쓸 수 있어요.
            </p>
            <p className="muted">
              아직 쓰지 않은 코드는 아래 '쓸 수 있는 초대 코드'에서 다시 보거나 취소할 수 있어요. 새 코드를 만들어도 앞서
              만든 코드는 기한까지 쓸 수 있고, 아직 쓰지 않은 코드는 3개까지 둘 수 있어요.
            </p>
            <div className="stack" style={{ marginBottom: 12 }}>
              <button
                ref={copyRef}
                type="button"
                className="btn secondary block"
                data-demo="share-code-copy"
                aria-describedby="share-invite-code share-invite-exp"
                onClick={() => void copyCode(code)}
              >
                코드 복사
              </button>
              {typeof navigator.share === 'function' && (
                <button
                  type="button"
                  className="btn secondary block"
                  data-demo="share-code-send"
                  onClick={() =>
                    void navigator
                      .share({ text: `함께자람 초대 코드: ${code.code} (72시간 동안 한 번 사용 가능)` })
                      .catch(() => undefined)
                  }
                >
                  코드 보내기
                </button>
              )}
            </div>
          </>
        )}
        <ErrorText error={issueError} />
        <button
          type="button"
          className={code ? 'btn block ghost' : 'btn block'}
          data-demo="share-issue-code"
          // 초점을 잃지 않게 disabled 대신 aria-disabled. 겹친 요청은 issue()가 막는다.
          aria-disabled={issuing || undefined}
          onClick={() => void issue()}
        >
          {issuing ? '만드는 중…' : code ? '새 초대 코드 만들기' : '초대 코드 만들기'}
        </button>
      </Section>

      <section className="card" aria-labelledby="share-codes-title">
        <div className="section-head">
          <h2 id="share-codes-title" ref={codesTitleRef} tabIndex={-1}>
            쓸 수 있는 초대 코드
          </h2>
        </div>
        {loadStateView(codes, '초대 코드를') ??
          (codes.data && codes.data.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              지금 쓸 수 있는 초대 코드가 없어요.
            </p>
          ) : (
            codes.data?.map((c) => {
              const codeId = `share-code-${c.code}`;
              return (
                <div key={c.code} className="list-item" style={{ flexWrap: 'wrap' }}>
                  <span className="item-body">
                    <strong id={codeId} className="invite-code">
                      {formatCode(c.code)}
                    </strong>
                    {/* SHR-04: 언제 만든 코드인지 보여야 어느 선생님께 건넨 것인지 가려 취소할 수 있다. */}
                    <span className="meta">
                      {c.createdAt ? `${formatExpiry(c.createdAt)} 만듦 · ` : ''}
                      {formatExpiry(c.expiresAt)}까지
                    </span>
                  </span>
                  <button
                    type="button"
                    className="btn small secondary"
                    data-demo="share-code-list-copy"
                    aria-describedby={codeId}
                    onClick={() => void copyCode(c)}
                  >
                    복사
                  </button>
                  <DangerAction
                    label="취소"
                    triggerClassName="btn small danger"
                    question="이 초대 코드를 취소할까요?"
                    detail="취소하면 이 코드로는 연결할 수 없어요. 이미 연결된 선생님은 그대로예요."
                    confirmLabel="코드 취소하기"
                    busyLabel="취소하는 중…"
                    describedBy={codeId}
                    labelledBy={codeId}
                    demo="share-code-revoke"
                    onConfirm={() => revoke(c)}
                  />
                </div>
              );
            })
          ))}
      </section>

      <section className="card" aria-labelledby="share-teachers-title">
        <div className="section-head">
          <h2 id="share-teachers-title" ref={teachersTitleRef} tabIndex={-1}>
            연결된 선생님
          </h2>
        </div>
        {teachers.loading && !teachers.data && <Loading />}
        {/* 목록이 이미 있으면(예: 연결 해제 뒤 다시 불러오기만 실패) 맞게 고친 목록을 그대로 두고 오류는 띄우지 않는다. */}
        {!teachers.loading && !teachers.data && teachers.error != null && (
          <>
            <ErrorText error={teachers.error} />
            <button type="button" className="btn small secondary" onClick={teachers.reload}>
              다시 불러오기
            </button>
          </>
        )}
        {teachers.data?.length === 0 && (
          <p className="muted" style={{ margin: 0 }}>
            아직 연결된 선생님이 없어요.
          </p>
        )}
        {teachers.data?.map((t) => {
          const nameId = `share-teacher-${t.teacherId}-name`;
          return (
            // 확인 상자가 열리면 줄을 넘겨 이 선생님 줄 아래에 넓게 놓이게 한다.
            <div key={t.teacherId} className="list-item" style={{ flexWrap: 'wrap' }}>
              <span className="avatar" aria-hidden="true">
                {t.displayName.slice(0, 1)}
              </span>
              <span className="item-body">
                <strong id={nameId}>{t.displayName}</strong>
                <span className="meta">{formatDate(t.linkedAt)} 연결</span>
              </span>
              <DangerAction
                label="연결 해제"
                triggerClassName="btn small danger"
                question="연결을 해제할까요?"
                detail={UNLINK_DETAIL}
                confirmLabel="연결 해제하기"
                busyLabel="해제하는 중…"
                describedBy={nameId}
                labelledBy={nameId}
                demo="share-teacher-unlink"
                onConfirm={() => unlink(t)}
              />
            </div>
          );
        })}
      </section>
    </div>
  );
}
