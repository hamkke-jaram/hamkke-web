const localhost = new Set(['localhost', '127.0.0.1', '[::1]']);
const localAddress = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const aiSource = new URL('../../../hamkke-ai/server/src/', import.meta.url);
let inProgress = false;

export function importObservationModule(file) {
  return import(new URL(file, aiSource).href);
}

export class DemoHttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function isLocalRequest(req) {
  const { origin, host } = req.headers;
  if (!origin || !host || !localAddress.has(req.socket.remoteAddress)) return false;
  try {
    const url = new URL(origin);
    return ['http:', 'https:'].includes(url.protocol) &&
      url.origin === origin && url.host === host && localhost.has(url.hostname);
  } catch {
    return false;
  }
}

function sendJson(res, status, data) {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(data));
}

export function readDemoJson(body) {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
  } catch {
    throw new DemoHttpError(400, '시연 요청 형식을 확인해 주세요.');
  }
}

export function createLocalTeacherReviewRoute({ path, maxBytes, run }) {
  return async (req, res, next) => {
    if (req.url?.split('?', 1)[0] !== path) return next();
    if (!isLocalRequest(req)) return sendJson(res, 403, { message: '이 PC에서 시연 화면을 열어 주세요.' });
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { message: '시연 화면에서 시작해 주세요.' });
    }
    if (req.headers['content-type']?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
      return sendJson(res, 415, { message: '시연 요청 형식을 확인해 주세요.' });
    }
    if (Number(req.headers['content-length']) > maxBytes) {
      return sendJson(res, 413, { message: '시연 요청이 너무 커요.' });
    }
    if (inProgress) return sendJson(res, 429, { message: '이 PC에서 처리 중인 시연 요청이 있어요. 잠시 뒤 다시 시도해 주세요.' });

    inProgress = true;
    const closed = new AbortController();
    const onClose = () => closed.abort();
    res.once('close', onClose);
    const deadline = AbortSignal.timeout(120_000);
    const signal = AbortSignal.any([closed.signal, deadline]);
    let body;
    try {
      const { readBody, BodyTooLargeError } = await importObservationModule('frames.ts');
      try {
        body = await readBody(req, maxBytes);
      } catch (error) {
        if (error instanceof BodyTooLargeError) throw new DemoHttpError(413, '시연 요청이 너무 커요.');
        throw error;
      }
      signal.throwIfAborted();
      sendJson(res, 200, await run(body, signal));
    } catch (error) {
      if (closed.signal.aborted) return;
      if (deadline.aborted) return sendJson(res, 504, { message: 'AI 응답을 기다리는 시간이 길어졌어요. 다시 시도해 주세요.' });
      if (error instanceof DemoHttpError) return sendJson(res, error.status, { message: error.message });
      sendJson(res, 502, { message: '이 PC의 AI 모델이 응답하지 않았어요. Ollama와 시연 서버를 확인하고 다시 시도해 주세요.' });
    } finally {
      body?.fill(0);
      res.off('close', onClose);
      inProgress = false;
    }
  };
}
