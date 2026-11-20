import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import EmptyState from '../../components/EmptyState';
import SubHead from '../../components/SubHead';
import { ErrorText, Loading } from '../../components/ui';
import {
  CATEGORY_LABEL,
  FACILITY_CATEGORIES,
  SIDO,
  displayAddress,
  operatorLabel,
  fetchFacilities,
  formatSourceDate,
  readSido,
  safeHomepage,
  saveSido,
  telHref,
  type Facility,
  type FacilityCategory,
  type FacilityPage,
} from './facilityData';
import './facilities.css';

/**
 * /support/facilities — 지역 기관 찾기. 로그인 없이도 볼 수 있다.
 * 특수학교·특수교육지원센터·육아종합지원센터·정신건강복지센터·장애인복지관을 지역·유형·이름으로 찾는다.
 * 공공데이터를 모아 보여 줄 뿐 추천·인증·순위가 아니며, 아이 기록은 어디에도 보내지 않는다.
 */
export default function Facilities() {
  const [sido, setSido] = useState(readSido);
  const [category, setCategory] = useState<FacilityCategory | null>(null);
  const [typed, setTyped] = useState('');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Facility[] | null>(null);
  const [meta, setMeta] = useState<Pick<FacilityPage, 'total' | 'page' | 'counts'> | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [moreError, setMoreError] = useState<unknown>(null);
  const [retry, setRetry] = useState(0);
  const req = useRef(0);
  const sidoId = useId();
  const searchId = useId();

  // 고른 조건이 바뀌면 처음 쪽부터 다시 불러온다. 늦게 온 옛 응답은 버린다.
  useEffect(() => {
    const mine = ++req.current;
    setLoading(true);
    setError(null);
    setMoreError(null);
    fetchFacilities({ sido, category, q, page: 0 })
      .then((res) => {
        if (mine !== req.current) return;
        setItems(res.items ?? []);
        setMeta({ total: res.total ?? 0, page: res.page ?? 0, counts: res.counts });
      })
      .catch((e: unknown) => {
        if (mine !== req.current) return;
        setItems(null);
        setMeta(null);
        setError(e);
      })
      .finally(() => {
        if (mine === req.current) setLoading(false);
      });
  }, [sido, category, q, retry]);

  async function loadMore() {
    if (!meta || more) return;
    const mine = req.current;
    setMore(true);
    setMoreError(null);
    try {
      const res = await fetchFacilities({ sido, category, q, page: meta.page + 1 });
      if (mine !== req.current) return;
      setItems((cur) => [...(cur ?? []), ...(res.items ?? [])]);
      setMeta({ total: res.total ?? meta.total, page: res.page ?? meta.page + 1, counts: res.counts ?? meta.counts });
    } catch (e) {
      if (mine === req.current) setMoreError(e);
    } finally {
      setMore(false);
    }
  }

  function changeSido(v: string) {
    setSido(v);
    saveSido(v);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setQ(typed.trim());
  }

  const counts = meta?.counts ?? {};
  const allCount = FACILITY_CATEGORIES.reduce((n, c) => n + (counts[c] ?? 0), 0);
  const hasMore = items !== null && meta !== null && items.length < meta.total;
  const where = sido || '전국';

  return (
    <div className="facilities">
      <SubHead title="지역 기관 찾기" fallback="/support" />
      <h2 className="support-title">가까운 기관을 찾아봐요</h2>
      <p className="support-lead">
        특수학교, 특수교육지원센터, 육아종합지원센터, 정신건강복지센터, 장애인복지관을 지역과 이름으로 찾을 수 있어요.
      </p>

      <div className="fac-notice" role="note" data-demo="facilities-notice">
        <p>
          <strong>시나브로가 추천하거나 인증한 곳이 아니에요.</strong> 공공데이터에 공개된 기관 정보를 모아 보여 드려요.
        </p>
        <p>
          이 목록을 보거나 전화해도 아이 기록은 어디에도 가지 않아요. 선생님과 기록을 나누는 것은 초대 코드로 따로 해요.
        </p>
        <p>이용할 수 있는지, 입학·이용 절차와 운영 시간은 기관에 직접 확인해 주세요.</p>
      </div>

      <div className="fac-filters">
        <div className="fac-field">
          <label htmlFor={sidoId}>지역</label>
          <select id={sidoId} value={sido} onChange={(e) => changeSido(e.target.value)} data-demo="facilities-sido">
            <option value="">전국</option>
            {SIDO.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <form className="fac-search" role="search" onSubmit={submit}>
          <label htmlFor={searchId} className="sr-only">
            기관 이름이나 동네로 찾기
          </label>
          <input
            id={searchId}
            type="search"
            enterKeyHint="search"
            placeholder="기관 이름이나 동네"
            value={typed}
            maxLength={50}
            onChange={(e) => {
              setTyped(e.target.value);
              if (!e.target.value) setQ('');
            }}
            data-demo="facilities-search"
          />
          <button type="submit" className="btn small" data-demo="facilities-search-submit">
            찾기
          </button>
        </form>
      </div>

      <div className="fac-chips" role="group" aria-label="기관 유형">
        <button type="button" className="fac-chip" aria-pressed={category === null} onClick={() => setCategory(null)} data-demo="facilities-cat-all">
          전체{meta ? <span className="fac-chip-n">{allCount || meta.total}</span> : null}
        </button>
        {FACILITY_CATEGORIES.map((c) => {
          // 아직 자료가 없는 유형(0곳)은 흐리게 두고 누를 수 없게 한다. 다만 이미 고른 유형이 0이 되면(지역을 바꿔서)
          // 고른 채로 두어 빈 상태를 그대로 보이고, 다시 누르면 고르기를 풀 수 있다.
          const empty = meta !== null && (counts[c] ?? 0) === 0;
          const blocked = empty && category !== c;
          return (
            <button
              key={c}
              type="button"
              className={empty ? 'fac-chip is-empty' : 'fac-chip'}
              aria-pressed={category === c}
              aria-disabled={blocked || undefined}
              title={blocked ? '아직 자료를 모으는 중이에요' : undefined}
              onClick={() => {
                if (blocked) return;
                setCategory((cur) => (cur === c ? null : c));
              }}
              data-demo={`facilities-cat-${c}`}
            >
              {CATEGORY_LABEL[c]}
              {meta ? <span className="fac-chip-n">{counts[c] ?? 0}</span> : null}
            </button>
          );
        })}
      </div>
      {meta !== null && FACILITY_CATEGORIES.some((c) => (counts[c] ?? 0) === 0) && (
        <p className="fac-collecting muted" data-demo="facilities-collecting">
          아직 자료를 모으는 중인 유형이 있어요.
        </p>
      )}

      <p className="fac-count muted" aria-live="polite">
        {loading
          ? '찾는 중이에요…'
          : items
            ? `${where}${category ? ` · ${CATEGORY_LABEL[category]}` : ''}${q ? ` · '${q}'` : ''} ${meta?.total ?? items.length}곳`
            : ''}
      </p>

      {loading && items === null ? (
        <Loading />
      ) : error != null ? (
        <EmptyState mascot="dome" mascotSize={120} title="목록을 불러오지 못했어요" action={
          <button type="button" className="btn block" onClick={() => setRetry((n) => n + 1)} data-demo="facilities-retry">
            다시 불러오기
          </button>
        }>
          <ErrorText error={error} />
          <p>잠시 뒤에 다시 시도해 주세요. 급한 도움은 <Link to="/support">상담 · 기관 안내</Link>의 전화번호로 연락할 수 있어요.</p>
        </EmptyState>
      ) : items && items.length === 0 ? (
        <EmptyState mascot="dome" mascotSize={120} title="조건에 맞는 기관이 없어요">
          <p>다른 지역이나 유형을 고르거나, 검색어를 바꿔 보세요.</p>
        </EmptyState>
      ) : items ? (
        <>
          <ul className={`fac-list stagger${loading ? ' is-loading' : ''}`} aria-busy={loading} data-demo="facilities-list">
            {items.map((f) => (
              <li key={f.id}>
                <FacilityCard facility={f} />
              </li>
            ))}
          </ul>
          {moreError != null && <ErrorText error={moreError} />}
          {hasMore && (
            <button type="button" className="btn block secondary" onClick={() => void loadMore()} aria-disabled={more || undefined} data-demo="facilities-more">
              {more ? '불러오는 중…' : `더 보기 (${items.length}/${meta?.total ?? 0})`}
            </button>
          )}
        </>
      ) : null}

      <p className="muted fac-foot">
        기관 정보는 공공데이터를 바탕으로 하며, 바뀐 내용이 늦게 반영될 수 있어요. 목록에 있다고 해서 기관을 인증하거나 기록을 나눈다는 뜻이
        아니에요.
      </p>
    </div>
  );
}

/** 기관 하나. 순위·평점·후기 없이 공개된 정보만 보여 준다. */
export function FacilityCard({ facility: f }: { facility: Facility }) {
  const tel = telHref(f.phone);
  const home = safeHomepage(f.homepage);
  const date = formatSourceDate(f.source?.date);
  const titleId = useId();
  const operator = operatorLabel(f.operator);
  const tags = (f.tags ?? []).filter((t) => typeof t === 'string' && t.trim()).slice(0, 6);
  return (
    <article className="fac-card" aria-labelledby={titleId} data-demo="facilities-item">
      <div className="fac-card-head">
        <span className="chip brand">{CATEGORY_LABEL[f.category] ?? '기관'}</span>
        {f.status === 'CONFIRMED' ? (
          <span className="fac-badge confirmed" title="기관이 직접 확인한 정보예요">
            확인됨
          </span>
        ) : (
          <span className="fac-badge" title="공공데이터에 공개된 정보예요">
            공공데이터{date ? ` · 기준일 ${date}` : ''}
          </span>
        )}
      </div>
      <h3 id={titleId} className="fac-name">
        {f.name}
      </h3>
      <p className="fac-addr">{displayAddress(f)}</p>
      {(operator || tags.length > 0) && (
        <ul className="fac-tags" aria-label="기관 정보">
          {operator && <li>{operator}</li>}
          {tags.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
      {(tel || home) && (
        <div className="fac-actions">
          {tel && (
            <a className="btn small tonal" href={tel} aria-label={`${f.name}에 전화 걸기, ${f.phone}`} data-demo="facilities-call">
              전화 {f.phone}
            </a>
          )}
          {home && (
            <a
              className="btn small secondary"
              href={home}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${f.name} 누리집 열기(새 창)`}
              data-demo="facilities-homepage"
            >
              누리집
            </a>
          )}
        </div>
      )}
      {f.source?.name && <p className="fac-source">출처: {f.source.name}</p>}
    </article>
  );
}
