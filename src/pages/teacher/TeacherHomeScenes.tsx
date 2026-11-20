import { Link, useParams } from 'react-router-dom';
import { ApiError } from '../../api/client';
import type { HomeScene } from '../../api/types';
import HomeSceneCard from '../../ai/HomeSceneCard';
import SubHead from '../../components/SubHead';
import { usePagedList } from '../../components/paging';
import { MoreButton, loadStateView } from '../../components/ui';
import './teacher.css';

const PAGE = 10;

/**
 * 선생님 홈 → 가정에서 본 장면 (/t/children/:id/home-scenes).
 * 보호자가 공유한 영상에서 AI가 본 모습을 줄여(날짜·태그·아이 한 줄·보호자 한 줄) 보여 준다. 원본 요약, 시각별 메모,
 * 정확한 시각, 사람 수는 서버가 보내지 않는다. 보호자가 'AI 관찰 기록' 공유를 꺼 두면 서버가 404로 답한다.
 * 검토 전 장면은 검토함의 '참고할 대처'(근거 자료에서 고른 대처)로 이어 준다.
 */
export default function TeacherHomeScenes() {
  const childId = Number(useParams().childId);
  const list = usePagedList<HomeScene>(`/children/${childId}/home-scenes`, PAGE, [childId]);
  const notShared = !list.items && list.error instanceof ApiError && list.error.status === 404;
  const body = notShared ? (
    <p className="muted th-empty" data-demo="th-scenes-off">
      보호자가 'AI 관찰 기록' 공유를 켜면 가정에서 본 장면을 볼 수 있어요.
    </p>
  ) : (
    loadStateView(list, '가정 장면을') ??
    (list.items && list.items.length === 0 ? (
      <p className="muted th-empty">아직 공유된 가정 장면이 없어요.</p>
    ) : (
      <div className="card">
        {list.items?.map((s) => (
          <HomeSceneCard key={s.id} scene={s}>
            {s.reviewStatus === 'PENDING' && (
              <div className="home-scene-actions">
                <Link className="btn small secondary" to={`/t/children/${childId}/ai-reviews/${s.id}`}>
                  참고할 대처 보기
                </Link>
              </div>
            )}
          </HomeSceneCard>
        ))}
      </div>
    ))
  );
  return (
    <div className="th-scenes-page" data-demo="th-home-scenes">
      <SubHead title="가정에서 본 장면" icon="close" fallback="/t" />
      <p className="muted" style={{ marginTop: 0 }}>
        보호자가 공유한 영상에서 AI가 본 모습을 줄여서 전해요. 판단은 선생님이 해 주세요.
      </p>
      {body}
      {!notShared && <MoreButton list={list} label="지난 장면 더 보기" />}
    </div>
  );
}
