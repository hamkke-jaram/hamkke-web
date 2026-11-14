import { useCallback, useEffect, useRef, useState } from 'react';

/*
 * AI 서버가 지금 관찰 기록을 만들 수 있는지 미리 확인한다(GET /ai/v1/health, 로그인 토큰 없이).
 * 촬영·사진 뽑기 전에 확인해서, 1~2분 찍은 뒤에야 'AI 서버가 바빠요'를 만나지 않게 한다.
 * 숫자 기록(지표)은 이 확인과 상관없이 늘 남길 수 있다.
 */

export const HEALTH_URL = '/ai/v1/health';
/** 이 시간 안에 답이 없으면 닿지 않는 것으로 본다. */
const HEALTH_TIMEOUT_MS = 5000;

export type AiHealth =
  | { kind: 'checking' }
  | { kind: 'ready' }
  /** 서버에는 닿았지만 모델이 아직 준비되지 않았다(내려받는 중·불러오는 중 등). */
  | { kind: 'not-ready' }
  /** 서버에 닿지 못했다(프록시에 경로가 없음, 서버 꺼짐, 인터넷 끊김, 시간 초과). */
  | { kind: 'unreachable' };

interface HealthBody {
  status?: unknown;
  modelReady?: unknown;
}

/** 한 번 확인한다. 던지지 않고 결과만 돌려준다. */
export async function checkAiHealth(signal?: AbortSignal): Promise<Exclude<AiHealth, { kind: 'checking' }>> {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  const timer = setTimeout(() => ctrl.abort(), HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch(HEALTH_URL, { method: 'GET', headers: { Accept: 'application/json' }, signal: ctrl.signal });
    const body = (await res.json().catch(() => null)) as HealthBody | null;
    // JSON이 아니면(프록시 안내 페이지 등) AI 서버에 닿은 것이 아니다.
    if (!body || typeof body !== 'object') return { kind: 'unreachable' };
    if (body.modelReady === true && res.ok) return { kind: 'ready' };
    return { kind: 'not-ready' };
  } catch {
    return { kind: 'unreachable' };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/** 화면에 보여 줄 안내 문장. 준비되었거나 확인 중이면 null. */
export function healthNotice(h: AiHealth): string | null {
  if (h.kind === 'not-ready') return '지금은 AI 서버가 준비 중이에요. 잠시 후 다시 확인해 주세요.';
  if (h.kind === 'unreachable') return '지금은 AI 서버에 연결할 수 없어요. 잠시 후 다시 확인해 주세요.';
  return null;
}

/**
 * enabled인 동안 AI 서버 상태를 한 번 확인하고, recheck로 다시 확인한다.
 * enabled가 false면 확인하지 않고 'checking'으로 둔다(쓰지 않는 화면에서 요청을 보내지 않는다).
 */
export function useAiHealth(enabled: boolean) {
  const [health, setHealth] = useState<AiHealth>({ kind: 'checking' });
  const run = useRef(0);
  const ctrlRef = useRef<AbortController | null>(null);

  const recheck = useCallback(async (): Promise<AiHealth> => {
    const mine = ++run.current;
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    setHealth({ kind: 'checking' });
    const next = await checkAiHealth(ctrl.signal);
    if (mine === run.current) setHealth(next);
    return next;
  }, []);

  useEffect(() => {
    if (enabled) void recheck();
    return () => {
      run.current++;
      ctrlRef.current?.abort();
    };
  }, [enabled, recheck]);

  return { health, recheck };
}
