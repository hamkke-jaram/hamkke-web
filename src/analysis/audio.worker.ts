/// <reference lib="webworker" />
import { analyzeAudio } from '@hamkke-jaram/analysis/audio';

// 오디오 분석을 별도 스레드에서 돌려 화면이 멈추지 않게 한다. 결과(숫자)만 돌려준다.
self.onmessage = (e: MessageEvent<Float32Array>) => {
  try {
    const { metrics } = analyzeAudio(e.data);
    (self as unknown as Worker).postMessage({ ok: true, metrics });
  } catch (err) {
    (self as unknown as Worker).postMessage({ ok: false, error: String(err) });
  }
};
