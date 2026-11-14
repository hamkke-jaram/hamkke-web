import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { HostPhase } from './controller';
import * as netlog from './netlog';
import type { RunView } from './runner';
import type { Scenario, Where } from './types';
import { getVisuals, subscribeVisuals } from './visuals';

/** 기능별 시연 겉모습: 비추기, 가짜 커서, 아래 제어 패널(말풍선·서버로 간 내용). */

const WHERE_LABEL: Record<Where, string> = {
  device: '이 기기 안에서',
  server: '기록 서버로',
  ai: 'AI 서버로',
};

const SOURCE_LABEL: Record<netlog.NetSource, string> = {
  app: '화면',
  prep: '시연 준비',
  check: '화면 밖 확인',
  sample: '샘플 받기',
};

interface Props {
  scenario: Scenario;
  phase: HostPhase;
  prepLabel: string;
  prepError: string | null;
  view: RunView;
  hasRunner: boolean;
  result: 'done' | 'stopped' | null;
  onPause: () => void;
  onResume: () => void;
  onSkip: () => void;
  onSpeed: (s: number) => void;
  onDecide: (d: 'retry' | 'skip' | 'stop') => void;
  onStop: () => void;
  onReplay: () => void;
}

export default function Overlay(p: Props) {
  return (
    <>
      <Spotlight />
      <Cursor />
      <Panel {...p} />
    </>
  );
}

/** 대상 요소 둘레를 밝게 두고 나머지를 살짝 어둡게. 화면을 막지 않는다(pointer-events: none). */
function Spotlight() {
  const v = useSyncExternalStore(subscribeVisuals, getVisuals);
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    const el = v.target;
    if (!el) {
      setRect(null);
      return;
    }
    let raf = 0;
    let last = '';
    const tick = () => {
      const r = el.isConnected ? el.getBoundingClientRect() : null;
      const key = r ? `${r.left}|${r.top}|${r.width}|${r.height}` : '';
      if (key !== last) {
        last = key;
        setRect(r && r.width + r.height > 0 ? r : null);
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [v.target]);
  if (!rect) return null;
  const pad = 6;
  return (
    <>
      <div
        className="fdemo-spot"
        aria-hidden="true"
        style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }}
      />
      {v.hint && (
        <div className="fdemo-hint" aria-hidden="true" style={{ left: rect.left, top: rect.bottom + pad + 6 }}>
          {v.hint}
        </div>
      )}
    </>
  );
}

function Cursor() {
  const v = useSyncExternalStore(subscribeVisuals, getVisuals);
  if (!v.cursor) return null;
  return (
    <div className="fdemo-cursor" aria-hidden="true" style={{ transform: `translate(${v.cursor.x}px, ${v.cursor.y}px)` }}>
      <span key={v.ripple} className="fdemo-ripple" />
      <svg width="22" height="22" viewBox="0 0 22 22">
        <path d="M3 2 L3 18 L7.5 13.8 L10.6 20.5 L13.4 19.2 L10.4 12.6 L16.5 12.4 Z" fill="#fff" stroke="#1f2937" strokeWidth="1.4" />
      </svg>
    </div>
  );
}

function Json({ value }: { value: unknown }) {
  if (value === undefined) return <p className="fdemo-muted">(본문 없음)</p>;
  return <pre className="fdemo-json">{JSON.stringify(value, null, 2)}</pre>;
}

function RequestCard({ entry, open }: { entry: netlog.NetEntry; open?: boolean }) {
  return (
    <div className="fdemo-req">
      <div className="fdemo-req-line">
        <span className={`fdemo-tag src-${entry.source}`}>{SOURCE_LABEL[entry.source]}</span>
        <code>{netlog.requestLine(entry)}</code>
        {entry.simulated === 'offline' && <span className="fdemo-tag sim">연결 실패 흉내</span>}
        {entry.simulated === 'response' && <span className="fdemo-tag sim">응답 흉내</span>}
      </div>
      <details open={open}>
        <summary>보낸 내용</summary>
        <Json value={entry.body} />
      </details>
      {entry.response !== undefined && (
        <details>
          <summary>받은 내용</summary>
          <Json value={entry.response} />
        </details>
      )}
    </div>
  );
}

function Inspector() {
  const entries = useSyncExternalStore(netlog.subscribe, netlog.getEntries);
  const { files, photos } = netlog.uploadCounts(entries);
  const appCount = entries.filter((e) => e.source === 'app').length;
  // 화면을 그리려고 불러오는 요청(GET)은 보낸 내용이 없어서 기본으로 접어 둔다.
  const [showGet, setShowGet] = useState(false);
  const hidden = (e: netlog.NetEntry) => !showGet && e.source === 'app' && e.method === 'GET' && !e.simulated;
  const list = [...entries].reverse().filter((e) => !hidden(e));
  const hiddenCount = entries.length - list.length;
  return (
    <details className="fdemo-inspector">
      <summary>
        서버로 간 내용 ({appCount}
        {entries.length > appCount ? ` · 화면 밖 ${entries.length - appCount}` : ''})
      </summary>
      <p className="fdemo-counts">
        <span className={files === 0 ? 'fdemo-tag ok' : 'fdemo-tag'}>파일 전송 {files}건</span>
        <span className={photos === 0 ? 'fdemo-tag ok' : 'fdemo-tag'}>장면 사진 {photos}장</span>
      </p>
      <p className="fdemo-muted">비밀번호·토큰·영수증은 ••••로 가려서 보여요. 이 내용은 이 탭에만 있고 어디에도 저장하지 않아요.</p>
      <label className="fdemo-check">
        <input type="checkbox" checked={showGet} onChange={(e) => setShowGet(e.target.checked)} />
        <span>화면을 그리려고 불러온 요청(GET)도 보기{hiddenCount > 0 ? ` (${hiddenCount}건 접힘)` : ''}</span>
      </label>
      {list.length === 0 ? (
        <p className="fdemo-muted">아직 보낸 요청이 없어요.</p>
      ) : (
        <ol className="fdemo-reqs">
          {list.map((e) => (
            <li key={e.id}>
              <RequestCard entry={e} />
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}

function Panel(p: Props) {
  const { view, scenario, phase } = p;
  const panelRef = useRef<HTMLElement>(null);
  const entries = useSyncExternalStore(netlog.subscribe, netlog.getEntries);
  const shown = view.requestId != null ? entries.find((e) => e.id === view.requestId) : undefined;
  const [collapsed, setCollapsed] = useState(false);

  // 패널 높이만큼 화면 아래 여백을 둔다(요소가 패널 뒤에 숨지 않게 domDriver도 이 값을 쓴다).
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const apply = () => document.body.style.setProperty('--fdemo-pad', `${Math.ceil(el.getBoundingClientRect().height) + 24}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.body.style.removeProperty('--fdemo-pad');
    };
  }, []);

  const running = view.status === 'running';
  const paused = view.status === 'paused' || view.status === 'interrupted';
  const preparing = phase === 'preparing' && !p.hasRunner;
  const cleaning = phase === 'cleaning';
  const done = p.result === 'done';
  const step = Math.min(view.index + 1, view.total);

  return (
    <aside ref={panelRef} className={`fdemo-panel${collapsed ? ' collapsed' : ''}`} aria-label="기능별 시연 안내">
      <p className="sr-only" aria-live="polite">
        {view.narration ? `${view.narration.title}. ${view.narration.body}` : ''}
      </p>
      <div className="fdemo-head">
        <span className="fdemo-badge">기능별로 보기</span>
        <span className="fdemo-title">{scenario.title}</span>
        {p.hasRunner && !done && (
          <span className="fdemo-count">
            {step}/{view.total}
          </span>
        )}
        <button type="button" className="fdemo-link" aria-expanded={!collapsed} onClick={() => setCollapsed((c) => !c)}>
          {collapsed ? '펼치기' : '접기'}
        </button>
      </div>

      {!collapsed && (
        <div className="fdemo-body">
          {cleaning ? (
            <p className="fdemo-status">시연 계정을 정리하고 있어요…</p>
          ) : preparing ? (
            p.prepError ? (
              <div className="fdemo-alert" role="alert">
                <p>{p.prepError}</p>
                <button type="button" className="btn small" onClick={p.onStop}>
                  메뉴로 돌아가기
                </button>
              </div>
            ) : (
              <p className="fdemo-status" role="status">
                {p.prepLabel}…
              </p>
            )
          ) : (
            <>
              {view.narration && (
                <div className="fdemo-bubble">
                  <h2>{view.narration.title}</h2>
                  <p>{view.narration.body}</p>
                  {view.narration.where && view.narration.where.length > 0 && (
                    <p className="fdemo-where">
                      {view.narration.where.map((w) => (
                        <span key={w} className={`fdemo-tag where-${w}`}>
                          {WHERE_LABEL[w]}
                        </span>
                      ))}
                    </p>
                  )}
                  {view.noRequest && <p className="fdemo-zero">서버로 간 요청 0건</p>}
                  {shown && <RequestCard entry={shown} open />}
                </div>
              )}

              {view.status === 'interrupted' && (
                <div className="fdemo-alert" role="status">
                  <p>직접 만지셔서 시연을 잠시 멈췄어요.</p>
                  <div className="fdemo-row">
                    <button type="button" className="btn small" onClick={p.onResume}>
                      이어 보기
                    </button>
                    <button type="button" className="btn small secondary" onClick={p.onStop}>
                      그만 보기
                    </button>
                  </div>
                </div>
              )}
              {view.status === 'error' && (
                <div className="fdemo-alert" role="alert">
                  <p>이 단계에서 멈췄어요. {view.error}</p>
                  <div className="fdemo-row">
                    <button type="button" className="btn small" onClick={() => p.onDecide('retry')}>
                      다시 해 보기
                    </button>
                    <button type="button" className="btn small secondary" onClick={() => p.onDecide('skip')}>
                      건너뛰고 계속
                    </button>
                  </div>
                </div>
              )}
              {done && (
                <div className="fdemo-alert done" role="status">
                  <p>다 봤어요. 메뉴로 돌아가면 이 시연에서 만든 계정과 기록을 지워요.</p>
                  <div className="fdemo-row">
                    <button type="button" className="btn small" onClick={p.onStop}>
                      메뉴로 돌아가기
                    </button>
                    <button type="button" className="btn small secondary" onClick={p.onReplay}>
                      다시 보기
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {!done && !cleaning && (
            <div className="fdemo-controls">
              {p.hasRunner && (
                <>
                  {paused ? (
                    <button type="button" className="btn small" onClick={p.onResume}>
                      계속
                    </button>
                  ) : (
                    <button type="button" className="btn small secondary" aria-disabled={!running} onClick={() => running && p.onPause()}>
                      일시정지
                    </button>
                  )}
                  <button type="button" className="btn small secondary" onClick={p.onSkip}>
                    건너뛰기
                  </button>
                  <button
                    type="button"
                    className="btn small secondary"
                    aria-label={`속도 ${view.speed}배, 눌러서 바꾸기`}
                    onClick={() => p.onSpeed(view.speed === 2 ? 1 : 2)}
                  >
                    {view.speed}x
                  </button>
                </>
              )}
              <button type="button" className="btn small danger" onClick={p.onStop}>
                그만 보기
              </button>
            </div>
          )}

          <Inspector />
        </div>
      )}
    </aside>
  );
}
