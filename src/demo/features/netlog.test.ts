import { beforeEach, describe, expect, it } from 'vitest';
import {
  MASK,
  begin,
  clearEntries,
  finish,
  getEntries,
  isSecretKey,
  maskForDisplay,
  matches,
  photoLabel,
  requestLine,
  since,
  uploadCounts,
} from './netlog';

/* '서버로 간 내용'에 보일 사본: 비밀번호·토큰·영수증은 가리고, 사진·파일은 이름표로 바꾼다. */

describe('민감한 값 가리기', () => {
  it('비밀번호·토큰·영수증 키는 깊이와 대소문자에 상관없이 가린다', () => {
    const { value } = maskForDisplay({
      email: 'demo@demo.hamkke.test',
      password: 'Secret123',
      nested: { currentPassword: 'a1b2c3d4', newPassword: 'z9y8x7w6', RefreshToken: 'r', accessToken: 'a' },
      list: [{ receipt: 'rcpt' }, { token: 't' }],
    });
    expect(value).toEqual({
      email: 'demo@demo.hamkke.test',
      password: MASK,
      nested: { currentPassword: MASK, newPassword: MASK, RefreshToken: MASK, accessToken: MASK },
      list: [{ receipt: MASK }, { token: MASK }],
    });
    expect(JSON.stringify(value)).not.toMatch(/Secret123|a1b2c3d4|z9y8x7w6|rcpt/);
  });

  it('원본은 바꾸지 않는다', () => {
    const body = { password: 'Secret123', user: { id: 1 } };
    maskForDisplay(body);
    expect(body.password).toBe('Secret123');
  });

  it('비어 있는 비밀 값은 그대로 둔다(가릴 것이 없다)', () => {
    expect(maskForDisplay({ password: '', token: null }).value).toEqual({ password: '', token: null });
  });

  it('jpeg 문자열은 장면 사진 이름표로 바꾸고 장수를 센다', () => {
    const jpeg = 'A'.repeat(4096);
    const m = maskForDisplay({ frames: [{ t: 0, jpeg }, { t: 1.5, jpeg }] });
    expect(m.photos).toBe(2);
    expect(m.files).toBe(0);
    expect(m.value).toEqual({ frames: [{ t: 0, jpeg: photoLabel(jpeg) }, { t: 1.5, jpeg: photoLabel(jpeg) }] });
    expect(photoLabel(jpeg)).toBe('[장면 사진 1장 · 약 3KB]');
  });

  it('파일·Blob은 [파일]로 바꾸고 따로 센다', () => {
    const m = maskForDisplay({ video: new Blob(['x']), nested: [new Blob(['y'])] });
    expect(m.files).toBe(2);
    expect(m.value).toEqual({ video: '[파일]', nested: ['[파일]'] });
  });

  it('긴 배열은 앞의 5개만 보이되, 뒤쪽 항목의 사진도 센다', () => {
    const items = Array.from({ length: 8 }, (_, i) => ({ t: i, jpeg: 'QUJD' }));
    const m = maskForDisplay(items);
    expect((m.value as unknown[]).length).toBe(6);
    expect((m.value as unknown[])[5]).toBe('… 외 3개');
    expect(m.photos).toBe(8);
  });

  it('숫자 기록 본문은 그대로 보인다(가릴 것이 없다)', () => {
    const body = { analyzedSeconds: 30, jointPlaySeconds: 0, responseLatencySec: null, modelVersion: 'v1' };
    expect(maskForDisplay(body)).toEqual({ value: body, files: 0, photos: 0 });
  });

  it('가리는 키 목록', () => {
    for (const k of ['password', 'PASSWORD', 'refreshToken', 'accessToken', 'receipt', 'authorization']) {
      expect(isSecretKey(k)).toBe(true);
    }
    for (const k of ['email', 'displayName', 'code', 'content']) expect(isSecretKey(k)).toBe(false);
  });
});

describe('요청 기록', () => {
  beforeEach(() => clearEntries());

  it('남길 때부터 가린 본문으로 담고, 응답도 가린다', () => {
    const id = begin('prep', 'post', '/auth/login', { email: 'a@demo.hamkke.test', password: 'pw12345678' });
    finish(id, 200, { accessToken: 'aaa', refreshToken: 'rrr', user: { id: 3 } });
    const [e] = getEntries();
    expect(e.method).toBe('POST');
    expect(e.body).toEqual({ email: 'a@demo.hamkke.test', password: MASK });
    expect(e.response).toEqual({ accessToken: MASK, refreshToken: MASK, user: { id: 3 } });
    expect(requestLine(e)).toBe('POST /auth/login 200');
  });

  it('since는 그 뒤에 생긴 요청만 준다', () => {
    const a = begin('app', 'GET', '/me');
    const b = begin('app', 'GET', '/children');
    expect(since(a).map((e) => e.id)).toEqual([b]);
  });

  it('경로 규칙은 쿼리를 빼고 맞춘다', () => {
    expect(matches({ method: 'GET', path: '/teacher/children/3/shared-summary?weeks=8' }, 'get', /shared-summary$/)).toBe(true);
    expect(matches({ method: 'POST', path: '/children' }, 'GET', /\/children$/)).toBe(false);
  });

  it('파일·사진 수는 샘플 받기를 빼고 센다', () => {
    begin('app', 'POST', '/children/1/interaction-records', { analyzedSeconds: 30 });
    begin('sample', 'GET', '/demo/sample-30s.mp4', { file: new Blob(['v']) });
    expect(uploadCounts()).toEqual({ files: 0, photos: 0 });
    const off = begin('app', 'GET', '/support-resources');
    finish(off, 'offline', undefined, 'offline');
    expect(requestLine(getEntries().find((e) => e.id === off)!)).toBe('GET /support-resources 연결 실패');
  });
});
