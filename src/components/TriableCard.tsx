import { useEffect, useRef, useState } from 'react';
import { ApiError, api, errorMessage } from '../api/client';
import type { Delivery } from '../api/types';
import { useToast } from './feedback';
import { CoachingCardView, ErrorText } from './ui';

interface Props {
  childId: number;
  delivery: Delivery;
  /** '해봤어요'를 저장한 뒤 바뀐 전달 항목 */
  onUpdated?: (d: Delivery) => void;
  /**
   * 카드가 서버에서 지워졌을 때(404: AI 관찰 기록을 지웠거나 AI 동의를 끄면 그 기록으로 받은 카드도 지워진다).
   * 있으면 목록에서 빼도록 알리고, 없으면 카드 아래에 안내한다.
   */
  onGone?: (d: Delivery) => void;
}

/**
 * '오늘 해봤어요'를 누를 수 있는 코칭 카드(아이 홈의 이번 코칭·지난 카드, 기록 결과 화면이 같이 쓴다).
 * 누르면 버튼이 '✓ 해봤어요' 표시로 바뀌므로 그 표시로 포커스를 옮긴다.
 */
export default function TriableCard({ childId, delivery, onUpdated, onGone }: Props) {
  const toast = useToast();
  const [d, setD] = useState(delivery);
  useEffect(() => setD(delivery), [delivery]);
  // state는 다시 그려진 뒤에야 바뀌므로, 빠르게 두 번 눌러도 한 번만 보내도록 ref로도 막는다.
  const busy = useRef(false);
  const [error, setError] = useState<unknown>(null);
  const triedRef = useRef<HTMLSpanElement>(null);
  const [saved, setSaved] = useState(0);
  useEffect(() => {
    if (saved) triedRef.current?.focus({ preventScroll: true });
  }, [saved]);

  async function tried() {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    try {
      const updated = await api<Delivery>('POST', `/children/${childId}/card-deliveries/${d.id}/tried`);
      setD(updated);
      onUpdated?.(updated);
      toast(`'해봤어요'로 남겼어요. 잘하셨어요.`);
      setSaved((n) => n + 1);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        if (onGone) {
          toast('이 카드는 지워져서 목록에서 뺐어요.');
          onGone(d);
        } else {
          setError(new Error('이 카드는 지워져서 더 이상 남길 수 없어요.'));
        }
      } else {
        setError(new Error(`'해봤어요'를 저장하지 못했어요. 잠시 후 다시 눌러 주세요. (${errorMessage(e)})`));
      }
    } finally {
      busy.current = false;
    }
  }

  return (
    <>
      <CoachingCardView card={d.card} delivery={d} onTried={() => void tried()} triedRef={triedRef} />
      <ErrorText error={error} />
    </>
  );
}
