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

/**
 * 같은 아이에게 같은 영상 파일을 다시 고르면 같은 값이 나오는 clientRecordId를 만든다.
 *
 * 분석할 때마다 새 UUID를 쓰면, 앨범에서 같은 영상을 다시 골랐을 때 기록이 두 번 저장되어 주간 요약과
 * 변화 추이의 비교 기준이 틀어진다. 서버는 같은 clientRecordId를 기존 기록(200)으로 돌려주므로, 파일이 같으면
 * 같은 id를 보내기만 하면 된다. 파일 내용 대신 이름·크기·수정 시각을 쓰는 이유는 큰 영상을 다시 읽지 않기 위해서다.
 *
 * 보안 연결이 아닌 http 주소(LAN)에는 crypto.subtle이 없어서, 어디서나 도는 128비트 해시(cyrb128)를 쓴다.
 * 비밀이 아니라 같은 파일을 알아보려는 값이므로 암호학적 해시가 아니어도 된다.
 */
export function recordIdForFile(childId: number, file: Pick<File, 'name' | 'size' | 'lastModified'>): string {
  const key = `hamkke-record\u0000${childId}\u0000${file.name}\u0000${file.size}\u0000${file.lastModified}`;
  const h = cyrb128(key);
  const b = new Uint8Array(16);
  h.forEach((v, i) => {
    b[i * 4] = v >>> 24;
    b[i * 4 + 1] = (v >>> 16) & 0xff;
    b[i * 4 + 2] = (v >>> 8) & 0xff;
    b[i * 4 + 3] = v & 0xff;
  });
  b[6] = (b[6] & 0x0f) | 0x80; // 버전 8(RFC 9562: 직접 정한 방식)
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 변형
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}
