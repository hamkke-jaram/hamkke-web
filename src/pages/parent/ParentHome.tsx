import { useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api } from '../../api/client';
import type { Child, WeekSummary } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import EmptyState from '../../components/EmptyState';
import Mascot from '../../components/Mascot';
import { ErrorText, Loading, formatAge, useLoad } from '../../components/ui';
import { ChevronIcon } from './icons';
import { thisWeekStart } from './week';
import './parent.css';

/** 서버의 ChildService.MAX_CHILDREN_PER_PARENT와 같은 값. */
const MAX_CHILDREN = 5;
/**
 * 아이 목록의 기록 줄에 쓰는 주간 요약 범위(주). 서버가 주는 최대치(WeeklySummaryService.MAX_WEEKS)라
 * 요약이 비어 기록 목록을 한 번 더 확인해야 하는 아이가 가장 적다.
 */
const SUMMARY_WEEKS = 26;
/** 이번 주에 찍은 영상의 기록이 없을 때. 주간 요약은 촬영 시각으로 주를 나누므로 '함께 논' 때를 말한다. */
const NONE_THIS_WEEK = '이번 주에 함께 논 기록은 아직 없어요';

/** 아이 행 둘째 줄의 기록 상태(나이 뒤에 붙는다). 요약이 비어 있지 않을 때만 부른다. */
function recordLine(weeks: WeekSummary[]) {
  const n = weeks.find((w) => w.weekStart === thisWeekStart())?.recordCount ?? 0;
  return n > 0 ? `이번 주 ${n}번 기록` : NONE_THIS_WEEK;
}

export default function ParentHome() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useLoad(() => api<Child[]>('GET', '/children'), []);
  // '다시 불러오기'를 누르면 화면 전체가 불러오는 표시로 바뀌어 버튼(포커스)이 사라진다. 다 불러온 뒤 제목으로 돌려준다.
  const h1Ref = useRef<HTMLHeadingElement>(null);
  const retrying = useRef(false);
  useEffect(() => {
    if (!loading && retrying.current) {
      retrying.current = false;
      h1Ref.current?.focus();
    }
  }, [loading]);
  // 아이마다 기록 상태 줄. 아이별로 따로 불러오고, 못 불러온 아이는 나이만 보여 준다.
  const [lines, setLines] = useState<Record<number, string>>({});
  useEffect(() => {
    // 한 명이면 바로 그 아이 홈으로 가므로 부르지 않는다.
    if (!data || data.length < 2) return;
    let alive = true;
    for (const c of data) {
      api<{ weeks: WeekSummary[] }>('GET', `/children/${c.id}/weekly-summary?weeks=${SUMMARY_WEEKS}`)
        .then((r) => {
          if (r.weeks.length > 0) return recordLine(r.weeks);
          // 요약은 최근 몇 주만 준다. 비었으면 그보다 오래된 기록이 있는지 한 번 더 확인한다.
          return api<unknown[]>('GET', `/children/${c.id}/interaction-records?limit=1`).then((list) =>
            list.length === 0 ? '아직 기록이 없어요' : NONE_THIS_WEEK,
          );
        })
        .then((line) => {
          if (alive) setLines((m) => ({ ...m, [c.id]: line }));
        })
        .catch(() => undefined);
    }
    return () => {
      alive = false;
    };
  }, [data]);

  if (loading) return <Loading />;
  if (data && data.length === 1) return <Navigate to={`/p/children/${data[0].id}`} replace />;

  // 아이가 여럿이면 시안의 '아이 선택' 머리(작은 인사 + 큰 제목 + 오른쪽 캐릭터), 없으면 인사가 제목이다.
  const choosing = (data?.length ?? 0) > 1;

  return (
    <div>
      {choosing ? (
        <div className="ph-head">
          <div className="ph-head-text">
            <p className="ph-eyebrow">{user?.displayName}님, 안녕하세요</p>
            <h1 ref={h1Ref} tabIndex={-1}>
              아이 선택
            </h1>
          </div>
          <Mascot name="family" size={132} />
        </div>
      ) : (
        <h1 ref={h1Ref} tabIndex={-1}>
          {user?.displayName}님, 안녕하세요
        </h1>
      )}
      <p className="lead">오늘도 아이 곁에 있어 주셔서 고마워요.</p>
      {error != null && (
        <div style={{ marginBottom: 14 }}>
          <ErrorText error={error} />
          <button
            type="button"
            className="btn small secondary"
            onClick={() => {
              retrying.current = true;
              reload();
            }}
          >
            다시 불러오기
          </button>
        </div>
      )}
      {data && data.length === 0 && (
        <EmptyState
          mascot="dome"
          title="아이를 등록해 주세요"
          action={
            <Link to="/p/children/new" className="btn block">
              아이 등록하기
            </Link>
          }
        >
          별칭과 태어난 해·달만 있으면 시작할 수 있어요. 실명은 받지 않아요.
        </EmptyState>
      )}
      {data && data.length > 1 && (
        <>
          {/* 아이마다 테두리 카드 한 줄(시안). 얼굴 그림 대신 별칭 첫 글자를 쓴다: 캐릭터·그림은 아이를 나타내지 않는다. */}
          <ul className="kid-list" aria-label="우리 아이">
            {data.map((c) => {
              const line = lines[c.id];
              return (
                <li key={c.id}>
                  <Link to={`/p/children/${c.id}`} className="kid-row">
                    <span className="avatar" aria-hidden="true">
                      {c.nickname.slice(0, 1)}
                    </span>
                    <span className="item-body">
                      <strong>{c.nickname}</strong>
                      {/* 줄이 넘치면 기록 상태가 통째로 다음 줄로 가도록 두 조각으로 나눈다. */}
                      <span className="meta">
                        <span style={{ display: 'inline-block', marginRight: 4 }}>
                          {formatAge(c.ageMonths)}
                          {line ? ' ·' : ''}
                        </span>
                        {line && <span style={{ display: 'inline-block' }}>{line}</span>}
                      </span>
                    </span>
                    <ChevronIcon size={20} />
                  </Link>
                </li>
              );
            })}
          </ul>
          {data.length < MAX_CHILDREN ? (
            <Link to="/p/children/new" className="btn ghost">
              + 아이 추가
            </Link>
          ) : (
            <p className="muted" style={{ margin: '8px 0 0' }}>
              아이는 {MAX_CHILDREN}명까지 등록할 수 있어요.
            </p>
          )}
        </>
      )}
    </div>
  );
}
