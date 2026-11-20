import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { createTeacherReviewObserver } from './observe.mjs';
import { installTeacherReviewRecheck } from './recheck.mjs';

const server = await createServer({
  configFile: false,
  plugins: [react(), {
    name: 'hamkke-teacher-review-demo',
    configureServer(dev) {
      dev.middlewares.use(createTeacherReviewObserver());
      installTeacherReviewRecheck(dev.middlewares);
    },
  }],
  define: { 'import.meta.env.VITE_TEACHER_REVIEW_DEMO': 'true' },
  server: { host: '127.0.0.1', port: 5188, strictPort: true },
});
await server.listen();
process.stdout.write('교사 검토 시연  http://127.0.0.1:5188/demo/teacher-review\n');
