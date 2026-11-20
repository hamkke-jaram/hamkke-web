import { useState } from 'react';
import { api, errorMessage } from '../api/client';
import type { HomeScene } from '../api/types';
import { usePagedList } from '../components/paging';
import { MoreButton, loadStateView } from '../components/ui';
import HomeSceneCard from './HomeSceneCard';

const PAGE = 5;

/**
 * 보호자 미리보기: 'AI 관찰 기록' 공유를 켜면 선생님에게 이 모습만 간다(선생님 화면과 같은 카드).
 * 기록마다 "선생님에게 보내지 않기"를 고를 수 있고, 다시 보낼 수도 있다. 서버가 선생님 화면 어디에서나 뺀다.
 */
export default function ParentScenePreview({ childId }: { childId: number }) {
  const list = usePagedList<HomeScene>(`/children/${childId}/home-scenes`, PAGE, [childId]);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<{ id: number; error: unknown } | null>(null);

  if (list.items && list.items.length === 0) return null;

  async function toggle(scene: HomeScene) {
    if (busy !== null) return;
    setBusy(scene.id);
    setError(null);
    try {
      const hidden = !scene.hiddenFromTeacher;
      await api('PUT', `/children/${childId}/ai-observations/${scene.id}/teacher-visibility`, { hidden });
      list.setItems((cur) => cur && cur.map((s) => (s.id === scene.id ? { ...s, hiddenFromTeacher: hidden } : s)));
    } catch (err) {
      setError({ id: scene.id, error: err });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card" aria-labelledby="scene-preview-h" data-demo="scene-preview">
      <h2 id="scene-preview-h">선생님에게 전달되는 모습</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        'AI 관찰 기록' 공유를 켜 두면 선생님에게는 아래 내용만 가요. 원래 기록의 문장, 시각, 사진은 가지 않아요.
      </p>
      {loadStateView(list, '전달되는 모습을') ?? (
        <div>
          {list.items?.map((s) => (
            <HomeSceneCard key={s.id} scene={s}>
              <div className="home-scene-actions">
                {s.hiddenFromTeacher && <span className="chip">선생님에게 보내지 않음</span>}
                <button
                  type="button"
                  className="btn small secondary ai-tap"
                  aria-disabled={busy !== null}
                  onClick={() => toggle(s)}
                >
                  {busy === s.id ? '바꾸는 중…' : s.hiddenFromTeacher ? '다시 보내기' : '이 기록은 보내지 않기'}
                </button>
              </div>
              {error?.id === s.id && (
                <p className="error" role="alert" style={{ marginTop: 8 }}>
                  {errorMessage(error.error)}
                </p>
              )}
            </HomeSceneCard>
          ))}
        </div>
      )}
      <MoreButton list={list} label="지난 기록 더 보기" />
    </section>
  );
}
