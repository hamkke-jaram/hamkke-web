import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { HomeScene } from '../api/types';
import HomeSceneCard, { sceneDay } from './HomeSceneCard';

const SCENE: HomeScene = {
  id: 1,
  observedOn: '2026-11-19',
  childStates: ['REFUSING', 'FOCUSED'],
  adultResponses: ['WAITING', 'TALKING'],
  childLine: '아이가 블록을 밀어내요.',
  parentLine: '어른이 곁에서 기다린 뒤 말을 걸어요.',
  reviewStatus: 'PENDING',
  hiddenFromTeacher: false,
};

describe('가정 장면 카드', () => {
  it('날짜만 쓴다(시각은 오지 않는다)', () => {
    expect(sceneDay('2026-11-19')).toBe('11월 19일');
    expect(sceneDay('2026-01-05')).toBe('1월 5일');
  });

  it('아이·보호자 한 줄과 태그를 함께 보여 준다', () => {
    const html = renderToStaticMarkup(<HomeSceneCard scene={SCENE} />);
    expect(html).toContain('11월 19일 · 가정에서');
    expect(html).toContain('아이가 블록을 밀어내요.');
    expect(html).toContain('어른이 곁에서 기다린 뒤 말을 걸어요.');
    expect(html).toContain('싫다고 표현해요');
    expect(html).toContain('기다려 줘요');
    expect(html).toContain('보호자');
  });

  it('한 줄이 없으면 태그만, 아무것도 없으면 안내 한 줄', () => {
    const tagsOnly = renderToStaticMarkup(<HomeSceneCard scene={{ ...SCENE, childLine: null, parentLine: null }} />);
    expect(tagsOnly).toContain('싫다고 표현해요');
    expect(tagsOnly).not.toContain('밀어내요');
    const empty = renderToStaticMarkup(
      <HomeSceneCard scene={{ ...SCENE, childLine: null, parentLine: null, childStates: [], adultResponses: [] }} />,
    );
    expect(empty).toContain('전할 모습을 고르지 못했어요');
    expect(empty).not.toContain('보호자');
  });

  it('어른이 없는 장면에는 보호자 칸이 없다', () => {
    const html = renderToStaticMarkup(<HomeSceneCard scene={{ ...SCENE, parentLine: null, adultResponses: [] }} />);
    expect(html).toContain('아이가 블록을 밀어내요.');
    expect(html).not.toContain('>보호자<');
  });
});
