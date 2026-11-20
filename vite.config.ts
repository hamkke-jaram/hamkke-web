import { networkInterfaces } from 'node:os';
import type { AddressInfo } from 'node:net';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import QRCode from 'qrcode';

/** 같은 와이파이의 휴대폰이 닿을 수 있는 이 컴퓨터의 주소(IPv4, 사설망 우선). 없으면 null. */
function lanAddress(): string | null {
  const all = Object.values(networkInterfaces())
    .flat()
    .filter((i): i is NonNullable<typeof i> => !!i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
  const priv = all.find((a) => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a));
  return priv ?? all[0] ?? null;
}

/**
 * 개발 서버를 `npm run dev:lan`(vite --host)으로 띄우면 휴대폰으로 들어올 주소를 QR로 터미널에 찍고,
 * 앱의 /qr 화면이 같은 주소를 알 수 있게 /__lan 으로 알려 준다(개발 서버에서만).
 */
function phoneEntry(): Plugin {
  let url: string | null = null;
  return {
    name: 'hamkke-phone-entry',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__lan', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify({ url }));
      });
      server.httpServer?.once('listening', () => {
        const host = server.config.server.host;
        const ip = lanAddress();
        const addr = server.httpServer?.address() as AddressInfo | null;
        if (!host || !ip || !addr) return; // localhost에서만 열었으면 휴대폰이 닿지 못한다
        url = `http://${ip}:${addr.port}/`;
        // 터미널 QR은 데모 입구(/try)를 가리킨다. 실제 서비스 입구는 url 그대로('/', 가입·로그인).
        const demo = `${url}try`;
        void QRCode.toString(demo, { type: 'terminal', small: true }).then((qr) => {
          server.config.logger.info(`\n  휴대폰으로 데모 열기 (같은 와이파이): ${demo}\n  실제 서비스(가입·로그인): ${url}\n${qr}`);
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), phoneEntry()],
  server: {
    port: 5173,
    proxy: {
      // 개발 서버가 API로 넘길 때 브라우저의 Origin을 뺀다. API(local)는 http://localhost:5173만 허용하므로,
      // 그대로 넘기면 와이파이 주소(휴대폰·QR)나 127.0.0.1(보호자·선생님 함께 보기)에서 쓰는 요청(POST 등)이 403이 된다.
      // 개발 서버를 거치는 요청은 같은 컴퓨터의 API로만 가므로 Origin 검사가 필요 없다.
      '/api': {
        target: 'http://localhost:8080',
        configure: (proxy) => {
          proxy.on('proxyReq', (req) => req.removeHeader('origin'));
        },
      },
      // AI 관찰 기록: 장면 사진은 이 경로로만 AI 서버(hamkke-ai server)에 간다. 응답까지 1~3분 걸릴 수 있다.
      '/ai/': { target: 'http://localhost:8090', timeout: 200_000, proxyTimeout: 200_000 },
    },
  },
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2020',
    sourcemap: false,
  },
});
