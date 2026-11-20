import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { Link, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { mascotSrc } from './Mascot';
import { ErrorText } from './ui';

/*
 * 화면들이 같이 쓰는 상호작용 부품: 짧은 알림(토스트), 되돌릴 수 없는 동작의 확인 상자, 뒤로 줄,
 * 입력칸(도움말·오류·글자 수), 비밀번호 보기, 화면을 옮길 때의 포커스.
 * 모양은 styles.css의 'UX 보조' 블록에 있다.
 */

// ---------- 짧은 알림 ----------

const ToastContext = createContext<(message: string) => void>(() => undefined);

/** 저장 같은 동작이 끝났음을 잠깐 알린다. 화면을 옮겨도 남아 있고, 같은 문장이 다시 와도 다시 읽힌다. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  const timers = useRef<number[]>([]);

  const show = useCallback((next: string) => {
    timers.current.forEach((t) => window.clearTimeout(t));
    setMessage('');
    // 한 번 비웠다가 넣어야 같은 문장도 화면 낭독기가 다시 읽는다.
    timers.current = [
      window.setTimeout(() => setMessage(next), 60),
      window.setTimeout(() => setMessage(''), 60 + 2800),
    ];
  }, []);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {/* 알림 영역은 비어 있어도 늘 둔다(그래야 새 문장이 읽힌다). */}
      <div className={message ? 'toast show' : 'toast'} role="status" aria-live="polite">
        {/* 알림과 함께 톡 튀어 나오는 작은 모찌(꾸밈). 문장이 있을 때만 그린다(새 알림마다 다시 튀어 나오게). */}
        {message && <img className="toast-mochi" src={mascotSrc('dome')} alt="" aria-hidden="true" width={26} height={21} />}
        {message}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

// ---------- 화면을 옮길 때 ----------

/**
 * 새 화면으로 가면 맨 위로 올리고, 화면 제목(h1)에 포커스를 둬서 화면 낭독기가 새 화면을 알린다.
 * 뒤로 가기(POP)는 브라우저가 스크롤을 되돌리게 둔다. 처음 열 때는 포커스를 옮기지 않는다.
 */
export function useRouteFocus() {
  const { pathname } = useLocation();
  const type = useNavigationType();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (type !== 'POP') window.scrollTo(0, 0);
    let tries = 0;
    let timer = 0;
    const tryFocus = () => {
      const active = document.activeElement;
      // 화면이 이미 다른 칸에 포커스를 줬으면 건드리지 않는다.
      if (active && active !== document.body && document.contains(active) && active.closest('main')) return;
      const h1 = document.querySelector<HTMLElement>('main h1');
      if (h1) {
        if (!h1.hasAttribute('tabindex')) h1.setAttribute('tabindex', '-1');
        h1.focus({ preventScroll: true });
        return;
      }
      // 불러오는 중이라 제목이 아직 없으면 잠시 뒤 다시 본다.
      if (tries++ < 8) timer = window.setTimeout(tryFocus, 150);
    };
    timer = window.setTimeout(tryFocus, 0);
    return () => window.clearTimeout(timer);
  }, [pathname, type]);
}

// ---------- 뒤로 줄 ----------

/**
 * 하위 화면 맨 위의 '‹ 이전 화면' 줄. 홈 화면에 설치한 앱에는 브라우저 뒤로 버튼이 없어서 둔다.
 * `to`가 있으면 그 화면으로, 없으면 앱 안에서 온 곳으로 돌아가고(처음 연 화면이면 `fallback`으로) 간다.
 */
export function BackLink({ to, label, fallback = '/' }: { to?: string; label?: string; fallback?: string }) {
  const nav = useNavigate();
  const loc = useLocation();
  const text = (
    <>
      <span aria-hidden="true">‹</span> {label ?? '뒤로'}
    </>
  );
  if (to) {
    return (
      <Link to={to} className="back-link">
        {text}
      </Link>
    );
  }
  const inApp = loc.key !== 'default';
  return (
    <button type="button" className="back-link" onClick={() => (inApp ? nav(-1) : nav(fallback))}>
      {text}
    </button>
  );
}

// ---------- 되돌릴 수 없는 동작 ----------

interface DangerActionProps {
  /** 처음 보이는 버튼 글자(예: '삭제', '연결 해제'). */
  label: string;
  triggerClassName?: string;
  /** 확인 상자의 질문(예: '정말 삭제할까요?'). */
  question: string;
  /** 무엇이 사라지는지. 질문 뒤에 이어 붙는다. */
  detail?: ReactNode;
  /** 확인 버튼 글자 — 처음 버튼과 같은 동사로(예: '삭제하기'). */
  confirmLabel: string;
  busyLabel?: string;
  /** 확인했을 때 할 일. 던진 오류는 상자 안에 보여 주고 상자를 닫지 않는다. */
  onConfirm: () => Promise<unknown> | unknown;
  /** 확인 상자 안에 더 둘 입력칸(예: 비밀번호 확인). 있으면 첫 칸에 포커스를 준다. */
  children?: ReactNode;
  confirmDisabled?: boolean;
  /** 처음 버튼을 무엇에 대한 것인지 설명하는 요소 id(예: 목록 행의 제목). */
  describedBy?: string;
  /** 확인 상자 이름 앞에 붙일 요소 id(예: 선생님 이름) — 여러 행에 같은 상자가 있을 때 구별된다. */
  labelledBy?: string;
  /** 시연·자동 확인용 data-demo 이름. 처음 버튼에 그대로, 확인·취소 버튼에는 '-confirm'·'-cancel'을 붙여 단다. */
  demo?: string;
}

/**
 * 두 단계 확인. 처음 버튼을 누르면 그 자리에 '질문 + 사라지는 것 + [취소][확인]' 상자가 열리고,
 * 열려 있는 동안 처음 버튼은 숨긴다. 열리면 취소(또는 첫 입력칸)로, 취소하면 처음 버튼으로 포커스가 돌아간다.
 */
export function DangerAction({
  label,
  triggerClassName = 'btn danger block',
  question,
  detail,
  confirmLabel,
  busyLabel,
  onConfirm,
  children,
  confirmDisabled,
  describedBy: triggerDescribedBy,
  labelledBy,
  demo,
}: DangerActionProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const backToTrigger = useRef(false);
  const alive = useRef(true);
  const qid = useId();

  // 붙을 때마다 다시 true로 둔다(개발 모드의 StrictMode는 붙였다 떼었다 다시 붙여서, 떼는 데서만 바꾸면 false로 남는다).
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (open) {
      const field = boxRef.current?.querySelector<HTMLElement>('input, textarea, select');
      (field ?? cancelRef.current)?.focus();
    } else if (backToTrigger.current) {
      backToTrigger.current = false;
      triggerRef.current?.focus();
    }
  }, [open]);

  async function confirm() {
    // 요청 중에는 버튼을 aria-disabled로만 막으므로(포커스 유지) 겹친 누름은 여기서 무시한다.
    if (busy || confirmDisabled) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (e) {
      if (alive.current) setError(e);
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        aria-describedby={triggerDescribedBy}
        data-demo={demo}
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
    );
  }
  return (
    <div className="confirm" role="group" aria-labelledby={describedBy(labelledBy, qid)} ref={boxRef}>
      {/* 상자 위 테두리 너머로 내다보는 모찌(꾸밈). 상자 밖이라 글·버튼을 가리지 않는다. */}
      <span className="confirm-peek" aria-hidden="true">
        <img src={mascotSrc('friend')} alt="" width={40} height={31} />
      </span>
      <p id={qid}>
        <strong>{question}</strong>
        {detail ? <> {detail}</> : null}
      </p>
      {children}
      <ErrorText error={error} />
      <div className="row">
        <button
          ref={cancelRef}
          type="button"
          className="btn secondary"
          data-demo={demo && `${demo}-cancel`}
          onClick={() => {
            backToTrigger.current = true;
            setError(null);
            setOpen(false);
          }}
        >
          취소
        </button>
        <button
          type="button"
          className="btn danger"
          data-demo={demo && `${demo}-confirm`}
          disabled={confirmDisabled}
          aria-disabled={busy || undefined}
          onClick={() => void confirm()}
        >
          {busy ? (busyLabel ?? '처리하는 중…') : confirmLabel}
        </button>
      </div>
    </div>
  );
}

// ---------- 입력칸 ----------

/** aria-describedby 값: 지금 화면에 있는 id만 잇는다. 없으면 속성을 빼도록 undefined. */
export function describedBy(...ids: unknown[]) {
  const s = ids.filter((x): x is string => typeof x === 'string' && x !== '').join(' ');
  return s || undefined;
}

/**
 * 칸에 포커스를 줘서 이름·오류가 다시 읽히게 한다. 이미 그 칸에 있으면(Enter로 제출) 한 번 놓았다가 잡는다.
 */
export function refocus(el: HTMLElement | null | undefined) {
  if (!el) return;
  if (el.ownerDocument.activeElement === el) el.blur();
  el.focus();
}

interface FieldExtras {
  id: string;
  label: ReactNode;
  /** 칸 아래 도움말(문장). */
  hint?: ReactNode;
  /** 칸 아래 오류 문장. 있으면 aria-invalid와 함께 읽힌다. */
  error?: string | null;
  /** maxLength가 있을 때 '12/60' 글자 수를 보인다. */
  showCount?: boolean;
}

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & FieldExtras;

/** 이름이 보이는 입력칸 + 아래 도움말·오류·글자 수. */
export const Field = forwardRef<HTMLInputElement, InputProps>(function Field(
  { id, label, hint, error, showCount, ...input },
  ref,
) {
  const count = showCount && input.maxLength ? `${String(input.value ?? '').length}/${input.maxLength}` : null;
  return (
    <>
      <label className="field">
        <span>{label}</span>
        <input
          ref={ref}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(hint && `${id}-hint`, error && `${id}-err`)}
          {...input}
        />
      </label>
      {hint && (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="error field-error" id={`${id}-err`}>
          {error}
        </p>
      )}
      {count && (
        <p className="counter" aria-hidden="true">
          {count}
        </p>
      )}
    </>
  );
});

type TextAreaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> & FieldExtras;

/** 이름이 보이는 여러 줄 입력칸 + 아래 도움말·오류·글자 수. */
export const TextAreaField = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextAreaField(
  { id, label, hint, error, showCount, ...input },
  ref,
) {
  const count = showCount && input.maxLength ? `${String(input.value ?? '').length}/${input.maxLength}` : null;
  return (
    <>
      <label className="field">
        <span>{label}</span>
        <textarea
          ref={ref}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(hint && `${id}-hint`, error && `${id}-err`)}
          {...input}
        />
      </label>
      {hint && (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="error field-error" id={`${id}-err`}>
          {error}
        </p>
      )}
      {count && (
        <p className="counter" aria-hidden="true">
          {count}
        </p>
      )}
    </>
  );
});

/** 비밀번호 칸 + '보기/숨기기' 버튼(칸 오른쪽 안). 버튼은 label 밖에 둔다. */
export const PasswordField = forwardRef<HTMLInputElement, Omit<InputProps, 'type' | 'showCount'>>(function PasswordField(
  { id, label, hint, error, ...input },
  ref,
) {
  const [shown, setShown] = useState(false);
  return (
    <div className="pw-field">
      <label className="field">
        <span>{label}</span>
        <input
          ref={ref}
          id={id}
          type={shown ? 'text' : 'password'}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(hint && `${id}-hint`, error && `${id}-err`)}
          {...input}
        />
      </label>
      <button
        type="button"
        className="btn small ghost pw-toggle"
        aria-controls={id}
        aria-label={shown ? '비밀번호 숨기기' : '비밀번호 보기'}
        onClick={() => setShown((v) => !v)}
      >
        {shown ? '숨기기' : '보기'}
      </button>
      {hint && (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="error field-error" id={`${id}-err`}>
          {error}
        </p>
      )}
    </div>
  );
});

/** 이메일 모양만 본다(실제 확인은 서버). */
export function looksLikeEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}
