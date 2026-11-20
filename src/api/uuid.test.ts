import { afterEach, describe, expect, it, vi } from 'vitest';
import { newUuid, recordIdForFile } from './uuid';

/** 가짜로 바꾸기 전의 진짜 crypto */
const realCrypto = globalThis.crypto;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('newUuid', () => {
  it('보안 연결에서는 crypto.randomUUID를 쓴다', () => {
    const randomUUID = vi.fn(() => '11111111-2222-4333-8444-555555555555');
    vi.stubGlobal('crypto', { randomUUID });
    expect(newUuid()).toBe('11111111-2222-4333-8444-555555555555');
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  it('http 주소(LAN)처럼 crypto.randomUUID가 없는 곳에서도 UUID v4를 만든다', () => {
    // 보안 연결이 아닌 페이지에는 crypto.getRandomValues만 있다.
    vi.stubGlobal('crypto', { getRandomValues: (a: Uint8Array) => realCrypto.getRandomValues(a) });
    const ids = Array.from({ length: 200 }, () => newUuid());
    for (const id of ids) expect(id).toMatch(UUID_V4);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('crypto가 아예 없어도 같은 모양으로 만든다', () => {
    vi.stubGlobal('crypto', undefined);
    const a = newUuid();
    const b = newUuid();
    expect(a).toMatch(UUID_V4);
    expect(b).toMatch(UUID_V4);
    expect(a).not.toBe(b);
  });
});

describe('recordIdForFile', () => {
  const UUID_V8 = /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const file = { name: 'IMG_0001.MOV', size: 12_345_678, lastModified: 1_763_300_000_000 };

  it('같은 아이·같은 파일이면 매번 같은 id를 만든다(다시 골라도 기록이 한 번만 저장된다)', () => {
    const a = recordIdForFile(14, file);
    expect(a).toMatch(UUID_V8);
    expect(recordIdForFile(14, { ...file })).toBe(a);
  });

  it('아이·이름·크기·수정 시각 중 하나라도 다르면 다른 id가 된다', () => {
    const a = recordIdForFile(14, file);
    const others = [
      recordIdForFile(15, file),
      recordIdForFile(14, { ...file, name: 'IMG_0002.MOV' }),
      recordIdForFile(14, { ...file, size: file.size + 1 }),
      recordIdForFile(14, { ...file, lastModified: file.lastModified + 1 }),
    ];
    expect(new Set([a, ...others]).size).toBe(5);
  });

  it('구분자가 있어 이름과 크기를 이어 붙인 값이 겹쳐도 섞이지 않는다', () => {
    expect(recordIdForFile(1, { name: 'a1', size: 23, lastModified: 0 })).not.toBe(
      recordIdForFile(1, { name: 'a', size: 123, lastModified: 0 }),
    );
  });

  it('crypto가 없어도 만든다(http 주소)', () => {
    vi.stubGlobal('crypto', undefined);
    expect(recordIdForFile(1, file)).toMatch(UUID_V8);
  });
});
