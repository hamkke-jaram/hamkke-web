import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import type { Observation, TeacherChild } from '../../api/types';
import Mascot from '../../components/Mascot';
import { poseSrc } from '../../components/coachingArt';
import { usePagedList } from '../../components/paging';
import { Loading, MoreButton, formatAge, loadStateView, useLoad } from '../../components/ui';
import { useAuth } from '../../auth/AuthContext';
import { ChevronIcon } from '../parent/icons';
import { artClass } from '../parent/parentMotion';
import InviteCode from './InviteCode';
import TeacherFab from './TeacherFab';
import { currentChild, rememberChild, storyDate, storyPose, storyTitle } from './storyUtils';
import '../parent/parent.css';
import './teacher.css';

/*
 * Figma '선생님 홈화면'
 *   김선생님 / 꿈나무 유치원 | 고우반 → [이야기 작성] → 선생님 이야기(그림·날짜·제목·한 줄) → AI 코칭 확인하기 → 전문가의 도움
 *   오른쪽 아래 떠 있는 버튼: 아이 추가하기 · 다른 아이로 바꾸기.
 * 연결된 아이가 없으면 '보호자 초대코드' 화면(InviteCode)이 홈이다.
 */

const STORY_PAGE = 20;

/** 로그인 없이 시작한 선생님의 기본 이름은 '선생님'이라 '님'을 한 번 더 붙이지 않는다. */
export function teacherTitle(name: string | undefined | null): string {
  if (!name) return '선생님';
  return name.endsWith('님') ? name : `${name}님`;
}

export default function TeacherHome() {
  const children = useLoad(() => api<TeacherChild[]>('GET', '/teacher/children'), []);
  const [picked, setPicked] = useState<number | null>(null);

  if (children.loading && !children.data) return <Loading />;
  const fail = loadStateView(children, '연결된 아이를');
  if (fail) return fail;
  const list = children.data ?? [];
  const child = currentChild(list, picked ?? undefined);
  if (!child) return <InviteCode onLinked={children.reload} />;

  return (
    <StoryHome
      key={child.id}
      child={child}
      others={list.filter((c) => c.id !== child.id)}
      onPick={(c) => {
        rememberChild(c.id);
        setPicked(c.id);
        window.scrollTo({ top: 0 });
      }}
    />
  );
}

function StoryHome({ child, others, onPick }: { child: TeacherChild; others: TeacherChild[]; onPick: (c: TeacherChild) => void }) {
  const { user } = useAuth();
  const id = child.id;
  const notes = usePagedList<Observation>(`/children/${id}/observations`, STORY_PAGE, [id]);
  const place = [user?.institution, user?.className].filter(Boolean).join(' | ');

  return (
    <div className="th-home">
      <header className="th-head">
        <h1 className="th-name">{teacherTitle(user?.displayName)}</h1>
        {place ? (
          <p className="th-place">{place}</p>
        ) : (
          <Link to="/account" className="th-place th-place-empty">
            기관·반 이름 적기
          </Link>
        )}
      </header>

      <Link to={`/t/children/${id}`} className="th-child" data-demo="th-child">
        <span className="th-child-initial" aria-hidden="true">
          {child.nickname.slice(0, 1)}
        </span>
        <span className="th-child-text">
          <strong>{child.nickname}</strong>
          <span>{formatAge(child.ageMonths)} · 공유 기록·목표·이야기 나누기</span>
        </span>
        <ChevronIcon size={18} />
      </Link>

      <Link to={`/t/children/${id}/story/new`} className="btn block th-write" data-demo="th-write">
        이야기 작성
      </Link>
      <Link to={`/t/children/${id}/ai-reviews`} className="btn secondary block th-review-link" data-demo="th-ai-reviews">
        가정 영상 검토
      </Link>

      <section aria-labelledby="th-story-h">
        <h2 id="th-story-h" className="th-section-title">
          선생님 이야기
        </h2>
        {notes.loading && !notes.items ? (
          <Loading />
        ) : (
          (loadStateView(notes, '선생님 이야기를') ??
          (notes.items && notes.items.length === 0 ? (
            <p className="muted th-empty">아직 쓴 이야기가 없어요. 오늘 {child.nickname} 곁에서 있었던 일을 보호자에게 전해 보세요.</p>
          ) : (
            <ul className="story-rows">
              {notes.items?.map((n, i) => {
                const pose = storyPose(n);
                return (
                  <li key={n.id}>
                    <Link to={`/t/children/${id}/story/${n.id}`} className="story-row">
                      <span className={`story-row-art${i % 2 ? ' lavender' : ''}`}>
                        <img className={artClass(pose) || undefined} src={poseSrc(pose)} alt="" width={56} height={56} loading="lazy" decoding="async" />
                      </span>
                      <span className="story-row-text">
                        <span className="story-row-date">{storyDate(n.observedOn)}</span>
                        <strong>{storyTitle(n)}</strong>
                        <span className="story-row-line">{n.content}</span>
                      </span>
                      <ChevronIcon size={20} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )))
        )}
        <MoreButton list={notes} label="이야기 더 보기" />
      </section>

      {/* 가정 영상에서 AI가 본 아이 행동과 보호자 대응(줄인 형태). 코칭과 섞이지 않게 따로 둔다. */}
      <Link to={`/t/children/${id}/home-scenes`} className="th-coach th-scenes-link" data-demo="th-scenes">
        <span className="th-coach-note">* 보호자가 AI 관찰 기록 공유를 켜면 가정에서 본 장면을 볼 수 있어요</span>
        <span className="th-coach-body">
          <Mascot name="friend" size={112} />
          <span className="th-coach-text">
            <span className="th-coach-ai">가정 영상</span>
            <strong>가정에서 본 장면</strong>
            <span className="th-coach-sub">아이의 행동과 보호자의 대응</span>
          </span>
          <ChevronIcon size={20} />
        </span>
      </Link>

      <Link to={`/t/children/${id}/coaching`} className="th-coach" data-demo="th-coaching">
        <span className="th-coach-note">* 보호자가 공유를 켜면 가정의 관찰 기록과 코칭을 볼 수 있어요</span>
        <span className="th-coach-body">
          <Mascot name="teddy" size={112} />
          <span className="th-coach-text">
            <span className="th-coach-ai">AI</span>
            <strong>코칭 확인하기</strong>
            <span className="th-coach-sub">공유된 가정 행동 기록과 코칭</span>
          </span>
          <ChevronIcon size={20} />
        </span>
      </Link>

      <Link to="/support" className="expert-banner th-expert">
        <span className="expert-title">전문가의 도움이 필요하다면</span>
        <span className="expert-sub">아이에게 맞는 상담과 가까운 기관을 알아보세요.</span>
        <span className="th-expert-foot">
          <Mascot name="family" size={150} />
          <span className="expert-go">
            상담 · 기관 안내
            <ChevronIcon size={16} />
          </span>
        </span>
      </Link>

      <TeacherFab others={others} onPick={onPick} />
    </div>
  );
}
