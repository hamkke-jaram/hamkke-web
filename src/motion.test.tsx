import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MotionSwitch, readMotionPref, resolveMotion, saveMotionPref } from './motion';

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('화면 설정: 움직이는 캐릭터(motion)', () => {
  it('고르지 않으면 기기의 동작 줄이기 설정을 따른다', () => {
    expect(resolveMotion('system', false)).toBe(true);
    expect(resolveMotion('system', true)).toBe(false);
  });

  it('직접 고른 값이 기기 설정보다 먼저다', () => {
    expect(resolveMotion('on', true)).toBe(true);
    expect(resolveMotion('off', false)).toBe(false);
  });

  it('이 기기에만 저장하고, 기기 설정으로 되돌리면 지운다', () => {
    const store = fakeStorage();
    const attrs = new Map<string, string>();
    vi.stubGlobal('localStorage', store);
    vi.stubGlobal('document', { documentElement: { setAttribute: (k: string, v: string) => attrs.set(k, v) } });
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });

    saveMotionPref('off');
    expect(store.data.get('hj.motion')).toBe('off');
    expect(readMotionPref()).toBe('off');
    expect(attrs.get('data-motion')).toBe('off');

    saveMotionPref('system');
    expect(store.data.has('hj.motion')).toBe(false);
    expect(readMotionPref()).toBe('system');
    expect(attrs.get('data-motion')).toBe('on');
  });

  it('저장된 값이 이상하거나 저장소를 못 쓰면 기기 설정을 따른다', () => {
    vi.stubGlobal('localStorage', fakeStorage({ 'hj.motion': 'wiggle' }));
    expect(readMotionPref()).toBe('system');
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
    });
    expect(readMotionPref()).toBe('system');
  });

  it('화면 설정의 스위치는 이름·설명이 이어진 switch다', () => {
    const html = renderToStaticMarkup(<MotionSwitch />);
    expect(html).toContain('<strong>움직이는 캐릭터</strong>');
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-describedby="motion-hint"');
    expect(html).toContain('id="motion-hint"');
    expect(html).toContain('data-demo="theme-switch-motion"');
  });
});
