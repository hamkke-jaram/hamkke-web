import { renderToStaticMarkup } from 'react-dom/server';
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
  });
});
