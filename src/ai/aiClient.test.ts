import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setSession } from '../api/client';
import type { TokenResponse } from '../api/types';
import { AiError, canResumeSave, createObservation, resumeSave, type AiStage, type PendingSave } from './aiClient';
import type { Frame } from './frames';

/** 시험용 장면 사진(내용은 아무 글자). 실제 사진은 쓰지 않는다. */
const FRAMES: Frame[] = Array.from({ length: 6 }, (_, i) => ({ t: i * 12, jpeg: `/9j/frame-${i}` }));

const SAVED = {
  observation: {
    id: 1,
    source: 'HOME',
    recordedAt: '2026-11-13T01:00:00Z',
    createdAt: '2026-11-13T01:02:00Z',
    summary: '어른과 아이가 마주 앉아 있어요.',
    childStates: ['PLAYING_TOGETHER'],
    adultResponses: ['WAITING'],
    moments: [],
    peopleCount: 2,
    modelVersion: 'test-model',
  },
  coaching: null,
};

interface Call {
  url: string;
  method: string;
  auth: string | null;
  body: string;
}

interface SaveBody {
  receipt: string;
  recordedAt?: string;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function html(status: number): Response {
  return new Response('<html><body>gateway</body></html>', { status, headers: { 'Content-Type': 'text/html' } });
}

/** 경로별로 응답을 정해 주는 가짜 fetch. 보낸 요청은 calls에 쌓인다. */
function mockFetch(routes: {
  session?: () => Response;
  analyze?: () => Response;
  save?: (body: SaveBody) => Response;
  /** GET ai-observations (이미 저장된 기록을 다시 찾을 때) */
  list?: () => Response;
  /** GET card-deliveries */
  cards?: () => Response;
}) {
  const calls: Call[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    calls.push({ url, method: init?.method ?? 'GET', auth: headers.get('Authorization'), body: String(init?.body ?? '') });
    if (url.endsWith('/ai-sessions')) {
      return (routes.session ?? (() => json(200, { token: 'session-token', expiresAt: '2026-11-13T01:10:00Z', maxFrames: 6 })))();
    }
    if (url === '/ai/v1/analyze') {
      return (
        routes.analyze ??
        (() =>
          json(200, {
            observation: { summary: null, childStates: [], adultResponses: [], moments: [], peopleCount: 2 },
            receipt: 'signed-receipt',
            modelVersion: 'test-model',
            promptVersion: 'obs-v1',
            analyzedFrames: 6,
          }))
      )();
    }
    if (url.endsWith('/ai-observations')) {
      return (routes.save ?? (() => json(200, SAVED)))(JSON.parse(String(init?.body)) as SaveBody);
    }
    if (url.includes('/ai-observations?')) return (routes.list ?? (() => json(200, [])))();
    if (url.includes('/card-deliveries?')) return (routes.cards ?? (() => json(200, [])))();
    return json(404, { code: 'NOT_FOUND', message: '없어요' });
  });
  vi.stubGlobal('fetch', fn);
  return calls;
}

const savesOf = (calls: Call[]) => calls.filter((c) => c.method === 'POST' && c.url.endsWith('/ai-observations'));
const sentPhotos = (calls: Call[]) => calls.filter((c) => c.url === '/ai/v1/analyze');
const sessionsOf = (calls: Call[]) => calls.filter((c) => c.url.endsWith('/ai-sessions'));

async function failure(p: Promise<unknown>): Promise<AiError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof AiError) return e;
    throw e;
  }
  throw new Error('실패해야 하는데 성공했어요');
}

beforeEach(() => {
  setSession({ accessToken: 'login-token', refreshToken: 'refresh-token' } as TokenResponse);
});

afterEach(() => {
  setSession(null);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('createObservation', () => {
  it('분석 토큰을 받고, 사진은 /ai/ 로만 보내고, 영수증만 저장한다', async () => {
    const calls = mockFetch({});
    const stages: AiStage[] = [];

    const result = await createObservation(7, FRAMES, {
      durationSec: 60,
      recordedAt: '2026-11-13T01:00:00Z',
      onStage: (s) => stages.push(s),
    });

    expect(result.observation.id).toBe(1);
    expect(stages).toEqual(['session', 'analyzing', 'saving']);
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'POST /api/v1/children/7/ai-sessions',
      'POST /ai/v1/analyze',
      'POST /api/v1/children/7/ai-observations',
    ]);

    const [session, analyze, save] = calls;
    // hamkke-api에는 로그인 토큰, AI 서버에는 분석 토큰만 간다.
    expect(session.auth).toBe('Bearer login-token');
    expect(analyze.auth).toBe('Bearer session-token');
    expect(analyze.body).not.toContain('login-token');

    const sent = JSON.parse(analyze.body) as { frames: Frame[]; durationSec: number };
    expect(sent.frames).toEqual(FRAMES);
    expect(sent.durationSec).toBe(60);

    // 사진은 /api 로 가지 않는다.
    expect(session.body).not.toContain('/9j/');
    expect(save.body).not.toContain('/9j/');
    expect(JSON.parse(save.body)).toEqual({ receipt: 'signed-receipt', recordedAt: '2026-11-13T01:00:00Z' });
  });

  it('서버가 알려 준 장수보다 많이 보내지 않는다', async () => {
    const calls = mockFetch({
      session: () => json(200, { token: 'session-token', expiresAt: '2026-11-13T01:10:00Z', maxFrames: 3 }),
    });
    await createObservation(7, FRAMES);
    const sent = JSON.parse(calls[1].body) as { frames: Frame[] };
    expect(sent.frames.map((f) => f.t)).toEqual([0, 36, 60]);
  });

  it('동의가 없으면 사진을 보내지 않고 안내한다', async () => {
    const calls = mockFetch({
      session: () => json(422, { code: 'AI_CONSENT_REQUIRED', message: '동의가 필요해요.' }),
    });
    const e = await failure(createObservation(7, FRAMES));
    expect(e.code).toBe('AI_CONSENT_REQUIRED');
    expect(e.retryable).toBe(false);
    expect(calls.some((c) => c.url.startsWith('/ai/'))).toBe(false);
  });

  it('토큰을 받은 뒤 멈추면 사진을 보내지 않는다', async () => {
    const ctrl = new AbortController();
    const calls = mockFetch({
      session: () => {
        ctrl.abort();
        return json(200, { token: 'session-token', expiresAt: '2026-11-13T01:10:00Z', maxFrames: 6 });
      },
    });
    await expect(createObservation(7, FRAMES, { signal: ctrl.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(calls.some((c) => c.url.startsWith('/ai/'))).toBe(false);
  });

  it('보낼 사진이 없으면 아무 요청도 하지 않는다', async () => {
    const calls = mockFetch({});
    const e = await failure(createObservation(7, []));
    expect(e.code).toBe('INVALID_FRAMES');
    expect(calls).toHaveLength(0);
  });

  it.each([
    [429, { code: 'BUSY', message: '바빠요' }, 'BUSY', true],
    [504, { code: 'MODEL_TIMEOUT', message: '늦어요' }, 'MODEL_TIMEOUT', true],
    [502, { code: 'MODEL_UNAVAILABLE', message: '없어요' }, 'MODEL_UNAVAILABLE', true],
    [413, { code: 'PAYLOAD_TOO_LARGE', message: '커요' }, 'PAYLOAD_TOO_LARGE', false],
    [400, { code: 'INVALID_FRAMES', message: '읽지 못했어요' }, 'INVALID_FRAMES', false],
    [409, { code: 'SESSION_ALREADY_USED', message: '썼어요' }, 'SESSION_ALREADY_USED', true],
  ])('AI 서버 오류 %i 를 화면 문구로 바꾼다', async (status, body, code, retryable) => {
    const calls = mockFetch({ analyze: () => json(status, body) });
    const e = await failure(createObservation(7, FRAMES));
    expect(e.code).toBe(code);
    expect(e.retryable).toBe(retryable);
    expect(e.message).not.toBe(body.message); // 서버 문장을 그대로 쓰지 않고 정해 둔 문구를 쓴다
    expect(e.message.length).toBeGreaterThan(0);
    // 살펴보기에서 실패하면 저장할 영수증이 없다. 다시 시도는 처음부터 한다.
    expect(e.pending).toBeUndefined();
    expect(savesOf(calls)).toHaveLength(0);
  });

  it.each([
    [502, 'MODEL_UNAVAILABLE'],
    [504, 'MODEL_TIMEOUT'],
    [413, 'PAYLOAD_TOO_LARGE'],
    [404, 'MODEL_UNAVAILABLE'],
  ])('JSON이 아닌 프록시 오류 %i 도 다룬다', async (status, code) => {
    mockFetch({ analyze: () => html(status) });
    const e = await failure(createObservation(7, FRAMES));
    expect(e.code).toBe(code);
  });

  it('성공 응답인데 영수증이 없으면 저장하지 않는다', async () => {
    const calls = mockFetch({ analyze: () => html(200) });
    const e = await failure(createObservation(7, FRAMES));
    expect(e.code).toBe('MODEL_UNAVAILABLE');
    expect(savesOf(calls)).toHaveLength(0);
  });

  it('AI 서버에 닿지 못하면 다시 시도할 수 있게 알린다', async () => {
    mockFetch({
      analyze: () => {
        throw new TypeError('fetch failed');
      },
    });
    const e = await failure(createObservation(7, FRAMES));
    expect(e.code).toBe('NETWORK');
    expect(e.retryable).toBe(true);
  });

  it('저장이 잠깐 실패하면 같은 영수증으로 다시 보낸다(사진은 다시 보내지 않는다)', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const calls = mockFetch({
      save: () => (++attempts < 2 ? json(503, { code: 'UNAVAILABLE', message: '잠시만요' }) : json(200, SAVED)),
    });
    const pending = createObservation(7, FRAMES);
    await vi.advanceTimersByTimeAsync(5000);
    const result = await pending;
    expect(result.observation.id).toBe(1);
    expect(savesOf(calls)).toHaveLength(2);
    expect(sentPhotos(calls)).toHaveLength(1);
  });
});

describe('저장 단계의 실패', () => {
  it('촬영 시각을 서버가 받지 않으면(기기 시계가 빠름) 촬영 시각 없이 한 번 더 저장한다', async () => {
    const calls = mockFetch({
      save: (body) =>
        body.recordedAt ? json(400, { code: 'VALIDATION_FAILED', message: '기록 시각이 미래일 수 없어요.' }) : json(200, SAVED),
    });
    const result = await createObservation(7, FRAMES, { recordedAt: '2026-11-13T05:00:00Z' });
    expect(result.observation.id).toBe(1);
    const saves = savesOf(calls);
    expect(saves).toHaveLength(2);
    expect(JSON.parse(saves[0].body)).toEqual({ receipt: 'signed-receipt', recordedAt: '2026-11-13T05:00:00Z' });
    expect(JSON.parse(saves[1].body)).toEqual({ receipt: 'signed-receipt' });
    // 분석 토큰을 새로 받거나 사진을 다시 보내지 않는다.
    expect(sessionsOf(calls)).toHaveLength(1);
    expect(sentPhotos(calls)).toHaveLength(1);
  });

  it('촬영 시각 없이도 입력값 오류면 되풀이하지 않고, 다시 시도도 권하지 않는다', async () => {
    const calls = mockFetch({ save: () => json(400, { code: 'VALIDATION_FAILED', message: '입력값을 다시 확인해 주세요.' }) });
    const e = await failure(createObservation(7, FRAMES));
    expect(e.code).toBe('SAVE_REJECTED');
    expect(e.retryable).toBe(false);
    expect(e.pending).toBeUndefined();
    expect(savesOf(calls)).toHaveLength(1);
  });

  it.each([
    [400, 'AI_RECEIPT_INVALID', 'AI_RECEIPT_INVALID'],
    [422, 'AI_CONSENT_REQUIRED', 'AI_CONSENT_REQUIRED'],
    [404, 'NOT_FOUND', 'NOT_ALLOWED'],
    [403, 'FORBIDDEN', 'NOT_ALLOWED'],
    [401, 'UNAUTHORIZED', 'SIGNED_OUT'], // 토큰 갱신도 되지 않은 경우
  ])('다시 보내도 같은 거절(%i %s)은 다시 시도를 권하지 않고, 연결 문제라고 말하지 않는다', async (status, apiCode, code) => {
    const calls = mockFetch({ save: () => json(status, { code: apiCode, message: '서버 문장' }) });
    const e = await failure(createObservation(7, FRAMES));
    expect(e.code).toBe(code);
    expect(e.retryable).toBe(false);
    expect(e.pending).toBeUndefined();
    expect(e.message).not.toContain('연결을 확인');
    expect(e.message).not.toBe('서버 문장');
    expect(savesOf(calls)).toHaveLength(1);
    expect(sentPhotos(calls)).toHaveLength(1);
  });

  it('저장이 계속 실패하면 영수증을 실어 알리고, 다시 시도는 저장만 다시 한다', async () => {
    vi.useFakeTimers();
    let down = true;
    const calls = mockFetch({ save: () => (down ? json(503, { code: 'UNAVAILABLE', message: '잠시만요' }) : json(200, SAVED)) });
    const first = failure(createObservation(7, FRAMES, { recordedAt: '2026-11-13T01:00:00Z' }));
    await vi.advanceTimersByTimeAsync(10_000);
    const e = await first;
    expect(e.code).toBe('SAVE_FAILED');
    expect(e.retryable).toBe(true);
    expect(e.message).toContain('저장만 다시');
    expect(savesOf(calls)).toHaveLength(3);
    const pending = e.pending as PendingSave;
    expect(pending).toMatchObject({ childId: 7, receipt: 'signed-receipt', recordedAt: '2026-11-13T01:00:00Z' });
    expect(canResumeSave(pending, 7)).toBe(true);

    down = false;
    const stages: AiStage[] = [];
    const result = await resumeSave(pending, { onStage: (s) => stages.push(s) });
    expect(result.observation.id).toBe(1);
    expect(stages).toEqual(['saving']);
    // 분석 토큰을 새로 받지 않고, 사진도 다시 보내지 않는다.
    expect(sessionsOf(calls)).toHaveLength(1);
    expect(sentPhotos(calls)).toHaveLength(1);
    expect(savesOf(calls)).toHaveLength(4);
    expect(JSON.parse(savesOf(calls)[3].body)).toEqual({ receipt: 'signed-receipt', recordedAt: '2026-11-13T01:00:00Z' });
  });

  it('촬영 시각을 뺀 뒤에 실패하면, 다시 시도할 때도 촬영 시각을 빼고 저장한다', async () => {
    vi.useFakeTimers();
    const calls = mockFetch({
      save: (body) =>
        body.recordedAt
          ? json(400, { code: 'VALIDATION_FAILED', message: '기록 시각이 미래일 수 없어요.' })
          : json(503, { code: 'UNAVAILABLE', message: '잠시만요' }),
    });
    const first = failure(createObservation(7, FRAMES, { recordedAt: '2026-11-13T05:00:00Z' }));
    await vi.advanceTimersByTimeAsync(10_000);
    const e = await first;
    expect(e.code).toBe('SAVE_FAILED');
    expect(e.pending?.receipt).toBe('signed-receipt');
    expect(e.pending?.recordedAt).toBeUndefined();
    expect(savesOf(calls)).toHaveLength(4); // 촬영 시각과 함께 1번 + 없이 3번
  });

  it('응답 없이 끊겨도 영수증을 실어 알린다', async () => {
    vi.useFakeTimers();
    mockFetch({
      save: () => {
        throw new TypeError('fetch failed');
      },
    });
    const first = failure(createObservation(7, FRAMES));
    await vi.advanceTimersByTimeAsync(10_000);
    const e = await first;
    expect(e.code).toBe('SAVE_FAILED');
    expect(e.pending?.receipt).toBe('signed-receipt');
  });

  it.each([
    [429, 'TOO_MANY_REQUESTS', 'SAVE_BUSY'],
    [503, 'AI_UNAVAILABLE', 'AI_UNAVAILABLE'],
    [500, 'INTERNAL_ERROR', 'SAVE_FAILED'],
  ])('잠시 뒤에 될 수 있는 실패(%i %s)는 바로 되풀이하지 않고 영수증을 실어 알린다', async (status, apiCode, code) => {
    const calls = mockFetch({ save: () => json(status, { code: apiCode, message: '서버 문장' }) });
    const e = await failure(createObservation(7, FRAMES));
    expect(e.code).toBe(code);
    expect(e.retryable).toBe(true);
    expect(e.pending?.receipt).toBe('signed-receipt');
    expect(savesOf(calls)).toHaveLength(1);
  });

  it('멈춘 뒤에는 저장만 다시 하기도 시작하지 않는다', async () => {
    const calls = mockFetch({});
    const ctrl = new AbortController();
    ctrl.abort();
    const pending: PendingSave = { childId: 7, receipt: 'signed-receipt', receivedAt: Date.now() };
    await expect(resumeSave(pending, { signal: ctrl.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(calls).toHaveLength(0);
  });

  it('영수증은 받은 지 14분이 지나거나 다른 아이의 것이면 저장만 다시 하지 않는다', () => {
    const pending: PendingSave = { childId: 7, receipt: 'signed-receipt', receivedAt: 1_000_000 };
    expect(canResumeSave(pending, 7, 1_000_000 + 13 * 60_000)).toBe(true);
    expect(canResumeSave(pending, 7, 1_000_000 + 14 * 60_000)).toBe(false);
    expect(canResumeSave(pending, 8, 1_000_000)).toBe(false);
    expect(canResumeSave(pending, 7, 999_000)).toBe(false); // 기기 시계가 뒤로 간 경우
    expect(canResumeSave(null, 7)).toBe(false);
    expect(canResumeSave({ ...pending, receipt: '' }, 7)).toBe(false);
  });

  describe('앞선 저장이 서버에는 닿았던 경우(409 DUPLICATE_REQUEST)', () => {
    /** 첫 저장은 서버에 닿았지만 응답을 받지 못했고, 다시 보내면 서버가 이미 저장했다고 답한다. */
    const duplicateAfterLostResponse = () => {
      let n = 0;
      return () => {
        if (++n === 1) throw new TypeError('fetch failed');
        return json(409, { code: 'DUPLICATE_REQUEST', message: '이미 처리된 요청이에요.' });
      };
    };
    const mine = { ...SAVED.observation, id: 42, mine: true, recordedAt: '2026-11-13T01:00:00Z', createdAt: '2026-11-13T01:02:00Z' };
    const others = [
      { ...SAVED.observation, id: 50, mine: false, source: 'INSTITUTION', recordedAt: '2026-11-13T01:00:00Z' },
      { ...SAVED.observation, id: 45, mine: true, recordedAt: '2026-11-12T09:00:00Z' },
      { ...SAVED.observation, id: 30, mine: true, recordedAt: '2026-11-13T01:00:00Z' },
    ];
    const card = { id: 9, deliveredAt: '2026-11-13T01:02:00.050Z', triedAt: null, card: { id: 3, title: '카드' } };

    it('방금 저장된 기록과 카드를 찾아 성공으로 돌려준다', async () => {
      vi.useFakeTimers();
      const calls = mockFetch({
        save: duplicateAfterLostResponse(),
        list: () => json(200, [others[0], mine, others[1], others[2]]),
        cards: () => json(200, [card]),
      });
      const pending = createObservation(7, FRAMES, { recordedAt: '2026-11-13T01:00:00Z' });
      await vi.advanceTimersByTimeAsync(5000);
      const result = await pending;
      // 내가 만든 기록 가운데 촬영 시각이 같고 가장 나중에 저장된 것
      expect(result.observation.id).toBe(42);
      expect(result.coaching?.delivery?.id).toBe(9);
      expect(calls.some((c) => c.method === 'GET' && c.url === '/api/v1/children/7/ai-observations?limit=20')).toBe(true);
      expect(sentPhotos(calls)).toHaveLength(1);
    });

    it('촬영 시각을 보내지 않았으면 내가 만든 기록 가운데 가장 나중에 저장된 것을 고른다', async () => {
      vi.useFakeTimers();
      mockFetch({ save: duplicateAfterLostResponse(), list: () => json(200, [others[0], mine, others[1], others[2]]) });
      const pending = createObservation(7, FRAMES);
      await vi.advanceTimersByTimeAsync(5000);
      expect((await pending).observation.id).toBe(45);
    });

    it('그 기록보다 먼저 전달된 카드는 이 기록의 카드로 보지 않는다', async () => {
      vi.useFakeTimers();
      mockFetch({
        save: duplicateAfterLostResponse(),
        list: () => json(200, [mine]),
        cards: () => json(200, [{ ...card, deliveredAt: '2026-11-13T00:59:00Z' }]),
      });
      const pending = createObservation(7, FRAMES, { recordedAt: '2026-11-13T01:00:00Z' });
      await vi.advanceTimersByTimeAsync(5000);
      const result = await pending;
      expect(result.observation.id).toBe(42);
      expect(result.coaching).toBeNull();
    });

    it('카드를 불러오지 못해도 기록은 돌려준다', async () => {
      vi.useFakeTimers();
      mockFetch({
        save: duplicateAfterLostResponse(),
        list: () => json(200, [mine]),
        cards: () => json(503, { code: 'UNAVAILABLE', message: '잠시만요' }),
      });
      const pending = createObservation(7, FRAMES);
      await vi.advanceTimersByTimeAsync(5000);
      const result = await pending;
      expect(result.observation.id).toBe(42);
      expect(result.coaching).toBeNull();
    });

    it('기관 기록은 카드를 찾지 않는다', async () => {
      vi.useFakeTimers();
      const calls = mockFetch({
        save: duplicateAfterLostResponse(),
        list: () => json(200, [{ ...mine, source: 'INSTITUTION' }]),
      });
      const pending = createObservation(7, FRAMES);
      await vi.advanceTimersByTimeAsync(5000);
      const result = await pending;
      expect(result.observation.id).toBe(42);
      expect(result.coaching).toBeNull();
      expect(calls.some((c) => c.url.includes('/card-deliveries'))).toBe(false);
    });

    it.each([
      ['목록을 불러오지 못하면', () => json(503, { code: 'UNAVAILABLE', message: '잠시만요' })],
      ['목록에서 찾지 못하면', () => json(200, [others[0], others[1]])],
    ])('%s 저장되어 있다는 사실만 알린다(영수증을 다시 쓰지 않는다)', async (_name, list) => {
      vi.useFakeTimers();
      mockFetch({ save: duplicateAfterLostResponse(), list });
      const pending = failure(createObservation(7, FRAMES, { recordedAt: '2026-11-13T01:00:00Z' }));
      await vi.advanceTimersByTimeAsync(5000);
      const e = await pending;
      expect(e.code).toBe('ALREADY_SAVED');
      expect(e.retryable).toBe(false);
      expect(e.pending).toBeUndefined();
    });
  });
});
