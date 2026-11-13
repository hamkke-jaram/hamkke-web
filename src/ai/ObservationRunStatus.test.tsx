import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ObservationRunStatus from './ObservationRunStatus';
import type { RunState } from './useObservationRun';

const FAILED_TITLE = '이번에는 AI 관찰 기록을 만들지 못했어요.';

function render(state: RunState, onRetry?: () => void) {
  return renderToStaticMarkup(
    <ObservationRunStatus
      state={state}
      workingTitle="AI 관찰 기록을 만드는 중이에요"
      reassurance="오늘의 기록(숫자 3개)은 이미 저장되어 있어요."
      onStop={() => undefined}
      onRetry={onRetry}
    />,
  );
}

describe('ObservationRunStatus', () => {
  it('시작 전과 완료는 그리지 않는다', () => {
    expect(render({ kind: 'idle' })).toBe('');
  });

  it('진행 중에는 상태를 알리고 멈출 수 있다. 저장 단계에서는 멈추기를 보여 주지 않는다', () => {
    const analyzing = render({ kind: 'working', stage: 'analyzing' });
    expect(analyzing).toContain('role="status"');
    expect(analyzing).toContain('AI 관찰 기록을 만드는 중이에요');
    expect(analyzing).toContain('멈추기');

    const saving = render({ kind: 'working', stage: 'saving' });
    expect(saving).toContain('저장하고 있어요');
    expect(saving).not.toContain('멈추기');
  });

  it('저장은 되었지만 내용을 가져오지 못한 경우를 실패로 그리지 않는다', () => {
    const html = render({ kind: 'saved', message: "아이 화면의 'AI 관찰 기록'에서 볼 수 있어요." }, () => undefined);
    expect(html).toContain('AI 관찰 기록을 저장했어요.');
    expect(html).toContain('AI 관찰 기록&#x27;에서 볼 수 있어요.');
    expect(html).toContain('role="status"');
    expect(html).not.toContain(FAILED_TITLE);
    expect(html).not.toContain('다시 시도');
  });

  it('실패는 이유와 함께 알리고, 다시 해 볼 만할 때만 다시 시도를 보여 준다', () => {
    const retryable = render({ kind: 'failed', message: '잠시 후 다시 시도해 주세요.', retryable: true }, () => undefined);
    expect(retryable).toContain(FAILED_TITLE);
    expect(retryable).toContain('오늘의 기록(숫자 3개)은 이미 저장되어 있어요.');
    expect(retryable).toContain('<button');

    const final = render({ kind: 'failed', message: '저장하지 않았어요.', retryable: false }, () => undefined);
    expect(final).toContain('저장하지 않았어요.');
    expect(final).not.toContain('<button');

    expect(render({ kind: 'failed', message: '잠시 후 다시 시도해 주세요.', retryable: true })).not.toContain('<button');
  });

  it('멈춘 뒤에는 다시 시도할 수 있다', () => {
    const html = render({ kind: 'stopped' }, () => undefined);
    expect(html).toContain('AI 관찰 기록 만들기를 멈췄어요.');
    expect(html).toContain('<button');
  });
});
