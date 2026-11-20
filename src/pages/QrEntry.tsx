import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import Mascot from '../components/Mascot';
import { useToast } from '../components/feedback';
import { Loading } from '../components/ui';

/*
 * /qr — 예시 기록이 들어 있는 체험 화면을 휴대폰으로 연다.
 * 들어올 주소:
 * - VITE_PUBLIC_URL을 정해 빌드했으면 그 주소(배포)
 * - 개발 서버를 이 컴퓨터(localhost)에서 보고 있으면 개발 서버가 알려 주는 와이파이 주소(npm run dev:lan일 때만)
 * - 그 밖에는 지금 연 주소
 */

const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/;

export function entryUrlFrom(origin: string, publicUrl?: string): string {
  const base = (publicUrl?.trim() || origin).replace(/\/+$/, '');
  return base + '/try';
}

type Target = { url: string; viaLan: boolean } | { url: null; reason: 'local-only' };

async function findTarget(): Promise<Target> {
  const publicUrl = import.meta.env.VITE_PUBLIC_URL as string | undefined;
  if (publicUrl) return { url: entryUrlFrom(publicUrl), viaLan: false };
  if (!LOCAL.test(location.hostname)) return { url: entryUrlFrom(location.origin), viaLan: false };
  if (import.meta.env.DEV) {
    try {
      const r = await fetch('/__lan', { cache: 'no-store' });
      const { url } = (await r.json()) as { url: string | null };
      if (url) return { url: entryUrlFrom(url), viaLan: true };
    } catch {
      /* 아래 안내로 */
    }
  }
  return { url: null, reason: 'local-only' };
}

export default function QrEntry() {
  const toast = useToast();
  const [target, setTarget] = useState<Target | null>(null);
  const [img, setImg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void findTarget().then(async (t) => {
      if (!alive) return;
      setTarget(t);
      if (t.url) {
        // 어두운 화면에서도 읽히도록 늘 흰 바탕에 진한 무늬로 그린다.
        const data = await QRCode.toDataURL(t.url, { width: 560, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#2b1d14', light: '#ffffff' } });
        if (alive) setImg(data);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast('주소를 복사했어요.');
    } catch {
      toast('복사하지 못했어요. 주소를 길게 눌러 복사해 주세요.');
    }
  }

  return (
    <div className="qr-entry">
      <div className="page-head">
        <div className="page-head-text">
          <h1>휴대폰으로 데모 열기</h1>
        </div>
        <Mascot name="friend" size={88} />
      </div>
      <p className="lead">휴대폰 카메라로 QR 코드를 찍고 보호자나 선생님으로 로그인해 보세요. 각자의 홈에서 콩이의 기록과 코칭, 대화를 체험할 수 있어요.</p>

      {!target ? (
        <Loading />
      ) : target.url === null ? (
        <section className="card">
          <h2>지금은 이 컴퓨터에서만 열려 있어요</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            휴대폰에서 열려면 개발 서버를 와이파이에 열어 두고 다시 띄워 주세요. 터미널에 QR 코드도 함께 나와요.
          </p>
          <pre className="qr-cmd">npm run dev:lan</pre>
          <p className="muted" style={{ marginBottom: 0 }}>
            배포한 주소가 있으면 <code>VITE_PUBLIC_URL</code>에 그 주소를 넣어 빌드하면 그 주소로 QR을 만들어요.
          </p>
        </section>
      ) : (
        <section className="card qr-card">
          {img ? (
            <img className="qr-img" src={img} width={280} height={280} alt={`앱 주소 QR 코드: ${target.url}`} />
          ) : (
            <Loading />
          )}
          <p className="qr-url">{target.url}</p>
          <div className="stack">
            <button type="button" className="btn block secondary" onClick={() => void copy(target.url)}>
              주소 복사하기
            </button>
            {img && (
              <a className="btn block ghost" href={img} download="sinabro-demo-qr.png">
                QR 그림 저장하기
              </a>
            )}
          </div>
          {target.viaLan && <p className="muted qr-note">휴대폰이 이 컴퓨터와 같은 와이파이에 연결되어 있어야 해요.</p>}
        </section>
      )}

      <Link to="/try" className="btn block ghost">
        이 기기에서 데모 열기
      </Link>
    </div>
  );
}
