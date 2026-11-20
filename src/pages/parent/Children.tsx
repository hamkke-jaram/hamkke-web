import { useId } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import type { Child } from '../../api/types';
import SubHead from '../../components/SubHead';
import { DangerAction, useToast } from '../../components/feedback';
import { Loading, loadStateView, useLoad } from '../../components/ui';
import './parent.css';

/*
 * /p/children — Figma 2판 '등록된 아이'. 아이마다 테두리 카드(첫 글자 동그라미 · 별칭 · 태어난 해·달 · 수정 | 삭제),
 * 맨 아래 '+ 아이 추가하기'. 설정의 '등록된 아이 n명'에서 온다. 삭제는 두 단계로 확인한다(되돌릴 수 없음).
 */

/** 서버 ChildService.MAX_CHILDREN_PER_PARENT와 같은 값. */
const MAX_CHILDREN = 5;

function birthLabel(ym: string) {
  const [y, m] = ym.split('-');
  return y && m ? `${y}년 ${Number(m)}월` : ym;
}

function KidCard({ child, onDeleted }: { child: Child; onDeleted: () => void }) {
  const nameId = useId();
  const toast = useToast();
  return (
    <li className="kid-card">
      <div className="kid-card-main">
        <span className="avatar" aria-hidden="true">
          {child.nickname.slice(0, 1)}
        </span>
        <Link to={`/p/children/${child.id}`} className="kid-card-text">
          <strong id={nameId}>{child.nickname}</strong>
          <span>{birthLabel(child.birthYearMonth)}</span>
        </Link>
        <div className="kid-card-actions">
          <Link to={`/p/children/${child.id}/edit`} className="kid-act" aria-describedby={nameId}>
            수정
          </Link>
          <span aria-hidden="true" className="kid-sep">
            |
          </span>
          <DangerAction
            label="삭제"
            triggerClassName="kid-act danger"
            describedBy={nameId}
            labelledBy={nameId}
            question="정말 삭제할까요?"
            detail={`${child.nickname}의 정보와 모든 기록, 공유 연결이 바로 지워지고 되돌릴 수 없어요.`}
            confirmLabel="삭제하기"
            busyLabel="지우는 중…"
            onConfirm={async () => {
              await api('DELETE', `/children/${child.id}`);
              toast(`${child.nickname} 정보를 모두 지웠어요.`);
              onDeleted();
            }}
          />
        </div>
      </div>
    </li>
  );
}

export default function Children() {
  const kids = useLoad(() => api<Child[]>('GET', '/children'), []);
  return (
    <div>
      <SubHead title="등록된 아이" fallback="/account" />
      {kids.loading && !kids.data ? (
        <Loading />
      ) : (
        loadStateView(kids, '아이 목록을') ?? (
          <>
            <ul className="kid-cards">
              {(kids.data ?? []).map((c) => (
                <KidCard key={c.id} child={c} onDeleted={kids.reload} />
              ))}
            </ul>
            {(kids.data?.length ?? 0) < MAX_CHILDREN ? (
              <Link to="/p/children/new" className="kid-add">
                <span aria-hidden="true">+</span> 아이 추가하기
              </Link>
            ) : (
              <p className="muted">아이는 {MAX_CHILDREN}명까지 등록할 수 있어요.</p>
            )}
          </>
        )
      )}
    </div>
  );
}
