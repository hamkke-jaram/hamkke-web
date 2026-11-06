import { AnalysisError, type AudioMetrics, type AudioRunner } from '@hamkke-jaram/analysis';

/** 오디오 지표 계산을 Web Worker에서 돌린다(analyzeVideo의 runAudio 옵션). */
export const runAudioInWorker: AudioRunner = (samples) =>
  new Promise<AudioMetrics>((resolve, reject) => {
    const worker = new Worker(new URL('./audio.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ ok: boolean; metrics?: AudioMetrics }>) => {
      worker.terminate();
      if (e.data.ok && e.data.metrics) resolve(e.data.metrics);
      else reject(new AnalysisError('소리 분석 중 문제가 생겼어요.'));
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new AnalysisError('소리 분석 중 문제가 생겼어요.'));
    };
    worker.postMessage(samples, [samples.buffer]);
  });
