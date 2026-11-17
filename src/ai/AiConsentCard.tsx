import { useId, useRef, useState } from 'react';
import { ApiError, api, errorMessage } from '../api/client';
import type { AiConsent } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { formatDate } from '../components/ui';
import { aiConsentState } from './consentState';
import './ai.css';

interface Props {
  childId: number;
  nickname: string;
  consent: AiConsent;
  /**
   * AI 서버가 꺼져 있어서 지금은 새 관찰 기록을 만들 수 없다. 이미 켜 둔 동의는 그대로 보이고 끌 수 있어야 하므로
   * 켜진 카드에 그 사실만 덧붙인다(처음부터 꺼진 카드는 이때 그리지 않는 것이 맞다: 서버가 새 동의를 받지 않는다).
   * 동의 문서가 바뀌어 꺼진 카드는 이때도 그린다: 다시 켤 수는 없지만 기록을 지우고 동의를 거둘 수는 있다.
   */
  paused?: boolean;
  /** 켜거나 끈 뒤의 새 동의 상태 */
  onChange: (next: AiConsent) => void;
}

/** 무엇이 어디로 가고 언제 지워지는지(명세 2장 1번). 켜기 전에도, 켠 뒤에도 같은 내용을 보여 준다. */
function ConsentFacts() {
  return (
    <dl className="ai-facts" data-demo="ai-facts">
      <dt>무엇을 보내나요</dt>
      <dd>장면 사진 최대 6장이에요. 소리는 보내지 않고, 영상 원본도 보내지 않아요.</dd>
      <dt>어디로 가나요</dt>
      <dd>함께자람 AI 서버로 가요. AI가 사진을 보고 아이와 어른의 모습을 짧은 글로 적어요.</dd>
      <dt>언제 지워지나요</dt>
      <dd>살펴본 직후에 바로 지워요. 사진은 어디에도 저장하지 않아요.</dd>
      <dt>무엇이 남나요</dt>
      <dd>AI가 적은 글(관찰 기록)만 남아요. 기본적으로 보호자만 볼 수 있어요.</dd>
      <dt>끄고 싶을 때는요</dt>
      <dd>언제든 끌 수 있어요. 끄면 그동안 쌓인 AI 관찰 기록이 모두 지워져요.</dd>
    </dl>
  );
}

/**
 * 아이별 'AI 관찰 기록' 동의 카드. 상태(consentState.ts)에 따라 세 가지로 그린다.
 * - 켜짐: 동의한 내용을 다시 볼 수 있고, 확인을 한 번 거쳐 끈다(끄면 서버가 그 아이의 AI 관찰 기록을 모두 지운다).
 * - 처음 꺼짐: 동의 내용을 읽고 체크한 뒤 켠다.
 * - 동의 문서가 바뀌어 꺼짐: 왜 꺼졌는지 알리고, 바뀐 내용을 읽고 다시 켜거나, 다시 동의하지 않고 끌 수 있다
 *   (끄면 기록이 모두 지워진다). 그동안 쌓인 기록은 아이 홈의 목록에서 보고 지운다.
 */
export default function AiConsentCard({ childId, nickname, consent, paused = false, onChange }: Props) {
  const { policies, reloadPolicies } = useAuth();
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const headingId = useId();
  const version = policies?.aiAnalysisVersion ?? '';
  const state = aiConsentState(consent);

  async function run(fn: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await fn();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function turnOn() {
    if (!checked || !version) return;
    void run(async () => {
      try {
        const saved = await api<AiConsent | undefined>('PUT', `/children/${childId}/ai-consent`, { agreed: true, version });
        setOpen(false);
        setChecked(false);
        onChange({
          agreed: true,
          version: saved?.version ?? version,
          agreedAt: saved?.agreedAt ?? new Date().toISOString(),
        });
      } catch (e) {
        if (e instanceof ApiError && e.code === 'AI_CONSENT_VERSION_MISMATCH') {
          // 동의 내용이 바뀐 경우: 새 버전을 받아 온 뒤 다시 읽고 체크하게 한다.
          setChecked(false);
          reloadPolicies();
          setError('동의 내용이 새로 바뀌었어요. 내용을 다시 읽고 체크해 주세요.');
        } else {
          setError(`AI 관찰 기록을 켜지 못했어요. 잠시 후 다시 시도해 주세요. (${errorMessage(e)})`);
        }
      }
    });
  }

  function turnOff() {
    void run(async () => {
      try {
        await api('DELETE', `/children/${childId}/ai-consent`);
        setConfirmOff(false);
        setOpen(false);
        setChecked(false);
        onChange({ agreed: false, version: null, agreedAt: null });
      } catch (e) {
        setError(
          state === 'on'
            ? `AI 관찰 기록을 끄지 못했어요. 지금은 그대로 켜져 있어요. 잠시 후 다시 시도해 주세요. (${errorMessage(e)})`
            : `기록을 지우지 못했어요. 그동안 쌓인 AI 관찰 기록은 그대로 있어요. 잠시 후 다시 시도해 주세요. (${errorMessage(e)})`,
        );
      }
    });
  }

  const errorLine = error && (
    <p className="error" role="alert">
      {error}
    </p>
  );

  /** 끄기: 확인을 한 번 거친다. 켜진 카드와 '동의 문서가 바뀌어 꺼진' 카드가 함께 쓴다(시연 표식도 같다). */
  const offControl = (text: { trigger: string; question: string; cancel: string; groupLabel: string }) =>
    confirmOff ? (
      <div className="ai-confirm" role="group" aria-label={text.groupLabel}>
        <p>{text.question}</p>
        <div className="row">
          <button
            type="button"
            className="btn secondary ai-tap"
            style={{ flex: 1 }}
            disabled={busy}
            data-demo="ai-off-cancel"
            onClick={() => setConfirmOff(false)}
          >
            {text.cancel}
          </button>
          <button
            type="button"
            className="btn danger ai-tap"
            style={{ flex: 1 }}
            disabled={busy}
            data-demo="ai-off-confirm"
            onClick={turnOff}
          >
            {busy ? '끄는 중…' : '끄고 기록 지우기'}
          </button>
        </div>
      </div>
    ) : (
      <button type="button" className="btn small ghost ai-tap" data-demo="ai-off" onClick={() => setConfirmOff(true)}>
        {text.trigger}
      </button>
    );

  /** 켜기: 동의 내용을 읽고 체크한 뒤 켠다. 처음 켤 때와 바뀐 내용에 다시 동의할 때가 함께 쓴다. */
  const agreeForm = (
    <div>
      <ConsentFacts />
      <label className="check">
        <input
          type="checkbox"
          required
          data-demo="ai-check"
          checked={checked}
          disabled={busy}
          onChange={(e) => setChecked(e.target.checked)}
        />
        <span>
          <strong>
            [필수] 저는 {nickname}의 법정대리인이며, 위 내용을 확인하고 장면 사진을 AI 서버로 보내 살펴보는 데
            동의해요.
          </strong>
        </span>
      </label>
      {!version && (
        <p className="muted" role="status">
          동의 내용을 불러오는 중이에요. 잠시만 기다려 주세요.
        </p>
      )}
      {errorLine}
      <div className="row" style={{ marginTop: 8 }}>
        <button
          type="button"
          className="btn secondary"
          style={{ flex: 1 }}
          disabled={busy}
          data-demo="ai-later"
          onClick={() => {
            setOpen(false);
            setChecked(false);
            setError(null);
          }}
        >
          나중에
        </button>
        <button
          type="button"
          className="btn"
          style={{ flex: 1 }}
          disabled={busy || !checked || !version}
          data-demo="ai-agree"
          onClick={turnOn}
        >
          {busy ? '켜는 중…' : '동의하고 켜기'}
        </button>
      </div>
      {version && <p className="muted" style={{ marginBottom: 0 }}>동의 내용 버전 {version}</p>}
    </div>
  );

  if (state === 'on') {
    return (
      <section className="card" aria-labelledby={headingId}>
        <div className="row between wrap" style={{ marginBottom: 6 }}>
          <h2 id={headingId} style={{ margin: 0 }}>
            AI 관찰 기록
          </h2>
          <span className="chip brand">✓ 켜져 있어요</span>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          장면 사진 최대 6장을 AI 서버로 보내 살펴보고, 살펴본 직후 사진을 지워요. 소리는 보내지 않아요.
          {consent.agreedAt && ` ${formatDate(consent.agreedAt)}에 동의했어요.`}
        </p>
        {paused && (
          <p className="notice" style={{ marginBottom: 10 }}>
            지금은 AI 서버가 쉬고 있어서 새 관찰 기록은 만들 수 없어요. 그동안 쌓인 기록은 그대로 보고 지울 수 있고,
            여기서 끌 수도 있어요.
          </p>
        )}
        <details>
          <summary>동의한 내용 다시 보기</summary>
          <ConsentFacts />
          {consent.version && <p className="muted">동의 내용 버전 {consent.version}</p>}
        </details>
        {errorLine}
        {offControl({
          trigger: 'AI 관찰 기록 끄기',
          question: `끄면 ${nickname}의 AI 관찰 기록이 모두 지워지고 되돌릴 수 없어요. 함께한 시간 같은 숫자 기록과 코칭 카드는 그대로 남아요. 끌까요?`,
          cancel: '계속 켜 두기',
          groupLabel: 'AI 관찰 기록 끄기 확인',
        })}
      </section>
    );
  }

  if (state === 'outdated') {
    // 동의는 거두지 않았는데 동의 문서 버전이 바뀌었다. 서버는 다시 동의하기 전까지 분석 토큰을 주지 않는다.
    return (
      <section className="card soft" aria-labelledby={headingId} data-demo="ai-card-outdated">
        <div className="row between wrap" style={{ marginBottom: 6 }}>
          <h2 id={headingId} style={{ margin: 0 }}>
            AI 관찰 기록
          </h2>
          <span className="chip">다시 동의가 필요해요</span>
        </div>
        <p style={{ marginTop: 0 }}>
          AI 관찰 기록의 동의 내용이 바뀌어서 지금은 꺼져 있어요. 다시 동의하기 전에는 장면 사진을 한 장도 보내지
          않아요.
        </p>
        <p className="ai-kept">
          그동안 쌓인 {nickname}의 AI 관찰 기록은 지워지지 않았어요. 이 화면의 'AI 관찰 기록' 목록에서 보거나 하나씩
          지울 수 있어요.
          {consent.agreedAt && ` 예전 내용(버전 ${consent.version})에는 ${formatDate(consent.agreedAt)}에 동의했어요.`}
        </p>
        {paused ? (
          <p className="notice" style={{ marginBottom: 10 }}>
            지금은 AI 서버가 쉬고 있어서 다시 켤 수 없어요. 그동안 쌓인 기록은 그대로 보고 지울 수 있고, 여기서 끄고
            기록을 모두 지울 수도 있어요.
          </p>
        ) : open ? (
          <>
            <p style={{ fontWeight: 600 }}>바뀐 동의 내용이에요. 다시 읽고 정해 주세요.</p>
            {agreeForm}
          </>
        ) : (
          <button type="button" className="btn block" data-demo="ai-open" onClick={() => setOpen(true)}>
            바뀐 내용 읽고 다시 켜기
          </button>
        )}
        {/* 동의 내용을 읽는 동안에는 끄기를 접어 둔다(오류 문장도 한 군데에만 보인다). '나중에'를 누르면 다시 나온다. */}
        {(paused || !open) && (
          <div style={{ marginTop: 10 }}>
            {errorLine}
            {offControl({
              trigger: '다시 동의하지 않고 끄기',
              question: `다시 동의하지 않고 끄면 ${nickname}의 AI 관찰 기록이 모두 지워지고 되돌릴 수 없어요. 함께한 시간 같은 숫자 기록은 그대로 남아요. 끌까요?`,
              cancel: '그대로 두기',
              groupLabel: 'AI 관찰 기록 끄고 기록 지우기 확인',
            })}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="card soft" aria-labelledby={headingId} data-demo="ai-card">
      <h2 id={headingId}>AI 관찰 기록</h2>
      <p style={{ marginTop: 0 }}>
        AI가 장면 사진을 보고 아이와 어른의 모습을 짧은 글로 적어 드려요. 지금은 꺼져 있어서 사진을 한 장도 보내지
        않아요.
      </p>
      {!open ? (
        <button type="button" className="btn block" data-demo="ai-open" onClick={() => setOpen(true)}>
          AI 관찰 기록 켜기
        </button>
      ) : (
        agreeForm
      )}
    </section>
  );
}
