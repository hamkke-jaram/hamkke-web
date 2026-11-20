import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { AiObservation } from '../api/types';
import ObservationCard, { AI_CAVEAT } from './ObservationCard';

const OBS: AiObservation = {
  id: 3,
  source: 'INSTITUTION',
  recordedAt: '2026-11-13T01:00:00Z',
  createdAt: '2026-11-13T01:02:00Z',
  summary: '어른과 아이가 블록을 사이에 두고 마주 앉아 있어요.',
  childStates: ['PLAYING_TOGETHER', 'REFUSING', 'NOT_IN_LIST'],
  adultResponses: ['WAITING'],
  moments: [
    { t: 12.5, note: '아이가 블록을 밀어내요.' },
    { t: 75, note: '   ' },
  ],
  peopleCount: 3,
  authorName: '해님반 선생님',
  mine: true,
  modelVersion: 'test-model',
};

describe('ObservationCard', () => {
  it('요약, 태그, 시각별 메모, 출처와 고정 문구를 보여 준다', () => {
    const html = renderToStaticMarkup(<ObservationCard observation={OBS} />);
    expect(html).toContain('어른과 아이가 블록을 사이에 두고 마주 앉아 있어요.');
    expect(html).toContain('기관에서 기록');
    expect(html).toContain('해님반 선생님');
    expect(html).toContain('어른과 함께 놀아요');
    expect(html).toContain('싫다고 표현해요');
    expect(html).toContain('기다려 줘요');
    expect(html).toContain('00:12');
    expect(html).toContain('아이가 블록을 밀어내요.');
    expect(html).toContain('잠시 기다려 보기');
    expect(html).toContain('다시 내밀지 말고');
    expect(html).toContain('다음에 볼 점');
    expect(html).toContain(AI_CAVEAT);
    expect(html).toContain('3명 이상');
    // 목록에 없는 태그와 빈 메모는 보여 주지 않는다.
    expect(html).not.toContain('NOT_IN_LIST');
    expect(html).not.toContain('01:15');
  });

  it('삭제 권한을 넘겨주지 않으면 삭제 버튼이 없다', () => {
    expect(renderToStaticMarkup(<ObservationCard observation={OBS} />)).not.toContain('이 기록 삭제');
    expect(renderToStaticMarkup(<ObservationCard observation={OBS} onDelete={async () => undefined} />)).toContain(
      '이 기록 삭제',
    );
  });

  it('요약이 없고 태그가 비어 있어도 그릴 수 있다', () => {
    const empty = {
      ...OBS,
      source: 'HOME',
      summary: null,
      childStates: [],
      adultResponses: [],
      moments: [],
      authorName: undefined,
    } satisfies AiObservation;
    const html = renderToStaticMarkup(<ObservationCard observation={empty} variant="row" />);
    expect(html).toContain('가정에서 기록');
    expect(html).toContain(AI_CAVEAT);
    expect(html).not.toContain('아이 모습');
    expect(html).not.toContain('어른 반응');
    expect(html).not.toContain('어떻게 반응하면 좋을까요?');
    expect(html).toContain('저장된 시각별 메모가 없어요.');
  });

  it('검토 전의 가정 기록은 원본 관찰·태그·대응을 보호자에게 보여 주지 않는다', () => {
    const pending = { ...OBS, source: 'HOME', reviewStatus: 'PENDING' } satisfies AiObservation;
    const html = renderToStaticMarkup(<MemoryRouter><ObservationCard observation={pending} childId={4}
      reviewAccess="sharing-off" /></MemoryRouter>);
    expect(html).toContain('선생님 검토 대기');
    expect(html).toContain('/p/children/4/share');
    expect(html).not.toContain(OBS.summary);
    expect(html).not.toContain(OBS.moments[0].note);
    expect(html).not.toContain('싫다고 표현해요');
    expect(html).not.toContain('3명 이상');
    expect(html).not.toContain('다시 내밀지 말고');
  });

  it('교사가 전달한 관찰·대응·이유·출처를 표시한다', () => {
    const published = { ...OBS, source: 'HOME', reviewStatus: 'PUBLISHED', publishedGuidance: {
      summary: '교사가 확인한 장면', corpusVersion: 'test', reviewedAt: OBS.createdAt,
      recommendations: [{ observation: '손을 뻗어요.', action: '잠시 지켜봐 주세요.', reason: '아이가 고를 시간을 가질 수 있어요.',
        sourceId: 'test', sourcePublisher: '자료 제공 기관', sourceTitle: '놀이 안내', sourceSection: '반응하기', sourceUrl: 'https://example.org/guide' }],
    } } satisfies AiObservation;
    const html = renderToStaticMarkup(<ObservationCard observation={published} />);
    for (const value of ['선생님 검토 완료', '교사가 확인한 장면', '손을 뻗어요.', '잠시 지켜봐 주세요.',
      '아이가 고를 시간을 가질 수 있어요.', '자료 제공 기관', '반응하기', 'https://example.org/guide']) expect(html).toContain(value);
    expect(html).not.toContain(OBS.summary);
    const noAction = renderToStaticMarkup(<ObservationCard observation={{ ...published, publishedGuidance: {
      ...published.publishedGuidance, recommendations: [],
    } }} />);
    expect(noAction).toContain('이번 검토에서 전달된 대응 방법은 없어요.');
  });

  it('관련 없는 기록 태그를 특정 장면의 근거로 쓰지 않는다', () => {
    const observation = { ...OBS, childStates: ['THROWING_OR_HITTING'], moments: [
      { t: 1, note: '어른이 아이를 바라보고 있어요.' },
      { t: 8, note: '아이가 어른에게 물건을 건네요.' },
    ] };
    const html = renderToStaticMarkup(<ObservationCard observation={observation} />);
    expect(html).toContain('상황 먼저 확인하기');
    expect(html).not.toContain('공간을 확보');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-pressed="false"');
  });

  it('먼저 볼 안전 장면이 나중 시각에 있어도 처음부터 그 장면을 연다', () => {
    const observation = { ...OBS, moments: [
      { t: 1, note: '손이 블록을 옮겨요.' },
      { t: 8, note: '아이가 돌멩이를 어른에게 던져요.' },
    ] };
    const html = renderToStaticMarkup(<ObservationCard observation={observation} />);
    expect(html).toContain('맞을 수 있는 사람을');
    expect(html).toContain('00:08 · ');
  });
});
