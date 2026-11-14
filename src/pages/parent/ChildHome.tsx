import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AiConsentCard from '../../ai/AiConsentCard';
import ObservationList from '../../ai/ObservationList';
import { ApiError, api, errorMessage } from '../../api/client';
import type { AiConsent, Child, Delivery, Goal, Observation, RecordItem, WeekSummary } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { BackLink, DangerAction, useToast } from '../../components/feedback';
import {
  CoachingCardView,
  ErrorText,
  Loading,
  WeeklyBars,
  WeeklyTable,
  formatAge,
  formatDate,
  useLoad,
} from '../../components/ui';
import { thisWeekStart } from './week';

const GOAL_STATUS: Record<string, string> = { IN_PROGRESS: '진행 중', ACHIEVED: '이뤘어요', ARCHIVED: '보관' };
/** 서버의 ChildService.MAX_CHILDREN_PER_PARENT와 같은 값. */
const MAX_CHILDREN = 5;
/** 서버의 기록 목록 최대 개수(RecordService.list). */
const RECORD_WINDOW = 100;
/** 주간 기록에 보여 줄 주 수. */
const WEEKS = 8;
/** 아이 홈에 보여 줄 AI 관찰 기록 개수(최신순). */
const AI_LIST_LIMIT = 5;

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

/** 펼침(details)의 제목 줄: 글은 왼쪽, 펼침 표시(›)는 오른쪽. */
function DisclosureSummary({ children }: { children: ReactNode }) {
  return (
    <summary>
      <span style={{ flex: 1, minWidth: 0 }}>{children}</span>
      <span className="chev" aria-hidden="true">
        ›
      </span>
    </summary>
  );
}

export default function ChildHome() {
  const { childId } = useParams();
  const id = Number(childId);
  const nav = useNavigate();
  const toast = useToast();
  const { policies } = useAuth();
  // AI 서버가 설정되지 않았으면(또는 아직 모르면) 새로 만드는 화면(켜기, 촬영 버튼)을 숨긴다. 나머지 기능은 그대로다.
  // 다만 이미 동의해 둔 아이라면, 그동안 쌓인 기록을 보고 지우거나 동의를 끄는 것은 AI 서버가 꺼져 있어도 할 수 있어야
  // 하므로(서버도 허용한다) 동의 상태는 늘 확인한다.
  const aiOn = policies?.aiObservationEnabled === true;
  const aiConsent = useLoad(() => api<AiConsent>('GET', `/children/${id}/ai-consent`), [id]);
  // 방금 켜거나 껐을 때의 결과 안내. 동의 카드는 켜짐·꺼짐에 따라 자리가 달라서(꺼짐: 위쪽, 켜짐: 아래쪽 설정 자리)
  // 누른 카드가 그 자리에서 사라진다. 사라진 자리에 결과를 알리고 포커스를 옮긴다.
  const [aiChange, setAiChange] = useState<'on' | 'off' | null>(null);
  const aiChangeRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => setAiChange(null), [id]);
  useEffect(() => {
    if (aiChange) aiChangeRef.current?.focus();
  }, [aiChange]);
  const child = useLoad(() => api<Child>('GET', `/children/${id}`), [id]);
  const weekly = useLoad(() => api<{ weeks: WeekSummary[] }>('GET', `/children/${id}/weekly-summary?weeks=${WEEKS}`), [id]);
  const cards = useLoad(() => api<Delivery[]>('GET', `/children/${id}/card-deliveries?limit=10`), [id]);
  const goals = useLoad(() => api<Goal[]>('GET', `/children/${id}/goals`), [id]);
  const notes = useLoad(() => api<Observation[]>('GET', `/children/${id}/observations?limit=5`), [id]);
  // 최근 기록들. 가장 나중에 저장된 기록에 카드 대신 상담·기관 안내가 나갔는지 확인하는 데 쓴다.
  const records = useLoad(
    () => api<SavedRecord[]>('GET', `/children/${id}/interaction-records?limit=${RECORD_WINDOW}`),
    [id],
  );
  // 아이가 둘 이상일 때만 '우리 아이'로 돌아가는 줄을 둔다(한 명이면 부모 홈이 바로 이 화면으로 보낸다).
  const siblings = useLoad(() => api<Child[]>('GET', '/children'), []);
  // state는 다시 그려진 뒤에야 바뀌므로, 빠르게 두 번 눌러도 한 번만 보내도록 ref로도 막는다.
  const triedBusy = useRef(false);
  const [triedError, setTriedError] = useState<unknown>(null);
  // '오늘 해봤어요'를 누르면 그 버튼이 '✓ 해봤어요' 표시로 바뀌어 포커스가 갈 곳을 잃는다. 그때 '이번 코칭' 제목으로 옮긴다.
  const coachHeadRef = useRef<HTMLHeadingElement>(null);
  const [triedSaved, setTriedSaved] = useState(0);
  useEffect(() => {
    if (!triedSaved) return;
    const active = document.activeElement;
    const head = coachHeadRef.current;
    if (!head || (active && active !== document.body)) return;
    // 화면은 그 자리에 두고 포커스만 옮긴다(제목이 화면 위로 지나가 있어도 끌어올리지 않는다).
    const { scrollX, scrollY } = window;
    head.focus();
    window.scrollTo(scrollX, scrollY);
  }, [triedSaved]);
  // 오류 화면의 '다시 불러오기'를 누르면 화면 전체가 불러오는 표시로 바뀌어 버튼(포커스)이 사라진다. 다 불러온 뒤 제목으로 돌려준다.
  // 제목은 결과(아이 화면, 찾을 수 없음, 불러오지 못함)에 따라 다르지만 한 번에 하나만 그려지므로 같은 ref를 쓴다.
  const h1Ref = useRef<HTMLHeadingElement>(null);
  const retrying = useRef(false);
  useEffect(() => {
    if (!child.loading && retrying.current) {
      retrying.current = false;
      h1Ref.current?.focus();
    }
  }, [child.loading]);

  // 뒤로 줄이 늦게 나타나 제목이 밀리지 않도록 아이 목록까지 불러온 뒤 그린다.
  if (child.loading || siblings.loading) return <Loading />;
  const childCount = siblings.data?.length ?? 0;
  const backLink = childCount > 1 ? <BackLink to="/p" label="우리 아이" /> : null;

  if (child.error || !child.data) {
    // 주소의 아이 번호가 숫자가 아니면(서버는 400) 다시 불러와도 소용없으니 '찾을 수 없어요'로 안내한다.
    const missing =
      !Number.isInteger(id) ||
      !child.error ||
      (child.error instanceof ApiError && [400, 403, 404].includes(child.error.status));
    return (
      <div>
        {backLink}
        {missing ? (
          <>
            <h1 ref={h1Ref} tabIndex={-1}>
              아이 정보를 찾을 수 없어요
            </h1>
            <p className="lead">우리 아이 목록에서 다시 골라 주세요.</p>
            <Link to="/p" className="btn block">
              우리 아이 목록으로
            </Link>
          </>
        ) : (
          <>
            <h1 ref={h1Ref} tabIndex={-1}>
              아이 정보를 불러오지 못했어요
            </h1>
            <ErrorText error={child.error} />
            <div className="stack">
              <button
                type="button"
                className="btn block"
                onClick={() => {
                  retrying.current = true;
                  child.reload();
                }}
              >
                다시 불러오기
              </button>
              <Link to="/p" className="btn block secondary">
                우리 아이 목록으로
              </Link>
            </div>
          </>
        )}
      </div>
    );
  }
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
  // 기록 버튼 아래 한 줄: 기록이 하나도 없으면 첫 기록 안내, 있으면 이번 주(한국 시간 월요일부터) 기록 수.
  // 목록이 비어 있으면 기록이 정말 없는 것이고, 주간 요약은 기록이 있는 주만 준다.
  // 주간 요약은 촬영 시각으로 주를 나누므로(앨범의 지난 영상은 그 주로 간다) 아래 주간 기록과 같게 '함께 논' 때로 말한다.
  // 둘 다 불러온 뒤에 정해서 문장이 한 번 바뀌어 보이지 않게 한다(자리는 미리 잡아 둔다).
  let recordLine: string | null = null;
  if (records.loading || weekly.loading) {
    recordLine = null;
  } else if (records.data && records.data.length === 0) {
    recordLine = '1~3분이면 충분해요. 첫 기록을 남겨 보세요.';
  } else if (weekly.data) {
    const n = weeks.find((w) => w.weekStart === thisWeekStart())?.recordCount ?? 0;
    recordLine =
      n > 0
        ? `이번 주에 함께 논 모습을 ${n}번 기록했어요. 한 주에 한두 번이면 충분해요.`
        : '이번 주에 함께 논 기록은 아직 없어요. 한 주에 한두 번이면 충분해요.';
  }
  // consented: 이 아이의 AI 동의가 켜져 있다(기록을 보고 지우고 끌 수 있다). aiAgreed: 지금 새 관찰 기록도 만들 수 있다.
  const consented = aiConsent.data?.agreed === true;
  const aiAgreed = aiOn && consented;
  const consentCard = aiConsent.data && (
    <AiConsentCard
      childId={id}
      nickname={c.nickname}
      consent={aiConsent.data}
      paused={policies != null && !aiOn}
      onChange={(next) => {
        aiConsent.setData(next);
        setAiChange(next.agreed ? 'on' : 'off');
      }}
    />
  );
  const aiChangeNotice = aiChange && (
    <p ref={aiChangeRef} className="notice" role="status" tabIndex={-1} style={{ marginBottom: 14 }}>
      {aiChange === 'on'
        ? `AI 관찰 기록을 켰어요. 이제 ${c.nickname}의 영상을 기록하거나 실시간 카메라로 관찰 기록을 남길 수 있어요. 끄는 곳은 이 화면 아래쪽에 있어요.`
        : `AI 관찰 기록을 껐어요. 그동안 쌓인 ${c.nickname}의 AI 관찰 기록도 모두 지웠어요. 이제 장면 사진을 한 장도 보내지 않아요.`}
    </p>
  );

  async function markTried(d: Delivery) {
    if (triedBusy.current) return;
    triedBusy.current = true;
    setTriedError(null);
    try {
      const updated = await api<Delivery>('POST', `/children/${id}/card-deliveries/${d.id}/tried`);
      cards.setData((list) => list?.map((x) => (x.id === d.id ? updated : x)) ?? null);
      toast(`'해봤어요'로 남겼어요. 잘하셨어요.`);
      setTriedSaved((n) => n + 1);
    } catch (e) {
      setTriedError(new Error(`'해봤어요'를 저장하지 못했어요. 잠시 후 다시 눌러 주세요. (${errorMessage(e)})`));
    } finally {
      triedBusy.current = false;
    }
  }

  async function removeChild() {
    // 실패하면 DangerAction이 확인 상자 안에 오류를 보여 준다.
    await api('DELETE', `/children/${id}`);
    toast(`${c.nickname} 정보를 모두 지웠어요.`);
    nav('/p', { replace: true });
  }

  return (
    <div>
      {backLink}
      <div className="child-head">
        <span className="avatar" aria-hidden="true">
          {c.nickname.slice(0, 1)}
        </span>
        <div className="child-head-text">
          <h1 ref={h1Ref} tabIndex={-1}>
            {c.nickname}
          </h1>
          <div className="child-age">{formatAge(c.ageMonths)}</div>
        </div>
        <Link to={`/p/children/${id}/share`} className="btn small secondary">
          선생님과 공유
        </Link>
      </div>

      <div style={{ marginBottom: 16 }}>
        <Link to={`/p/children/${id}/record`} className="btn block" style={{ minHeight: 56, fontSize: 17 }}>
          오늘 함께 논 영상 기록하기
        </Link>
        {/* 한 줄이 늦게 끼어들어 아래 내용이 밀리지 않게 자리를 늘 남겨 둔다. */}
        <p className="status-line" aria-hidden={recordLine ? undefined : true}>
          {recordLine ?? '\u00a0'}
        </p>
      </div>

      {aiAgreed && (
        <Link to={`/p/children/${id}/observe`} className="btn block secondary" style={{ marginBottom: 16 }}>
          실시간 카메라로 관찰 기록하기
        </Link>
      )}

      {/* 꺼져 있을 때는 위쪽에서 켜기를 안내하고(AI 서버가 설정된 경우만), 켜져 있을 때는 아래쪽(설정 자리)에 둔다. */}
      {aiOn && !consented && consentCard}
      {aiChange === 'on' && aiChangeNotice}
      {aiOn && !aiConsent.loading && aiConsent.error != null && (
        <section className="card">
          <h2>AI 관찰 기록</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            AI 관찰 기록 설정을 불러오지 못했어요. 다른 기록은 그대로 쓸 수 있어요.
          </p>
          <button type="button" className="btn small secondary" style={{ minHeight: 44 }} onClick={aiConsent.reload}>
            다시 불러오기
          </button>
        </section>
      )}

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
        <section aria-labelledby="childhome-coach-h">
          <h2 id="childhome-coach-h" ref={coachHeadRef} tabIndex={-1}>
            이번 코칭
          </h2>
          <CoachingCardView card={latest.card} delivery={latest} onTried={() => void markTried(latest)} />
          <ErrorText error={triedError} />
        </section>
      )}

      <section className="card" aria-labelledby="childhome-week-h">
        <div className="section-head">
          <h2 id="childhome-week-h">주간 기록</h2>
        </div>
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
          // 기록 목록까지 보고 정한다: 기록이 있는데 최근 몇 주에만 없으면 첫 기록 안내가 맞지 않는다.
          records.loading ? (
            <Loading />
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              {records.data && records.data.length > 0
                ? `최근 ${WEEKS}주에 함께 논 기록은 없어요. 다시 기록하면 주 단위로 변화를 모아 보여 드려요.`
                : '첫 기록을 남기면 주 단위로 변화를 모아 보여 드려요. 매일 볼 필요는 없어요. 한 주에 한두 번이면 충분해요.'}
            </p>
          )
        ) : (
          <>
            <p className="muted" style={{ margin: '0 0 4px' }}>
              주별 함께한 시간 비율
            </p>
            <WeeklyBars weeks={weeks} />
            <details className="disclosure">
              <DisclosureSummary>주별 숫자로 보기</DisclosureSummary>
              <WeeklyTable weeks={weeks} />
            </details>
          </>
        )}
      </section>

      {/* 동의가 켜져 있으면 AI 서버가 꺼져 있어도 그동안의 기록은 보고 지울 수 있다. */}
      {consented && (
        <ObservationList
          childId={id}
          limit={AI_LIST_LIMIT}
          canDelete={() => true}
          emptyText={
            aiOn ? '아직 AI 관찰 기록이 없어요. 영상을 기록하거나 실시간 카메라로 남겨 보세요.' : '아직 AI 관찰 기록이 없어요.'
          }
        />
      )}

      {/* 선생님이 남긴 목표와 메모: 사람이 건네는 이야기라 card warm */}
      {(activeGoals.length > 0 || (notes.data?.length ?? 0) > 0) && (
        <section className="card warm" aria-labelledby="childhome-story-h">
          <div className="section-head">
            <h2 id="childhome-story-h">선생님 이야기</h2>
          </div>
          {activeGoals.map((g) => (
            <div key={g.id} className="list-item" style={{ alignItems: 'flex-start' }}>
              <div className="item-body">
                <div className="row wrap" style={{ gap: 6 }}>
                  <strong>{g.title}</strong>
                  <span className={g.status === 'ACHIEVED' ? 'chip brand' : 'chip'}>{GOAL_STATUS[g.status]}</span>
                </div>
                {g.description && (
                  <div className="meta" style={{ marginTop: 2 }}>
                    {g.description}
                  </div>
                )}
                <div className="meta">{g.teacherName}</div>
              </div>
            </div>
          ))}
          {notes.data?.map((n) => (
            <div key={n.id} className="list-item" style={{ alignItems: 'flex-start' }}>
              <div className="item-body">
                <div>{n.content}</div>
                <div className="meta">
                  {n.observedOn.slice(5).replace('-', '/')} · {n.teacherName}
                </div>
              </div>
            </div>
          ))}
        </section>
      )}

      {pastCards.length > 0 && (
        <details className="card disclosure">
          <DisclosureSummary>지난 코칭 카드 {pastCards.length}장</DisclosureSummary>
          {pastCards.map((d) => (
            <div key={d.id} className="list-item">
              <div className="item-body">
                <strong>{d.card.title}</strong>
                <div className="meta">
                  {formatDate(d.deliveredAt)}
                  {d.triedAt && ' · 해봤어요'}
                </div>
              </div>
            </div>
          ))}
        </details>
      )}

      {/* 아이 목록을 못 불러와도 '+ 아이 추가'는 보여 준다. 5명 제한은 서버가 지킨다. */}
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
          <p className="muted" style={{ margin: 0 }}>
            아이는 {MAX_CHILDREN}명까지 등록할 수 있어요.
          </p>
        )}
      </div>

      {consented && consentCard}
      {aiChange === 'off' && aiChangeNotice}

      {/* 다른 아이 화면으로 바로 옮겨 가면 펼침과 확인 상자를 닫은 채로 시작한다. */}
      <details key={id} className="card disclosure">
        <DisclosureSummary>아이 정보 삭제(동의 철회)</DisclosureSummary>
        <DangerAction
          label="삭제"
          question="정말 삭제할까요?"
          detail={`${c.nickname}의 모든 기록(AI 관찰 기록 포함), 코칭 카드, 공유 설정, 선생님 연결과 선생님이 남긴 목표·메모가 즉시 지워지고 되돌릴 수 없어요.`}
          confirmLabel="삭제하기"
          busyLabel="삭제하는 중…"
          onConfirm={removeChild}
        />
      </details>
    </div>
  );
}
