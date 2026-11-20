import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, requestTeacherStoryDraft } from '../../api/client';
import type { TeacherStoryDraft } from '../../api/types';
import { watchSharedVisibility } from './useSharedDetail';

type DraftState = { memo: string } & (
  | { status: 'loading' }
  | { status: 'preview'; draft: TeacherStoryDraft }
  | { status: 'error'; message: string }
);

function draftError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 422) return '선생님이 직접 보거나 들은 행동을 한 가지 적고 다시 만들어 주세요.';
    if (error.status === 401) return '로그인 상태를 확인해 주세요.';
    if (error.status === 403 || error.status === 404) return '이 아이와 연결된 선생님 계정에서 초안을 만들 수 있어요.';
    if (error.status === 429) return 'AI가 다른 요청을 처리하고 있어요. 잠시 뒤 다시 시도해 주세요.';
  }
  return '지금은 초안을 만들 수 없어요. 잠시 뒤 다시 시도해 주세요.';
}

export function StoryDraftTools({ childId, memo, title, sending, onApply }: {
  childId: number;
  memo: string;
  title: string;
  sending: boolean;
  onApply: (draft: TeacherStoryDraft) => void;
}) {
  const [result, setResult] = useState<DraftState | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  const cancel = useCallback(() => {
    inFlight.current?.abort();
    inFlight.current = null;
  }, []);
  // 메모가 바뀌면 이전 메모로 만든 제안을 적용할 수 없게 한다.
  useEffect(() => {
    setResult(null);
    return cancel;
  }, [memo, childId, cancel]);
  useEffect(() => watchSharedVisibility(() => {}, () => {
    cancel();
    setResult(null);
  }), [cancel]);

  async function generate() {
    if (inFlight.current || !memo.trim() || sending) return;
    const request = new AbortController();
    inFlight.current = request;
    const timeout = window.setTimeout(() => request.abort(), 60_000);
    setResult({ status: 'loading', memo });
    try {
      const draft = await requestTeacherStoryDraft(childId, memo.trim(), request.signal);
      if (inFlight.current === request) setResult({ status: 'preview', memo, draft });
    } catch (error) {
      if (inFlight.current === request) setResult({ status: 'error', memo, message: draftError(error) });
    } finally {
      window.clearTimeout(timeout);
      if (inFlight.current === request) inFlight.current = null;
    }
  }

  const current = result?.memo === memo ? result : null;
  const pending = current?.status === 'loading';
  return (
    <section className="story-draft" aria-label="AI 이야기 초안">
      <p id="story-draft-help">이야기 칸에 직접 본 행동을 적어 주세요. 초안을 만들면 그 메모를 AI에 보냅니다.</p>
      {current?.status === 'preview' ? (
        <div data-demo="th-story-draft-preview" className="story-draft-preview">
          <h2>초안 미리보기</h2>
          <strong data-demo="th-story-draft-title">{title.trim() ? title : current.draft.title}</strong>
          <p data-demo="th-story-draft-content">{current.draft.content}</p>
          <div className="story-draft-actions">
            <button type="button" className="btn small secondary" onClick={() => setResult(null)}>닫기</button>
            <button type="button" className="btn small" disabled={sending} data-demo="th-story-draft-apply" onClick={() => {
              onApply(current.draft);
              setResult(null);
            }}>{title.trim() ? '본문에 초안 적용' : '제목과 본문에 초안 적용'}</button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn secondary small" data-demo="th-story-draft-generate"
          aria-describedby="story-draft-help" disabled={!memo.trim() || pending || sending} onClick={generate}>
          {pending ? '초안 작성 중…' : current?.status === 'error' ? '초안 다시 만들기' : 'AI 초안 만들기'}
        </button>
      )}
      <span role="status" className={current?.status === 'error' ? 'story-draft-error' : 'sr-only'}>
        {pending && '메모로 초안을 작성하고 있어요.'}
        {current?.status === 'preview' && '초안이 준비됐어요. 내용을 확인한 뒤 적용해 주세요.'}
        {current?.status === 'error' && current.message}
      </span>
    </section>
  );
}
