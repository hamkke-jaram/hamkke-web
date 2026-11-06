import { api } from '../api/client';
import type { SupportResource } from '../api/types';
import { ErrorText, Loading, SupportList, useLoad } from '../components/ui';

/** 상담·기관 연결 안내. 로그인 없이도 언제나 볼 수 있다. */
export default function Support() {
  const { data, error, loading } = useLoad(() => api<SupportResource[]>('GET', '/support-resources'), []);
  return (
    <div>
      <h1>도움받을 수 있는 곳</h1>
      <p className="lead">
        아이를 돌보는 일은 혼자 감당하기 버거울 때가 있어요. 지치거나 마음이 쓰일 때 편하게 연락해 보세요.
        함께자람은 상담을 대신하지 않고, 도움받을 수 있는 곳을 안내해 드려요.
      </p>
      <section className="card">
        {loading && <Loading />}
        <ErrorText error={error} />
        {data && <SupportList resources={data} />}
      </section>
      <p className="muted">전화번호와 운영 시간은 기관 사정에 따라 바뀔 수 있어요.</p>
    </div>
  );
}
