import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useDemo } from './DemoContext';
import { DEMO_STEPS } from './steps';
import './demo.css';

const NARROW = () => typeof window !== 'undefined' && window.innerWidth < 480;

/** 시연 중 화면 아래에 떠 있는 단계 안내. */
export default function DemoTour() {
  const { active, step, total, switching, mismatch, goTo, resume, end } = useDemo();
  // 좁은 화면에서는 화면을 덜 가리도록 접힌 채로 시작한다.
  const [collapsed, setCollapsed] = useState(NARROW);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [ending, setEnding] = useState(false);
  const panelRef = useRef<HTMLElement>(null);

  // 패널 높이만큼 화면 아래 여백을 둬서 면책 문구와 마지막 버튼이 가려지지 않게 한다.
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!active || !el) return;
    const apply = () => document.body.style.setProperty('--demo-pad', `${Math.ceil(el.getBoundingClientRect().height) + 24}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.body.style.removeProperty('--demo-pad');
    };
  }, [active]);

  useEffect(() => setConfirmEnd(false), [step]);

  if (!active) return null;
  const s = DEMO_STEPS[step];
  const last = step === total - 1;
  const busy = switching || ending;
  /** 누른 버튼이 disabled로 바뀌며 포커스를 잃지 않도록, 바쁠 때는 aria-disabled + 무시로 막는다. */
  const guard = (fn: () => void) => () => {
    if (!busy) fn();
  };

  async function finish() {
    setEnding(true);
    try {
      await end();
    } finally {
      setEnding(false);
    }
  }

  return (
    <aside ref={panelRef} className={`demo-panel${collapsed ? ' collapsed' : ''}`} aria-label="전체 흐름 보기 안내">
      <p className="sr-only" aria-live="polite">
        {`${step + 1}/${total}단계, ${s.title}`}
      </p>

      <div className="demo-head">
        <span className="demo-badge">{collapsed ? '전체 흐름 보기' : '전체 흐름 보기 · 데모 데이터'}</span>
        <span className="demo-count">
          {step + 1}/{total}
          {collapsed && ` · ${s.title}`}
        </span>
        <span className="demo-spacer" />
        <button
          type="button"
          className="demo-link"
          aria-expanded={!collapsed}
          aria-controls="demo-panel-body"
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? '펼치기' : '접기'}
        </button>
      </div>

      <div id="demo-panel-body" hidden={collapsed}>
        {mismatch && (
          <div className="demo-warn" role="status">
            <p>지금 로그인한 계정이 이 단계의 데모 계정과 달라요. 다른 탭에서 로그인·로그아웃했을 수 있어요.</p>
            <button type="button" className="btn small" aria-disabled={busy} onClick={guard(() => void resume())}>
              데모 계정으로 이어 보기
            </button>
          </div>
        )}

        <h2>{s.title}</h2>
        {s.body.map((line) => (
          <p key={line}>{line}</p>
        ))}
        {s.tip && <div className="demo-tip">{s.tip}</div>}

        <ol className="demo-dots" aria-label="단계 바로 가기">
          {DEMO_STEPS.map((d, i) => (
            <li key={d.key}>
              <button
                type="button"
                className={`demo-dot${i < step ? ' done' : ''}`}
                aria-current={i === step ? 'step' : undefined}
                aria-label={`${i + 1}단계: ${d.title}`}
                aria-disabled={busy}
                title={d.title}
                onClick={guard(() => void goTo(i))}
              >
                <span aria-hidden="true" />
              </button>
            </li>
          ))}
        </ol>

        <div className="demo-actions">
          <button
            type="button"
            className="btn secondary"
            aria-disabled={busy || step === 0}
            onClick={guard(() => step > 0 && void goTo(step - 1))}
          >
            이전
          </button>
          {last ? (
            <button type="button" className="btn" aria-disabled={busy} onClick={guard(() => void goTo(0))}>
              처음부터 다시
            </button>
          ) : (
            <button type="button" className="btn" aria-disabled={busy} onClick={guard(() => void goTo(step + 1))}>
              {switching ? '화면 바꾸는 중…' : '다음'}
            </button>
          )}
        </div>

        <div className="demo-end">
          {confirmEnd ? (
            <>
              <span>데모 계정과 예시 기록을 모두 지울까요?</span>
              <button type="button" className="btn small danger" aria-disabled={busy} onClick={guard(() => void finish())}>
                {ending ? '정리하는 중…' : '네, 끝내기'}
              </button>
              <button type="button" className="btn small ghost" onClick={() => setConfirmEnd(false)}>
                계속 보기
              </button>
            </>
          ) : (
            <button type="button" className="demo-link" onClick={() => setConfirmEnd(true)}>
              데모 끝내기
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
