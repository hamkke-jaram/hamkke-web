import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';

/*
 * 목록 '더 보기'(hamkke-api/docs/api.md의 목록 커서). limit(1~50)과 beforeId를 붙이면
 * 그 항목보다 오래된 항목을 같은 순서로 준다. 응답 모양(배열)은 그대로다.
 */

/** 서버가 받는 한 번에 가져올 최대 개수. */
export const MAX_PAGE = 50;

/** '/children/1/card-deliveries' + limit·beforeId → 쿼리를 붙인 주소. 이미 쿼리가 있으면 &로 잇는다. */
export function pagePath(path: string, limit: number, beforeId?: number | null): string {
  const size = Math.max(1, Math.min(MAX_PAGE, Math.floor(limit)));
  const q = `limit=${size}${beforeId != null ? `&beforeId=${beforeId}` : ''}`;
  return `${path}${path.includes('?') ? '&' : '?'}${q}`;
}

/**
 * 이미 있는 목록 뒤에 새로 받은 쪽을 잇는다. 같은 id는 한 번만 둔다(서버가 beforeId를 모르는 예전 판이면
 * 같은 항목이 다시 올 수 있다). 새 항목이 하나도 없거나 쪽이 덜 찼으면 더 볼 것이 없다.
 */
export function mergePage<T extends { id: number }>(
  current: T[],
  page: T[],
  limit: number,
): { items: T[]; hasMore: boolean } {
  const seen = new Set(current.map((x) => x.id));
  const fresh = page.filter((x) => !seen.has(x.id));
  return { items: [...current, ...fresh], hasMore: fresh.length > 0 && page.length >= limit };
}

export interface PagedList<T> {
  /** 처음 쪽을 아직 못 받았으면 null */
  items: T[] | null;
  loading: boolean;
  error: unknown;
  /** 다음 쪽이 있을 수 있는지(마지막으로 받은 쪽이 꽉 찼는지) */
  hasMore: boolean;
  loadingMore: boolean;
  moreError: unknown;
  loadMore: () => void;
  /** 처음 쪽부터 다시 불러온다. */
  reload: () => void;
  setItems: (fn: (cur: T[] | null) => T[] | null) => void;
}

/**
 * 최신순 목록을 pageSize개씩 불러온다. path에는 limit·beforeId를 빼고 넘긴다.
 * 처음 쪽은 deps가 바뀔 때마다 새로 받고, '더 보기'는 마지막 항목의 id를 beforeId로 보낸다.
 */
export function usePagedList<T extends { id: number }>(
  path: string | null,
  pageSize: number,
  deps: unknown[],
): PagedList<T> {
  const [items, setItemsState] = useState<T[] | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [error, setError] = useState<unknown>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<unknown>(null);
  const [tick, setTick] = useState(0);
  // 다른 아이로 옮기거나 다시 불러오면, 늦게 도착한 앞선 응답은 버린다.
  const run = useRef(0);
  const itemsRef = useRef<T[] | null>(null);
  itemsRef.current = items;
  const moreBusy = useRef(false);

  useEffect(() => {
    const mine = ++run.current;
    moreBusy.current = false;
    setLoadingMore(false);
    setMoreError(null);
    if (path === null) {
      setItemsState([]);
      setHasMore(false);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    api<T[]>('GET', pagePath(path, pageSize))
      .then((page) => {
        if (mine !== run.current) return;
        const list = Array.isArray(page) ? page : [];
        setItemsState(list);
        setHasMore(list.length >= pageSize);
        setError(null);
      })
      .catch((e) => {
        if (mine === run.current) setError(e);
      })
      .finally(() => {
        if (mine === run.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, pageSize, tick, ...deps]);

  const loadMore = useCallback(() => {
    const cur = itemsRef.current;
    if (path === null || !cur || cur.length === 0 || moreBusy.current) return;
    moreBusy.current = true;
    const mine = run.current;
    setLoadingMore(true);
    setMoreError(null);
    api<T[]>('GET', pagePath(path, pageSize, cur[cur.length - 1].id))
      .then((page) => {
        if (mine !== run.current) return;
        const merged = mergePage(itemsRef.current ?? [], Array.isArray(page) ? page : [], pageSize);
        setItemsState(merged.items);
        setHasMore(merged.hasMore);
      })
      .catch((e) => {
        if (mine === run.current) setMoreError(e);
      })
      .finally(() => {
        if (mine !== run.current) return;
        moreBusy.current = false;
        setLoadingMore(false);
      });
  }, [path, pageSize]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const setItems = useCallback((fn: (cur: T[] | null) => T[] | null) => setItemsState((cur) => fn(cur)), []);

  return { items, loading, error, hasMore, loadingMore, moreError, loadMore, reload, setItems };
}
