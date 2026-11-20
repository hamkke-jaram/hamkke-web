import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AiConsentCard from '../../ai/AiConsentCard';
import ObservationList from '../../ai/ObservationList';
import { aiConsentState, consentCardPlace, keepsAiRecords } from '../../ai/consentState';
import { ApiError, api } from '../../api/client';
import type { AiConsent, Child, Delivery, Goal, Observation, RecordItem, WeekSummary } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import TriableCard from '../../components/TriableCard';
import { BackLink, DangerAction, useToast } from '../../components/feedback';
import { usePagedList } from '../../components/paging';
import {
  ErrorText,
  Loading,
  MoreButton,
  WeeklyChart,
  WeeklyTable,
  formatAge,
  formatDate,
  loadStateView,
  useLoad,
} from '../../components/ui';
import HomeCoaching from './HomeCoaching';
import HomeFab from './HomeFab';
import WeekCard from './WeekCard';
import { CameraIcon, ChevronIcon } from './icons';
import { thisWeekStats } from './week';
import '../extra.css';
import './parent.css';
import TalkEntry from '../../talk/TalkEntry';

const GOAL_STATUS: Record<string, string> = { IN_PROGRESS: '진행 중', ACHIEVED: '이뤘어요', ARCHIVED: '보관' };
/** 서버의 ChildService.MAX_CHILDREN_PER_PARENT와 같은 값. */
const MAX_CHILDREN = 5;
/** 서버의 기록 목록 최대 개수(RecordService.list). */
const RECORD_WINDOW = 100;
/** 주간 기록에 보여 줄 주 수. */
const WEEKS = 8;
/** 아이 홈에 보여 줄 AI 관찰 기록 개수(최신순). 더 있으면 '더 보기'로 이어서 가져온다. */
const AI_LIST_LIMIT = 5;
/** 코칭 카드 이력을 한 번에 가져오는 개수(오늘의 코칭 1장 + 지난 카드). */
const CARD_PAGE = 10;
/** 선생님 관찰 메모를 한 번에 가져오는 개수. */
const NOTE_PAGE = 5;
/** '오늘의 코칭'에서 옆으로 넘겨 볼 카드 수(가장 최근 카드 + 바로 앞의 카드들). 그보다 오래된 카드는 '지난 코칭 카드'에 있다. */
const RAIL_CARDS = 3;

/** 서버 RecordResponse에는 저장 시각(createdAt)도 있다. 저장 순서를 알아내는 데만 쓴다. */
type SavedRecord = RecordItem & { createdAt: string };

/**
 * 서버에 가장 나중에 저장된 기록을 고른다. 목록은 촬영 시각(recordedAt) 순이라
 * 갤러리에서 예전 영상을 골라 기록하면 방금 저장한 기록이 맨 앞에 오지 않으므로, 저장 시각과 id로 다시 고른다.
 * 한계: 서버가 촬영 시각 기준 최근 RECORD_WINDOW개만 주므로, 그보다 오래된 촬영일의 영상으로
 * 새로 기록하면 그 기록은 여기서 보이지 않는다(이때는 카드 쪽 비교로 '오늘의 코칭'이 유지된다).
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
  // 방금 켜거나 껐을 때의 결과 안내. 동의 카드는 상태에 따라 자리가 달라서(동의 문서가 바뀌어 꺼짐: 위쪽,
  // 처음 꺼짐: 주간 기록 아래, 켜짐: 아래쪽 설정 자리) 누른 카드가 그 자리에서 사라지거나 다른 카드로 바뀐다.
  // 누른 자리(at)에 결과를 알리고 포커스를 옮긴다.
  const [aiChange, setAiChange] = useState<{ kind: 'on' | 'off'; at: 'top' | 'middle' | 'bottom' } | null>(null);
  const aiChangeRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => setAiChange(null), [id]);
  useEffect(() => {
    if (aiChange) aiChangeRef.current?.focus();
  }, [aiChange]);
  const child = useLoad(() => api<Child>('GET', `/children/${id}`), [id]);
  const weekly = useLoad(() => api<{ weeks: WeekSummary[] }>('GET', `/children/${id}/weekly-summary?weeks=${WEEKS}`), [id]);
  const cards = usePagedList<Delivery>(`/children/${id}/card-deliveries`, CARD_PAGE, [id]);
  const goals = useLoad(() => api<Goal[]>('GET', `/children/${id}/goals`), [id]);
  const notes = usePagedList<Observation>(`/children/${id}/observations`, NOTE_PAGE, [id]);
  // 최근 기록들. 가장 나중에 저장된 기록에 카드 대신 상담·기관 안내가 나갔는지 확인하는 데 쓴다.
  const records = useLoad(
    () => api<SavedRecord[]>('GET', `/children/${id}/interaction-records?limit=${RECORD_WINDOW}`),
    [id],
  );
  // 아이가 둘 이상일 때만 '우리 아이'로 돌아가는 줄을 둔다(한 명이면 부모 홈이 바로 이 화면으로 보낸다).
  const siblings = useLoad(() => api<Child[]>('GET', '/children'), []);
  // 오류 화면의 '다시 불러오기'를 누르면 화면 전체가 불러오는 표시로 바뀌어 버튼(포커스)이 사라진다. 다 불러온 뒤 제목으로 돌려준다.
  // 제목은 결과(아이 화면, 찾을 수 없음, 불러오지 못함)에 따라 다르지만 한 번에 하나만 그려지므로 같은 ref를 쓴다.
  const h1Ref = useRef<HTMLHeadingElement>(null);
  const retrying = useRef(false);
  const pastRef = useRef<HTMLDetailsElement>(null);
  const storyRef = useRef<HTMLHeadingElement>(null);
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
  // 가장 나중에 저장된 기록에 카드 대신 안내가 나갔다면(NEEDS_ATTENTION) '오늘의 코칭' 자리에 안내를 보여 주고,
  // 예전 카드는 모두 지난 카드 목록으로 보낸다. 카드는 기록 저장 직후에 전달되므로, 그 안내 기록보다
  // 나중에 전달된 카드가 있으면(=그 뒤에 저장된 기록의 카드) 카드를 보여 준다.
  const newest = newestSaved(records.data);
  const newestCard = cards.items?.[0];
  const showGuidance =
    newest?.changeTrend === 'NEEDS_ATTENTION' && (!newestCard || Date.parse(newest.createdAt) >= Date.parse(newestCard.deliveredAt));
  const latest = records.loading || showGuidance ? undefined : newestCard;
  const pastCards = cards.items ? (showGuidance ? cards.items : cards.items.slice(1)) : [];
  const replaceCard = (d: Delivery) => cards.setItems((list) => list?.map((x) => (x.id === d.id ? d : x)) ?? null);
  const dropCard = (d: Delivery) => cards.setItems((list) => list?.filter((x) => x.id !== d.id) ?? null);
  const activeGoals = (goals.data ?? []).filter((g) => g.status !== 'ARCHIVED');
  // 선생님이 남긴 것이 하나도 없다(둘 다 불러온 뒤에만 말한다. 불러오는 중이나 실패와 헷갈리지 않게).
  const noStories =
    !goals.loading &&
    !notes.loading &&
    goals.error == null &&
    notes.error == null &&
    activeGoals.length === 0 &&
    (notes.items?.length ?? 0) === 0;
  // 주간 기록의 이번 주 모습: 이번 주(한국 시간 월요일부터)에 찍은 영상의 기록을 요일별로 모은다.
  // 주간 요약처럼 촬영 시각으로 주를 나눈다(앨범의 지난 영상은 그 주로 간다).
  const week = thisWeekStats(records.data);
  const hasRecords = (records.data?.length ?? 0) > 0;
  // '오늘의 코칭'에서 넘겨 볼 카드: 가장 최근 카드와 그 앞의 카드 몇 장.
  const railCards = latest ? [latest, ...pastCards.slice(0, RAIL_CARDS - 1)] : [];

  /** 떠 있는 메뉴의 '선생님 이야기': 아래의 선생님 이야기(받은 목표와 메모)로 간다. */
  function goStory() {
    const el = storyRef.current;
    if (!el) return;
    el.scrollIntoView({ block: 'start' });
    el.focus({ preventScroll: true });
  }

  // 동의 상태(consentState.ts): 켜짐 / 동의 문서가 바뀌어 꺼짐 / 처음 꺼짐.
  // aiAgreed: 지금 새 관찰 기록을 만들 수 있다(켜짐 + AI 서버 설정됨).
  // hasAiRecords: 그동안 쌓인 기록이 남아 있을 수 있다(켜짐, 또는 동의 문서가 바뀌어 꺼짐). 이때는 AI 서버가 꺼져 있어도,
  // 다시 동의하기 전이어도 기록을 보고 지우고 끌 수 있어야 한다(서버도 허용한다).
  const consentState = aiConsentState(aiConsent.data);
  const aiAgreed = aiOn && consentState === 'on';
  const hasAiRecords = keepsAiRecords(consentState);
  const cardPlace = aiConsent.data ? consentCardPlace(consentState, aiOn) : 'none';
  const consentCard = aiConsent.data && (
    <AiConsentCard
      childId={id}
      nickname={c.nickname}
      consent={aiConsent.data}
      paused={policies != null && !aiOn}
      onChange={(next) => {
        aiConsent.setData(next);
        // 켜면 카드가 아래쪽 설정 자리로 내려가고, 끄면 다른 모습으로 바뀌거나 사라진다. 누른 카드가 있던 자리에 알린다.
        setAiChange({ kind: next.agreed ? 'on' : 'off', at: cardPlace === 'none' ? 'bottom' : cardPlace });
        // 끄면 서버가 AI 관찰 기록으로 받은 코칭 카드도 함께 지우므로 카드 목록을 다시 불러온다.
        if (!next.agreed) cards.reload();
      }}
    />
  );
  const aiChangeNotice = aiChange && (
    <p ref={aiChangeRef} className="notice" role="status" tabIndex={-1} style={{ marginBottom: 14 }}>
      {aiChange.kind === 'on'
        ? `AI 관찰 기록을 켰어요. 이제 ${c.nickname}의 영상을 기록하거나 실시간 카메라로 관찰 기록을 남길 수 있어요. 끄는 곳은 이 화면 아래쪽에 있어요.`
        : `AI 관찰 기록을 껐어요. 그동안 쌓인 ${c.nickname}의 AI 관찰 기록도 모두 지웠어요. 이제 장면 사진을 한 장도 보내지 않아요.`}
    </p>
  );

  async function removeChild() {
    // 실패하면 DangerAction이 확인 상자 안에 오류를 보여 준다.
    await api('DELETE', `/children/${id}`);
    toast(`${c.nickname} 정보를 모두 지웠어요.`);
    nav('/p', { replace: true });
  }

  return (
    <div className="child-home">
      {backLink}
      {/* 화면 머리: 왼쪽 정렬 큰 제목 + 한 줄 부제(시안 홈). 아이 사진·생김새를 대신하는 그림은 두지 않는다. */}
      <div className="home-head">
        <h1 ref={h1Ref} tabIndex={-1}>
          {c.nickname}의 하루
        </h1>
        <p className="home-sub">오늘도 함께, 조금씩 자라요</p>
        <p className="home-meta">
          {formatAge(c.ageMonths)} ·{' '}
          <Link to={`/p/children/${id}/edit`} className="link-btn" data-demo="childhome-edit-link" aria-label={`${c.nickname} 정보 고치기`}>
            정보 고치기
          </Link>
        </p>
      </div>

      <Link to={`/p/children/${id}/record`} className="btn block home-record" data-demo="childhome-record-link">
        <CameraIcon />
        영상 기록하기
      </Link>

      {aiAgreed && (
        <Link
          to={`/p/children/${id}/observe`}
          className="btn block secondary"
          style={{ marginBottom: 16 }}
          data-demo="childhome-observe-link"
        >
          실시간 카메라로 관찰 기록하기
        </Link>
      )}

      {/* 동의 문서가 바뀌어 꺼졌을 때만 여기(위쪽)에 둔다: 왜 꺼졌는지 먼저 보여야 한다(AI 서버가 꺼져 있어도). */}
      {aiChange?.at === 'top' && aiChangeNotice}
      {cardPlace === 'top' && consentCard}

      {/* 카드 대신 안내가 나간 경우: '오늘의 코칭' 자리에 그대로 둔다. 캐릭터는 두지 않는다. */}
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
        // 시안 홈: 제목 + 오른쪽 '지난 코칭', 크림 카드를 옆으로 넘겨 본다. 카드를 펼치면 본문 전체와 출처가 나온다.
        <section className="home-sec" aria-labelledby="childhome-coach-h">
          <div className="home-sec-head">
            <h2 id="childhome-coach-h" tabIndex={-1}>
              오늘의 코칭
            </h2>
            {/* Figma: '전체 보기 >' — 받은 카드를 달별로 모아 보는 화면 */}
            <Link to={`/p/children/${id}/coaching`} className="home-sec-link" data-demo="childhome-past-link">
              전체 보기
              <ChevronIcon size={16} />
            </Link>
          </div>
          <HomeCoaching childId={id} deliveries={railCards} onUpdated={replaceCard} onGone={dropCard} />
        </section>
      )}
      {/* 카드를 못 불러오면 '오늘의 코칭'이 조용히 사라지지 않게 알린다. */}
      {!showGuidance && cards.error != null && !cards.items && (
        <section className="card" aria-labelledby="childhome-coach-err-h">
          <h2 id="childhome-coach-err-h">코칭 카드</h2>
          {loadStateView(cards, '코칭 카드를')}
        </section>
      )}

      {/* 주간 기록(시안 홈): 제목은 카드 밖, 카드에는 이번 주 기간·합·요일 막대. 여러 주의 변화는 펼쳐서 본다. */}
      <section className="home-sec" aria-labelledby="childhome-week-h">
        <div className="home-sec-head">
          <h2 id="childhome-week-h">주간 기록</h2>
        </div>
        <div className="card">
          {loadStateView(records, '주간 기록을') ??
            (!hasRecords ? (
              <p className="muted" style={{ margin: 0 }}>
                첫 기록을 남기면 주 단위로 변화를 모아 보여 드려요. 매일 볼 필요는 없어요. 한 주에 한두 번이면 충분해요.
              </p>
            ) : (
              <>
                <WeekCard week={week} />
                <p className="muted wk-note">
                  {week.count > 0
                    ? '이번 주에 찍은 영상에서 모은 기록이에요. 한 주에 한두 번이면 충분해요.'
                    : '이번 주에 함께 논 기록은 아직 없어요. 한 주에 한두 번이면 충분해요.'}
                </p>
                <details className="disclosure">
                  <DisclosureSummary>주별 변화 보기</DisclosureSummary>
                  {weekly.loading ? (
                    <Loading />
                  ) : weekly.error ? (
                    <div>
                      <p className="error" role="alert">
                        주별 변화를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
                      </p>
                      <button type="button" className="btn small secondary" onClick={weekly.reload}>
                        다시 불러오기
                      </button>
                    </div>
                  ) : weeks.length === 0 ? (
                    <p className="muted" style={{ margin: 0 }}>
                      최근 {WEEKS}주에 함께 논 기록은 없어요. 다시 기록하면 주 단위로 변화를 모아 보여 드려요.
                    </p>
                  ) : (
                    <>
                      <WeeklyChart weeks={weeks} idPrefix="childhome-week" />
                      <details className="disclosure">
                        <DisclosureSummary>주별 숫자로 보기</DisclosureSummary>
                        <WeeklyTable weeks={weeks} />
                      </details>
                    </>
                  )}
                </details>
                <Link to={`/p/children/${id}/records`} className="btn small ghost" data-demo="childhome-records-link">
                  기록 하나씩 보기·지우기
                </Link>
              </>
            ))}
        </div>
      </section>

      {/* Figma 홈: 주간 기록 아래 '전문가의 도움이 필요하다면' 크림 띠. 상담·기관 안내로 간다. */}
      <Link to="/support" className="expert-banner">
        <span className="expert-title">전문가의 도움이 필요하다면</span>
        <span className="expert-sub">아이에게 맞는 상담과 가까운 기관을 알아보세요.</span>
        <span className="expert-go">
          상담 · 기관 안내
          <ChevronIcon size={16} />
        </span>
      </Link>

      {/* Figma '홈_하단 버튼': 오른쪽 아래에 떠 있는 노란 버튼 → 아이 추가하기 · 다른 아이 · 선생님 이야기 */}
      <HomeFab
        others={(siblings.data ?? []).filter((k) => k.id !== id)}
        canAdd={childCount < MAX_CHILDREN}
        onStory={goStory}
      />

      {/* 처음부터 꺼져 있을 때의 켜기 안내는 여기(주간 기록 아래)에 둔다. AI 서버가 설정된 경우만. */}
      {aiChange?.at === 'middle' && aiChangeNotice}
      {cardPlace === 'middle' && consentCard}
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

      {/* 동의를 거두지 않았으면 AI 서버가 꺼져 있어도, 동의 문서가 바뀌어 다시 동의하기 전이어도 그동안의 기록은 보고 지울 수 있다. */}
      {hasAiRecords && (
        <ObservationList
          childId={id}
          limit={AI_LIST_LIMIT}
          canDelete={() => true}
          // 지운 기록으로 받은 코칭 카드도 서버에서 함께 지워진다.
          onDeleted={() => cards.reload()}
          emptyText={
            aiAgreed ? '아직 AI 관찰 기록이 없어요. 영상을 기록하거나 실시간 카메라로 남겨 보세요.' : '아직 AI 관찰 기록이 없어요.'
          }
        />
      )}

      {/* 선생님 이야기: 선생님이 남긴 목표와 메모, 공유 화면으로 가는 길. 위의 둥근 버튼이 여기로 데려온다.
          남긴 것이 없어도 늘 보여서 선생님과 잇는 길이 여기에 있다. 못 불러왔으면 비어 있는 것과 구별되게 알린다. */}
      <section className="card" aria-labelledby="childhome-story-h">
        <div className="section-head">
          <h2 id="childhome-story-h" ref={storyRef} tabIndex={-1}>
            선생님 이야기
          </h2>
        </div>
        {goals.error != null && loadStateView(goals, '선생님 목표를')}
        {notes.error != null && loadStateView(notes, '관찰 메모를')}
        {noStories && (
          <p className="muted" style={{ margin: '0 0 4px' }}>
            아직 선생님이 남긴 이야기가 없어요. 선생님과 연결하면 목표와 메모가 여기에 보여요.
          </p>
        )}
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
        {notes.items?.map((n) => (
          <div key={n.id} className="list-item" style={{ alignItems: 'flex-start' }}>
            <div className="item-body">
              <div style={{ whiteSpace: 'pre-wrap' }}>{n.content}</div>
              <div className="meta">
                {n.observedOn.slice(5).replace('-', '/')} · {n.teacherName}
              </div>
            </div>
          </div>
        ))}
        <MoreButton list={notes} demo="childhome-notes-more" label="관찰 메모 더 보기" />
        {/* 선생님과 주고받는 이야기(메모에 답하기·집 소식). 안 읽은 이야기 수를 배지로 보여 준다. */}
        <TalkEntry childId={id} role="PARENT" />
        <Link to={`/p/children/${id}/share`} className="btn small ghost" data-demo="childhome-share-link">
          선생님과 공유
        </Link>
      </section>

      {pastCards.length > 0 && (
        <details className="card disclosure" ref={pastRef}>
          <DisclosureSummary>
            지난 코칭 카드 {pastCards.length}
            {cards.hasMore ? '장+' : '장'}
          </DisclosureSummary>
          <p className="muted" style={{ margin: '0 0 6px' }}>
            카드를 누르면 내용과 출처를 다시 볼 수 있어요.
          </p>
          {pastCards.map((d) => (
            <details key={d.id} className="past-card">
              <summary>
                <span className="item-body">
                  <strong>{d.card.title}</strong>
                  <span className="meta">
                    {formatDate(d.deliveredAt)}
                    {d.triedAt && ' · 해봤어요'}
                  </span>
                </span>
              </summary>
              <TriableCard childId={id} delivery={d} onUpdated={replaceCard} onGone={dropCard} />
            </details>
          ))}
          <MoreButton list={cards} demo="childhome-cards-more" label="지난 카드 더 보기" />
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

      {cardPlace === 'bottom' && consentCard}
      {aiChange?.at === 'bottom' && aiChangeNotice}

      {/* 다른 아이 화면으로 바로 옮겨 가면 펼침과 확인 상자를 닫은 채로 시작한다. */}
      <details key={id} className="card disclosure">
        <DisclosureSummary>아이 정보 삭제(동의 철회)</DisclosureSummary>
        <DangerAction
          label="삭제"
          question="정말 삭제할까요?"
          detail={`${c.nickname}의 모든 기록(AI 관찰 기록 포함), 코칭 카드, 공유 설정, 선생님 연결과 선생님이 남긴 목표·메모가 즉시 지워지고 되돌릴 수 없어요.`}
          confirmLabel="삭제하기"
          busyLabel="삭제하는 중…"
          demo="childhome-delete"
          onConfirm={removeChild}
        />
      </details>
    </div>
  );
}
