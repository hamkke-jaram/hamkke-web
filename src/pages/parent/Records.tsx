import { useRef } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { ChangeTrend, Child, RecordItem } from '../../api/types';
import { BackLink, DangerAction, useToast } from '../../components/feedback';
import { usePagedList } from '../../components/paging';
import { MoreButton, formatDuration, loadStateView, useLoad } from '../../components/ui';

/** 한 번에 불러올 기록 수. */
const PAGE = 20;

/** 기록마다 붙는 짧은 말. 점수나 평가가 아니라 그때 보인 흐름만 적는다(NEEDS_ATTENTION은 따로 적지 않는다). */
const TREND_CHIP: Partial<Record<ChangeTrend, string>> = {
  FIRST_RECORD: '첫 기록',
  GROWING: '좋은 변화가 보였어요',
  STEADY: '꾸준히 이어가요',
};

function when(iso: string) {
  return new Date(iso).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/**
 * 함께 논 기록 목록(REC-06). 최신순으로 PAGE개씩 보여 주고, 잘못 찍은 기록은 한 건씩 지울 수 있다.
 * 지우면 주간 기록과 다음 코칭 카드 고르기에서도 빠진다(서버가 다시 계산한다).
 */
export default function Records() {
  const { childId } = useParams();
  const id = Number(childId);
  const home = `/p/children/${id}`;
  const toast = useToast();
  const child = useLoad(() => api<Child>('GET', `/children/${id}`), [id]);
  const nickname = child.data?.id === id ? child.data.nickname : undefined;
  const list = usePagedList<RecordItem>(`/children/${id}/interaction-records`, PAGE, [id]);
  const headingRef = useRef<HTMLHeadingElement>(null);

  async function remove(r: RecordItem) {
    // 실패하면 확인 상자 안에 오류가 보인다(DangerAction).
    await api('DELETE', `/children/${id}/interaction-records/${r.id}`);
    // 누른 줄이 사라지므로 목록 제목으로 포커스를 옮겨 둔다.
    headingRef.current?.focus();
    list.setItems((cur) => cur?.filter((x) => x.id !== r.id) ?? null);
    toast('기록을 지웠어요.');
  }

  const items = list.items ?? [];

  return (
    <div>
      <BackLink to={home} label={nickname ?? '아이 홈'} />
      <h1>함께 논 기록</h1>
      <p className="lead">
        기록은 같은 집의 변화를 보기 위한 거예요. 다른 아이와 비교하지 않아요. 잘못 찍은 기록은 여기서 지울 수 있어요.
      </p>
      <section className="card" aria-labelledby="records-h">
        <h2 id="records-h" ref={headingRef} tabIndex={-1}>
          최근 기록
        </h2>
        {loadStateView(list, '기록을') ??
          (items.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              아직 남긴 기록이 없어요.
            </p>
          ) : (
            <div>
              {items.map((r) => {
                const titleId = `records-${r.id}-title`;
                const chip = TREND_CHIP[r.changeTrend];
                return (
                  <div key={r.id} className="list-item" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div className="item-body">
                      <div className="row wrap" style={{ gap: 6 }}>
                        <strong id={titleId}>{when(r.recordedAt)}</strong>
                        {chip && <span className="chip brand">{chip}</span>}
                      </div>
                      <span className="meta">
                        함께한 시간 {formatDuration(r.jointPlaySeconds)} ({formatDuration(r.analyzedSeconds)} 중{' '}
                        {Math.round(r.jointPlayRatio * 100)}%)
                      </span>
                      <span className="meta">
                        답하기까지 {r.responseLatencySec != null ? `${r.responseLatencySec}초` : '–'} · 크게 운 횟수{' '}
                        {r.distressEpisodeCount}번
                      </span>
                    </div>
                    <DangerAction
                      label="삭제"
                      triggerClassName="btn small ghost"
                      describedBy={titleId}
                      labelledBy={titleId}
                      question="이 기록을 지울까요?"
                      detail="주간 기록에서도 빠지고 되돌릴 수 없어요. 이 기록으로 받은 코칭 카드는 남아요."
                      confirmLabel="삭제하기"
                      busyLabel="지우는 중…"
                      demo="records-delete"
                      onConfirm={() => remove(r)}
                    />
                  </div>
                );
              })}
            </div>
          ))}
        <MoreButton list={list} demo="records-more" label="이전 기록 더 보기" />
      </section>
    </div>
  );
}
