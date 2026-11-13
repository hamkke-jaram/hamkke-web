import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
