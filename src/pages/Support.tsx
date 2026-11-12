import { api } from '../api/client';
import type { SupportResource } from '../api/types';
import { SupportList, useLoad } from '../components/ui';
import { FALLBACK_SUPPORT_RESOURCES, withPolice112 } from '../support/fallback';

/**
 * 상담·기관 연결 안내. 로그인 없이도 언제나 볼 수 있다.
 * 서버 목록을 불러오는 중이거나 불러오지 못해도(서버 점검, 오프라인) 앱에 내장된 목록을 바로 보여 준다.
 */
export default function Support() {
  const { data, error, loading } = useLoad(() => api<SupportResource[]>('GET', '/support-resources'), []);
  const fromServer = data && data.length > 0;
  const resources = withPolice112(fromServer ? data : FALLBACK_SUPPORT_RESOURCES);
  return (
    <div>
      <h1>도움받을 수 있는 곳</h1>
      <p className="lead">
        아이를 돌보는 일은 혼자 감당하기 버거울 때가 있어요. 지치거나 마음이 쓰일 때 편하게 연락해 보세요.
        함께자람은 상담을 대신하지 않고, 도움받을 수 있는 곳을 안내해 드려요.
      </p>
      <section className="card" aria-busy={loading}>
        <SupportList resources={resources} />
      </section>
      {!fromServer && !loading && error != null && (
        <p className="muted">지금은 최신 안내를 불러오지 못해 앱에 담긴 목록을 보여 드려요.</p>
      )}
      <p className="muted">전화번호와 운영 시간은 기관 사정에 따라 바뀔 수 있어요.</p>
    </div>
  );
}
