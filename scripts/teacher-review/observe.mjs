import { createLocalTeacherReviewRoute, DemoHttpError, importObservationModule } from './demoHttp.mjs';

const model = 'qwen3.5:4b';
let observationModules;

function loadObservationModules() {
  observationModules ??= Promise.all([
    importObservationModule('frames.ts'),
    importObservationModule('prompt.ts'),
    importObservationModule('visualReview.ts'),
    importObservationModule('ollama.ts'),
  ]).then(([frames, prompt, review, ollama]) => ({
    ...frames,
    ...prompt,
    ...review,
    provider: ollama.createOllamaProvider({
      baseUrl: 'http://127.0.0.1:11434',
      model,
      keepAlive: '5m',
      numCtx: 8192,
      maxOutputTokens: 480,
    }),
  }));
  return observationModules;
}

export function createTeacherReviewObserver() {
  return createLocalTeacherReviewRoute({
    path: '/__demo/teacher-review/analyze',
    maxBytes: 2 * 1024 * 1024,
    async run(body, signal) {
      const ai = await loadObservationModules();
      let input;
      try {
        input = ai.parseAnalyzeBody(body);
        if (input.durationSec === null || input.frames.some(({ t }, i) =>
          t > input.durationSec || (i > 0 && t === input.frames[i - 1].t))) {
          throw new DemoHttpError(400, '영상 길이와 장면 시각을 확인해 주세요.');
        }
      } catch (error) {
        if (error instanceof ai.FrameError) throw new DemoHttpError(400, '장면 사진과 영상 길이를 확인해 주세요.');
        throw error;
      }

      const frames = input.frames.map(({ t }) => t);
      const images = input.frames.map(({ jpeg }) => jpeg);
      const prompt = ai.buildPrompt(frames, input.durationSec);
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          signal.throwIfAborted();
          const { observation, modelVersion } = await ai.reviewedObservation(ai.provider, { ...prompt, images, signal }, frames);
          if (observation) return { observation, modelVersion, promptVersion: ai.PROMPT_VERSION, frames };
        }
        throw new DemoHttpError(502, '장면에서 관찰 문장을 만들지 못했어요. 다른 구간으로 다시 시도해 주세요.');
      } finally {
        for (const frame of input.frames) frame.jpeg = '';
        images.fill('');
      }
    },
  });
}
