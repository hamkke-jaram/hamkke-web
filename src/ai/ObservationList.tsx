import { api } from '../api/client';
import type { AiObservation } from '../api/types';
import { usePagedList } from '../components/paging';
import { Loading, MoreButton, Section } from '../components/ui';
import ObservationCard from './ObservationCard';
import './ai.css';

interface Props {
  childId: number;
  /** 한 번에 가져올 개수(최신순). 더 있으면 '더 보기'로 이어서 가져온다. */
  limit?: number;
  /** 이 기록에 '삭제'를 보여 줄지. 권한은 서버가 다시 확인한다. */
  canDelete?: (o: AiObservation) => boolean;
  /** 기록이 하나도 없을 때 보여 줄 문장 */
  emptyText?: string;
  /** 기록이 없으면 제목까지 통째로 숨긴다 */
  hideWhenEmpty?: boolean;
  /** 한 건을 지운 뒤. 그 기록으로 받은 코칭 카드도 서버에서 함께 지워지므로 카드 목록을 다시 불러오는 데 쓴다. */
  onDeleted?: (o: AiObservation) => void;
}

/** 'AI 관찰 기록' 목록. 서버가 이 사용자에게 보여 주기로 한 기록만 온다. */
export default function ObservationList({ childId, limit = 5, canDelete, emptyText, hideWhenEmpty, onDeleted }: Props) {
  const list = usePagedList<AiObservation>(`/children/${childId}/ai-observations`, limit, [childId]);
  const items = list.items ?? [];

  async function remove(o: AiObservation) {
    await api('DELETE', `/children/${childId}/ai-observations/${o.id}`);
    list.setItems((cur) => (Array.isArray(cur) ? cur.filter((x) => x.id !== o.id) : cur));
    onDeleted?.(o);
  }

  // 보여 줄 것이 없을 수 있는 자리(hideWhenEmpty)에서는 불러오는 중·실패·빈 목록일 때 제목까지 숨긴다.
  if (hideWhenEmpty && (list.loading || list.error != null || items.length === 0)) return null;

  return (
    <Section title="AI 관찰 기록">
      {list.loading && items.length === 0 ? (
        <Loading />
      ) : list.error && items.length === 0 ? (
        <div>
          <p className="error" role="alert">
            AI 관찰 기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
          </p>
          <button type="button" className="btn small secondary ai-tap" onClick={list.reload}>
            다시 불러오기
          </button>
        </div>
      ) : items.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          {emptyText ?? '아직 AI 관찰 기록이 없어요.'}
        </p>
      ) : (
        <div>
          {items.map((o) => (
            <ObservationCard
              key={o.id}
              observation={o}
              variant="row"
              onDelete={canDelete?.(o) ? () => remove(o) : undefined}
            />
          ))}
          <MoreButton list={list} demo="ai-obs-more" label="AI 관찰 기록 더 보기" />
        </div>
      )}
    </Section>
  );
}
