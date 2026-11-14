import { describe, expect, it } from 'vitest';
import { MAX_PAGE, mergePage, pagePath } from './paging';

describe('pagePath', () => {
  it('limit과 beforeId를 붙인다', () => {
    expect(pagePath('/children/1/card-deliveries', 10)).toBe('/children/1/card-deliveries?limit=10');
    expect(pagePath('/children/1/card-deliveries', 10, 42)).toBe('/children/1/card-deliveries?limit=10&beforeId=42');
  });

  it('이미 쿼리가 있으면 &로 잇는다', () => {
    expect(pagePath('/x?weeks=8', 5, 3)).toBe('/x?weeks=8&limit=5&beforeId=3');
  });

  it('limit은 1~50으로 맞춘다', () => {
    expect(pagePath('/x', 0)).toBe('/x?limit=1');
    expect(pagePath('/x', 500)).toBe(`/x?limit=${MAX_PAGE}`);
  });
});

describe('mergePage', () => {
  const ids = (xs: { id: number }[]) => xs.map((x) => x.id);

  it('뒤에 잇고, 쪽이 꽉 찼으면 더 있을 수 있다', () => {
    const r = mergePage([{ id: 9 }, { id: 8 }], [{ id: 7 }, { id: 6 }], 2);
    expect(ids(r.items)).toEqual([9, 8, 7, 6]);
    expect(r.hasMore).toBe(true);
  });

  it('쪽이 덜 찼으면 끝이다', () => {
    const r = mergePage([{ id: 9 }], [{ id: 5 }], 2);
    expect(ids(r.items)).toEqual([9, 5]);
    expect(r.hasMore).toBe(false);
  });

  it('beforeId를 모르는 서버가 같은 항목을 다시 주면 겹치지 않게 하고 멈춘다', () => {
    const r = mergePage([{ id: 9 }, { id: 8 }], [{ id: 9 }, { id: 8 }], 2);
    expect(ids(r.items)).toEqual([9, 8]);
    expect(r.hasMore).toBe(false);
  });
});
