import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { currentSession, setSession, settleRefresh } from '../../api/client';
import type { TokenResponse } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { getController, markSeen, loadSpeed, saveSpeed, setController, subscribeController } from './controller';
import { createDomDriver } from './domDriver';
import * as netlog from './netlog';
import Overlay from './Overlay';
import { Runner, type RunView } from './runner';
import { scenarioByKey } from './scenarios';
import { cleanupAll, createServices, isDemoUser, prepare } from './session';
import type { Scenario } from './types';
import { resetVisuals } from './visuals';
import './features.css';

/**
 * 기능별 시연 진행자. 메뉴가 시작을 부탁하면 필요한 시연 계정을 준비하고, 엔진으로 실제 화면을 움직이고,
 * 끝나면(또는 '그만 보기') 만든 계정을 지우고 원래 로그인 상태로 되돌린다.
 */

const EMPTY_VIEW: RunView = {
  status: 'running',
  index: 0,
  total: 0,
  narration: null,
  target: null,
  requestId: null,
  noRequest: false,
  error: null,
  speed: 1,
};

const noopSubscribe = () => () => undefined;

function reducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export default function FeatureHost() {
  const nav = useNavigate();
  const { user, policies, reload } = useAuth();
  const ctl = useSyncExternalStore(subscribeController, getController);
  const [runner, setRunner] = useState<Runner | null>(null);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [prepLabel, setPrepLabel] = useState('');
  const [prepError, setPrepError] = useState<string | null>(null);
  const [result, setResult] = useState<'done' | 'stopped' | null>(null);
  const view = useSyncExternalStore(
    runner ? runner.subscribe.bind(runner) : noopSubscribe,
    () => (runner ? runner.view : EMPTY_VIEW),
  );

  const userRef = useRef(user);
  userRef.current = user;
  const policiesRef = useRef(policies);
  policiesRef.current = policies;
  /** 시연 전에 로그인해 있던 실제 계정의 토큰(메모리에만). 끝나면 되돌린다. */
  const savedReal = useRef<{ accessToken: string; refreshToken: string } | null>(null);
  const runnerRef = useRef<Runner | null>(null);
  const busy = useRef(false);
  /** 시연 회차. 준비 도중 '그만 보기'를 누르면 늘어나서, 늦게 끝난 준비가 이어 달리지 않게 한다. */
  const runId = useRef(0);

  /** 시연을 끝내고 정리한다: 엔진 멈춤 → 로그아웃 → 시연 계정 삭제 → 원래 계정 되돌리기 → 메뉴로. */
  const finish = useCallback(
    async (opts?: { message?: string; replay?: string }) => {
      runId.current++;
      const r = runnerRef.current;
      r?.stop();
      setController({ phase: 'cleaning' });
      try {
        await settleRefresh();
        const me = userRef.current;
        if (!me || isDemoUser(me.id, me.email)) {
          setSession(null);
        }
        await cleanupAll();
        const saved = savedReal.current;
        savedReal.current = null;
        if (saved) setSession({ accessToken: saved.accessToken, refreshToken: saved.refreshToken } as TokenResponse);
        await reload();
      } finally {
        netlog.uninstall();
        resetVisuals();
        runnerRef.current = null;
        setRunner(null);
        setScenario(null);
        setResult(null);
        setPrepError(null);
        setController({ phase: 'idle', current: null, message: opts?.message ?? null, request: opts?.replay ?? null });
        if (!opts?.replay) nav('/demo/features', { replace: true });
      }
    },
    [nav, reload],
  );

  const start = useCallback(
    async (key: string) => {
      const sc = scenarioByKey(key);
      const pol = policiesRef.current;
      if (!sc || !pol || busy.current) {
        setController({ request: null });
        return;
      }
      busy.current = true;
      const my = ++runId.current;
      const cancelled = () => my !== runId.current;
      setController({ request: null, phase: 'preparing', current: key, message: null });
      setScenario(sc);
      setPrepError(null);
      setPrepLabel('시연을 준비하고 있어요');
      setResult(null);
      netlog.clearEntries();
      netlog.install();
      try {
        // 실제 계정으로 로그인해 있으면 토큰을 메모리에 두었다가 끝나면 되돌린다(메뉴에서 미리 물어본다).
        await settleRefresh();
        const me = userRef.current;
        if (me && !isDemoUser(me.id, me.email) && !savedReal.current) savedReal.current = currentSession();
        setSession(null);
        await reload();
        const data = await prepare(sc.needs, pol, setPrepLabel);
        if (cancelled()) {
          // 준비하는 사이 '그만 보기'를 눌렀다: 방금 만든 계정까지 지운다.
          await cleanupAll();
          return;
        }
        const services = createServices({ data, reload, currentUserId: () => userRef.current?.id });
        const reduced = reducedMotion();
        const r = new Runner({
          steps: sc.steps({ aiOn: data.aiOn }),
          data,
          services,
          driver: createDomDriver({ navigate: (p) => nav(p), reduced }),
          net: {
            mark: netlog.mark,
            wait: (e, since, o) => netlog.waitFor(e, since, o),
            appCountSince: netlog.appCountSince,
          },
          reduced,
          speed: loadSpeed(),
        });
        runnerRef.current = r;
        setRunner(r);
        setController({ phase: 'running' });
        const outcome = await r.run();
        if (runnerRef.current === r) {
          setResult(outcome);
          if (outcome === 'done') markSeen(key);
        }
      } catch (e) {
        if (!cancelled()) setPrepError(e instanceof Error ? e.message : '시연을 준비하지 못했어요.');
      } finally {
        busy.current = false;
      }
    },
    [nav, reload],
  );

  // 진행자가 사라지면(앱이 내려가는 등) api 관찰 고리도 함께 뗀다. 시연 밖에서는 붙어 있지 않게.
  useEffect(() => () => netlog.uninstall(), []);

  // 메뉴의 부탁을 받아 시작한다.
  useEffect(() => {
    if (ctl.request && ctl.phase === 'idle' && policies) void start(ctl.request);
  }, [ctl.request, ctl.phase, policies, start]);

  // 사람이 직접 만지면 멈추고, 브라우저 뒤로·앞으로 가기면 시연을 끝내고 정리한다.
  useEffect(() => {
    if (!runner) return;
    const inPanel = (t: EventTarget | null) => t instanceof Element && !!t.closest('.fdemo-panel');
    const onTouch = (e: Event) => {
      if (!e.isTrusted || inPanel(e.target)) return;
      runner.interrupt();
    };
    const onKey = (e: KeyboardEvent) => {
      if (!e.isTrusted || inPanel(e.target)) return;
      if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return;
      runner.interrupt();
    };
    const onPop = () => {
      if (runner.view.status === 'done') return;
      void finish({ message: '화면을 옮기셔서 시연을 멈추고 시연 계정을 정리했어요.' });
    };
    window.addEventListener('click', onTouch, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('click', onTouch, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('popstate', onPop);
    };
  }, [runner, finish]);

  // 시연 중에는 화면 아래 패널만큼 여백을 둔다.
  const on = ctl.phase !== 'idle';
  useEffect(() => {
    document.body.classList.toggle('fdemo-on', on);
    return () => document.body.classList.remove('fdemo-on');
  }, [on]);

  if (!on || !scenario) return null;

  return (
    <Overlay
      scenario={scenario}
      phase={ctl.phase}
      prepLabel={prepLabel}
      prepError={prepError}
      view={view}
      hasRunner={!!runner}
      result={result}
      onPause={() => runner?.pause()}
      onResume={() => runner?.resume()}
      onSkip={() => runner?.skip()}
      onSpeed={(s) => {
        saveSpeed(s);
        runner?.setSpeed(s);
      }}
      onDecide={(d) => runner?.decide(d)}
      onStop={() => void finish()}
      onReplay={() => void finish({ replay: scenario.key })}
    />
  );
}
