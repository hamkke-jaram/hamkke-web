import { Link } from 'react-router-dom';
import type { AiObservation, ObservationMoment, TeacherReviewDisplay } from '../api/types';
import { sharedDayLabel } from '../pages/teacher/CoachingRows';
import { ADULT_RESPONSE_LABEL, CHILD_STATE_LABEL, SOURCE_LABEL, formatClock, labelsOf } from './labels';

function SceneNotes({ notes }: { notes: ObservationMoment[] }) {
  return <ul className="review-scenes">{notes.map((moment, i) =>
    <li key={i}><span className="ai-time">{formatClock(moment.t)}</span> {moment.note}</li>)}</ul>;
}

function ActorNotes({ name, actor, labels }: {
  name: string;
  actor: TeacherReviewDisplay['child'];
  labels: Record<string, string>;
}) {
  const tags = labelsOf(actor.tags, labels);
  if (!actor.notes.length && !tags.length) return null;

  return <div className="ai-tag-group">
    <h3 className="ai-tag-title">{name}</h3>
    {actor.notes.length > 0 && <SceneNotes notes={actor.notes} />}
    {tags.length > 0 && <ul className="ai-chips">{tags.map(tag => <li className="chip" key={tag}>{tag}</li>)}</ul>}
  </div>;
}

export function ReviewScene({ observation, display }: { observation: AiObservation; display?: TeacherReviewDisplay }) {
  const date = sharedDayLabel(display?.recordedAt ?? (observation.recordedAt || observation.createdAt));
  const source = SOURCE_LABEL[display?.source ?? observation.source];
  const notes = display?.scenes ?? observation.moments ?? [];
  const actorNotes = display ? [...display.child.notes, ...display.caregiver.notes] : [];
  const otherNotes = notes.filter(note => !actorNotes.some(actorNote => actorNote.t === note.t && actorNote.note === note.note));

  return <>
    <p className="review-date">{[date, source ? `${source}에서 기록` : ''].filter(Boolean).join(' · ')}</p>
    <section aria-labelledby="review-scenes"><h2 id="review-scenes">AI가 장면에서 관찰한 행동</h2>
      <p className="muted">AI가 영상에서 추린 장면 사진을 보고 작성한 메모예요. 원본 영상과 소리는 보호자의 기기에 있어요.</p>
      {display && <>
        <ActorNotes name="아이" actor={display.child} labels={CHILD_STATE_LABEL} />
        <ActorNotes name={display.caregiver.role === 'CAREGIVER' ? '보호자' : '어른의 반응'} actor={display.caregiver} labels={ADULT_RESPONSE_LABEL} />
      </>}
      {otherNotes.length > 0 && <SceneNotes notes={otherNotes} />}
      {notes.length === 0 && actorNotes.length === 0 &&
        <p>{display?.summary?.trim() || observation.summary?.trim() || '장면에서 구체적인 행동을 확인하기 어려웠어요.'}</p>}
    </section>
  </>;
}

export function ReviewFollowUp({ childId, display }: { childId: number; display?: TeacherReviewDisplay }) {
  if (!display) return null;
  const root = `/t/children/${childId}`;
  const coaching = display.relatedCoaching;
  const sharedCoaching = coaching && Number.isSafeInteger(coaching.deliveryId) && coaching.deliveryId > 0 &&
    coaching.href === `${root}/coaching/${coaching.deliveryId}` ? coaching : null;
  const feedback = display.actions.find(action => action.type === 'WRITE_PARENT_FEEDBACK' && action.href === `${root}/story/new`);
  const consultation = display.actions.find(action => action.type === 'REQUEST_CONSULTATION' && action.href === `${root}/talk?draft=consultation`);
  if (!sharedCoaching && !feedback && !consultation) return null;

  return <section aria-label="관찰 기록 후속 조치">
    {sharedCoaching && <p className="th-source">이 장면에서 받은 코칭{' '}
      <Link to={sharedCoaching.href}>{sharedCoaching.title}</Link>
    </p>}
    {(feedback || consultation) && <div className="review-follow-up">
      {feedback && <Link className="btn secondary" to={feedback.href}
        state={sharedCoaching ? { deliveryId: sharedCoaching.deliveryId } : undefined}>{feedback.label}</Link>}
      {consultation && <Link className="btn secondary" to={consultation.href}>{consultation.label}</Link>}
    </div>}
  </section>;
}
