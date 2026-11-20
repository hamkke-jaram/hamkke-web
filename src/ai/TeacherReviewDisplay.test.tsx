import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it } from 'vitest';
import type { AiObservation, TeacherReviewDisplay } from '../api/types';
import { ReviewFollowUp, ReviewScene } from './TeacherReviewDisplay';

const child = { t: 5, note: '아이가 넘어진 블록을 다시 세워요.' };
const caregiver = { t: 8, note: '보호자가 곁에서 기다려요.' };
const shared = { t: 10, note: '블록이 바닥에 놓여 있어요.' };
const observation: AiObservation = {
  id: 7, source: 'HOME', recordedAt: '2026-11-19T09:00:00Z', createdAt: '2026-11-19T09:01:00Z',
  summary: '블록을 세우는 장면이에요.', peopleCount: 2, modelVersion: 'example', childStates: ['FOCUSED'],
  adultResponses: ['WAITING'], moments: [child, caregiver, shared],
};
const display: TeacherReviewDisplay = {
  observationId: observation.id, recordedAt: observation.recordedAt, source: 'HOME', peopleCount: 2,
  summary: observation.summary, scenes: observation.moments,
  child: { notes: [child], tags: ['FOCUSED'] }, caregiver: { role: 'CAREGIVER', notes: [caregiver], tags: ['WAITING'] },
  responseOptions: { status: 'PENDING', corpusVersion: null, items: [] },
  relatedCoaching: { deliveryId: 12, title: '잠시 기다려요', href: '/t/children/4/coaching/12' },
  actions: [
    { type: 'WRITE_PARENT_FEEDBACK', label: '보호자에게 피드백 쓰기', href: '/t/children/4/story/new' },
    { type: 'REQUEST_CONSULTATION', label: '상담 요청하기', href: '/t/children/4/talk?draft=consultation' },
  ],
};

describe('teacher observation review display', () => {
  it('renders actor notes, tags and unassigned scenes without repeating notes', () => {
    const html = renderToStaticMarkup(<ReviewScene observation={observation} display={display} />);
    expect(html).toContain('한 가지에 푹 빠져 있어요');
    expect(html).toContain('기다려 줘요');
    for (const { note } of observation.moments) expect(html.split(note)).toHaveLength(2);
  });

  it('keeps existing observations visible with an older API response', () => {
    const html = renderToStaticMarkup(<ReviewScene observation={observation} />);
    expect(html).toContain('11월 19일 · 가정에서 기록');
    for (const { note } of observation.moments) expect(html).toContain(note);
  });

  it('labels generic adult notes and tags as adult responses', () => {
    const html = renderToStaticMarkup(<ReviewScene observation={observation}
      display={{ ...display, caregiver: { role: 'ADULT', notes: [{ t: 13, note: '어른이 기다려요.' }], tags: ['WAITING'] } }} />);
    expect(html).toContain('어른의 반응');
    expect(html).not.toContain('>보호자</h3>');
  });

  it('links only to valid teacher routes for this child', () => {
    const render = (model: TeacherReviewDisplay) => renderToStaticMarkup(
      <StaticRouter location="/t/children/4/ai-reviews/7"><ReviewFollowUp childId={4} display={model} /></StaticRouter>,
    );
    const html = render(display);
    expect(html).toContain('href="/t/children/4/coaching/12"');
    expect(html).toContain('href="/t/children/4/story/new"');
    expect(html).toContain('href="/t/children/4/talk?draft=consultation"');

    expect(render({
      ...display,
      relatedCoaching: { ...display.relatedCoaching!, href: '/t/children/99/coaching/12' },
      actions: display.actions.map(action => ({ ...action, href: 'https://test.invalid/' })),
    })).toBe('');
  });
});
