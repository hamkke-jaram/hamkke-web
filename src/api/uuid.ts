/**
 * 요청을 구분하는 UUID(v4)를 만든다(예: 기록 저장의 clientRecordId).
 *
 * `crypto.randomUUID()`는 보안 연결(HTTPS·localhost)에서만 있다. 휴대폰에서 `http://192.168.x.x:5173`
 * 같은 주소로 열면 없으므로, 그때는 어디서나 쓸 수 있는 `crypto.getRandomValues()`로 같은 모양을 만든다.
 */
export function newUuid(): string {
  const c: Crypto | undefined = typeof crypto === 'undefined' ? undefined : crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();

  const b = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(b);
  } else {
    // 아주 오래된 환경. 이 값은 비밀이 아니라 같은 요청을 두 번 저장하지 않으려는 구분용이라 이 정도로 충분하다.
    for (let i = 0; i < b.length; i++) b[i] = Math.floor(Math.random() * 256);
  }
  b[6] = (b[6] & 0x0f) | 0x40; // 버전 4
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 변형
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
