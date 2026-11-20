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
        void QRCode.toString(url, { type: 'terminal', small: true }).then((qr) => {
          server.config.logger.info(`\n  휴대폰으로 열기 (같은 와이파이): ${url}\n${qr}`);
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
      '/api': 'http://localhost:8080',
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
