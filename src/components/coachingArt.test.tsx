import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Card, MetricFocus } from '../api/types';
import { KNOWN_CODES, POSES, poseFor, poseSrc } from './coachingArt';
import { CoachingCardView } from './ui';

// public/coaching 에 실제로 있는 그림 파일(불러오지는 않고 이름만 본다).
const artFiles = Object.keys(import.meta.glob('../../public/coaching/*.webp')).map((path) => path.split('/').pop());

const card = (over: Partial<Card> = {}): Card => ({
  id: 1,
  title: '주고받기를 한 번 더',
  body: '공을 굴리고 잠깐 기다려 보세요.',
  situation: 'GROWING',
  metricFocus: 'JOINT_PLAY',
  evidenceTag: '부모 매개 중재 연구에 바탕을 둔 내용',
  sourceTitle: '출처 문서',
  sourceUrl: null,
  author: '함께자람',
  reviewer: null,
  ...over,
});

describe('코칭 카드 그림 고르기', () => {
  it('카드 코드가 있으면 코드로 고른다(초점보다 먼저)', () => {
    const byCode: Record<string, string[]> = {
      'ball-wait': ['RS-A-01', 'JP-G-02'],
      blocks: ['FIRST-02', 'JP-S-01', 'JP-A-01'],
      book: ['GEN-A-02', 'HM-A-03'],
      'clap-sing': ['RS-G-01', 'RS-S-01', 'JP-G-01', 'HM-A-06'],
      comfort: ['CA-A-01', 'HM-A-01'],
      listen: ['CA-S-01', 'HM-A-02', 'HM-A-05'],
      breathe: ['GEN-S-01', 'HM-A-04', 'CA-G-01'],
      laugh: ['FIRST-01', 'GEN-A-01', 'GEN-G-01'],
    };
    for (const [pose, codes] of Object.entries(byCode)) {
      // 초점은 일부러 그 포즈로 가지 않는 값을 넣는다.
      const focus: MetricFocus = pose === 'comfort' ? 'CALM' : 'HARD_MOMENT';
      for (const code of codes) expect(poseFor({ code, metricFocus: focus }), code).toBe(pose);
    }
    expect(Object.values(byCode).flat().sort()).toEqual([...KNOWN_CODES].sort());
  });

  it('서버 마이그레이션의 카드 22장이 모두 코드 표에 있다', () => {
    expect(KNOWN_CODES).toHaveLength(22);
    expect(new Set(KNOWN_CODES).size).toBe(22);
  });

  it('코드가 없거나 모르는 코드면 초점으로 고른다', () => {
    expect(poseFor({ metricFocus: 'JOINT_PLAY' })).toBe('blocks');
    expect(poseFor({ metricFocus: 'RESPONSE' })).toBe('ball-wait');
    expect(poseFor({ metricFocus: 'CALM' })).toBe('breathe');
    expect(poseFor({ metricFocus: 'HARD_MOMENT' })).toBe('comfort');
    expect(poseFor({ metricFocus: 'GENERAL' })).toBe('laugh');
    expect(poseFor({ code: 'NEW-X-99', metricFocus: 'RESPONSE' })).toBe('ball-wait');
    expect(poseFor({ code: '', metricFocus: 'CALM' })).toBe('breathe');
  });

  it('초점도 모르는 값이면 웃는 그림을 쓴다', () => {
    expect(poseFor({ metricFocus: 'SOMETHING_NEW' as MetricFocus })).toBe('laugh');
    expect(poseFor({ code: 'constructor', metricFocus: 'toString' as MetricFocus })).toBe('laugh');
    expect(poseFor({ code: null as unknown as string, metricFocus: undefined as unknown as MetricFocus })).toBe('laugh');
  });

  it('코드의 대소문자와 앞뒤 빈칸은 맞춰서 본다', () => {
    expect(poseFor({ code: ' jp-g-01 ', metricFocus: 'GENERAL' })).toBe('clap-sing');
  });

  it('포즈마다 그림 파일이 있고, 쓰지 않는 그림 파일은 없다', () => {
    for (const pose of POSES) expect(poseSrc(pose)).toBe(`/coaching/${pose}.webp`);
    expect([...artFiles].sort()).toEqual(POSES.map((pose) => `${pose}.webp`).sort());
  });
});

describe('코칭 카드 화면', () => {
  it('그림은 꾸밈으로(alt 없음) 크기를 정해 느리게 불러온다', () => {
    const html = renderToStaticMarkup(<CoachingCardView card={card({ code: 'JP-G-02' })} />);
    expect(html).toContain('src="/coaching/ball-wait.webp"');
    expect(html).toContain('alt=""');
    expect(html).toContain('width="96"');
    expect(html).toContain('height="96"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
  });

  it('제목·본문·근거 줄과 시연 이름은 그대로다', () => {
    const delivery = { id: 7, deliveredAt: '2026-11-17T09:00:00Z', triedAt: null, card: card() };
    const html = renderToStaticMarkup(<CoachingCardView card={delivery.card} delivery={delivery} onTried={() => {}} />);
    expect(html).toContain('<h3');
    expect(html).toContain('주고받기를 한 번 더');
    expect(html).toContain('공을 굴리고 잠깐 기다려 보세요.');
    expect(html).toContain('data-demo="coach-tried"');
    expect(html).toContain('data-demo="coach-evidence"');
    expect(html).toContain('src="/coaching/blocks.webp"');
  });
});
