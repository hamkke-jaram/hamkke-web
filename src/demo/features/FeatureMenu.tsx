import { useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { setSession } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { Loading } from '../../components/ui';
import { useDemo } from '../DemoContext';
import { getController, requestStart, seenKeys, subscribeController } from './controller';
import { GROUPS, SCENARIOS } from './scenarios';
import { cleanupAll, getStored, hasLeftovers, isDemoUser, subscribeStored } from './session';
import type { Scenario } from './types';
import './features.css';

/** 운영처럼 빌드한 시연(VITE_DEMO_MODE)에서는 가입 횟수 제한에 걸릴 수 있음을 알린다. */
const PROD_LIKE = !import.meta.env.DEV;

/** /demo/features — 기능 하나씩 실제 화면으로 보여 주는 메뉴. */
export default function FeatureMenu() {
  const { user, policies, reload } = useAuth();
  const tour = useDemo();
  const ctl = useSyncExternalStore(subscribeController, getController);
  const stored = useSyncExternalStore(subscribeStored, getStored);
  const [asking, setAsking] = useState<string | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [seen] = useState(seenKeys);
  const realUser = user && !isDemoUser(user.id, user.email) ? user : null;
  const busy = ctl.phase !== 'idle' || cleaning;
  const aiOn = policies?.aiObservationEnabled === true;

  function play(key: string) {
    if (busy || tour.active) return;
    if (realUser && asking !== key) {
      setAsking(key);
      return;
    }
    setAsking(null);
    requestStart(key);
  }

  async function clearAll() {
    setCleaning(true);
    try {
      await cleanupAll();
      if (user && isDemoUser(user.id, user.email)) {
        setSession(null);
        await reload();
      }
    } finally {
      setCleaning(false);
    }
  }

  const card = (s: Scenario) => (
    <section key={s.key} className="card fdemo-card" aria-labelledby={`fdemo-${s.key}-h`}>
      <h3 id={`fdemo-${s.key}-h`}>
        {s.title}
        {seen.includes(s.key) && <span className="chip brand" style={{ marginLeft: 8 }}>✓ 봤어요</span>}
      </h3>
      <p>{s.summary}</p>
      <p className="fdemo-where">
        <span className="fdemo-tag">약 {s.minutes}분</span>
        {s.badges.map((b) => (
          <span key={b} className="fdemo-tag">
            {b}
          </span>
        ))}
      </p>
      {s.aiDependent && policies && !aiOn && <p>지금은 AI 서버가 꺼져 있어 설명만 보여 드려요.</p>}
      {asking === s.key && realUser && (
        <div className="confirm" role="group" aria-label="계정 전환 확인">
          <p>
            <strong>지금 로그인한 계정({realUser.email})에서 잠시 나와요.</strong> 계정과 기록은 그대로 남고, 시연이 끝나면 이
            계정으로 다시 돌아와요.
          </p>
          <div className="row">
            <button type="button" className="btn secondary" onClick={() => setAsking(null)}>
              취소
            </button>
            <button type="button" className="btn" onClick={() => play(s.key)}>
              계속하기
            </button>
          </div>
        </div>
      )}
      {asking !== s.key && (
        <button
          type="button"
          className="btn"
          data-demo={`features-play-${s.key}`}
          aria-disabled={busy || tour.active || !policies || undefined}
          onClick={() => policies && play(s.key)}
        >
          {ctl.current === s.key && ctl.phase !== 'idle' ? '보는 중…' : '시연 보기'}
        </button>
      )}
    </section>
  );

  return (
    <div className="fdemo-menu">
      <h1>기능별로 보기</h1>
      <p className="lead">
        기능 하나를 골라 누르면 실제 화면에서 글자를 한 자씩 넣고 버튼을 누르며 보여 드려요. 아래 안내에서 무엇을 넣는지,
        어디로 가는지(이 기기 안 / 기록 서버 / AI 서버), 왜 그런지 설명하고, &quot;서버로 간 내용&quot;에서 실제로 보낸 요청을
        볼 수 있어요.
      </p>

      <section className="card soft">
        <p style={{ marginTop: 0 }}>
          시연마다 필요한 시연용 계정(@demo.hamkke.test)만 새로 만들고, 끝나거나 &quot;그만 보기&quot;를 누르면 지워요. 실제
          계정은 건드리지 않아요.
        </p>
        <p className="muted" style={{ marginBottom: 0 }}>
          시연 중 화면을 직접 누르면 잠시 멈춰요. 아래 패널에서 일시정지·건너뛰기·속도(1x/2x)를 고를 수 있어요.
          {' '}&quot;새 서버 기능&quot; 표시가 있는 시연은 기록 서버가 새 판이어야 끝까지 보여요. 옛 판이면 그 단계에서 멈추고
          건너뛸 수 있어요.
          {PROD_LIKE && ' 한 번에 너무 많이 시연하면 1분쯤 기다려야 할 수 있어요.'}
        </p>
      </section>

      {ctl.message && (
        <p className="notice" role="status">
          {ctl.message}
        </p>
      )}

      {tour.active && (
        <div className="notice" role="status">
          <p style={{ marginTop: 0 }}>전체 흐름 보기가 진행 중이에요. 두 시연은 같은 로그인을 쓰므로 먼저 끝내 주세요.</p>
          <button type="button" className="btn small" onClick={() => void tour.end({ navigate: false })}>
            전체 흐름 보기 끝내기
          </button>
        </div>
      )}

      {hasLeftovers(stored) && ctl.phase === 'idle' && (
        <div className="notice" role="status">
          <p style={{ marginTop: 0 }}>지난 시연에서 만든 시연용 계정이 남아 있어요.</p>
          <button type="button" className="btn small" aria-disabled={cleaning || undefined} onClick={() => !cleaning && void clearAll()}>
            {cleaning ? '지우는 중…' : '모두 지우기'}
          </button>
        </div>
      )}

      {!policies ? (
        <Loading />
      ) : (
        GROUPS.map((g) => (
          <div key={g.key}>
            <h2 className="fdemo-group">{g.title}</h2>
            {SCENARIOS.filter((s) => s.group === g.key).map(card)}
          </div>
        ))
      )}

      <p className="status-line" style={{ marginTop: 16 }}>
        <Link to="/demo" className="link-btn">
          전체 흐름 보기(9단계)
        </Link>
      </p>
    </div>
  );
}
