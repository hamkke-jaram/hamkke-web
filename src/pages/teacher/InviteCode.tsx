import { useRef, useState, type CSSProperties, type ChangeEvent, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ApiError, api, errorMessage } from '../../api/client';
import type { TeacherChild } from '../../api/types';
import SubHead from '../../components/SubHead';
import { buddy } from '../../components/buddyBus';
import { Field, refocus, useToast } from '../../components/feedback';
import { ErrorText } from '../../components/ui';
import { rememberChild } from './storyUtils';
import './teacher.css';

const CODE_SHORT = '8자리 코드를 모두 입력해 주세요.';
/** 코드 자체가 문제인 서버 오류. 이것만 입력칸 아래에 보이고, 연결·서버 문제는 버튼 위에 따로 보인다. */
const CODE_ERRORS = ['INVITE_CODE_INVALID', 'ALREADY_LINKED', 'VALIDATION_FAILED'];
/** 쓴 코드는 한 글자씩 맞춰 보기 쉽게(디자인 시스템: 초대 코드는 tabular-nums). 빈 칸의 안내 문구에는 쓰지 않는다. */
const CODE_STYLE: CSSProperties = { fontWeight: 700, letterSpacing: '0.08em', fontVariantNumeric: 'tabular-nums' };

/** 대문자로 바꾸고 A–Z·0–9만 남긴다(서버도 '-'와 공백을 빼고 대문자로 맞춘다). */
export function codeChars(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** 'abcd2345' → 'ABCD-2345'. 다섯 번째 글자가 생길 때 '-'를 넣는다(4글자에서 바로 넣으면 지우기가 막힌다). */
export function formatCode(value: string) {
  const raw = codeChars(value).slice(0, 8);
  return raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
}

/**
 * Figma '보호자 초대코드': 선생님, 안녕하세요 → 초대 코드로 아이 연결 → 연결하기.
 * 연결된 아이가 없을 때 선생님 홈(/t)이 이 화면이고, 아이가 있으면 떠 있는 버튼의 '아이 추가하기'(/t/link)로 온다.
 * 연결하면 그 아이를 고른 채로 선생님 홈으로 간다.
 */
export default function InviteCode({ closable = false, onLinked }: { closable?: boolean; onLinked?: () => void }) {
  const nav = useNavigate();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [formError, setFormError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  function onCode(e: ChangeEvent<HTMLInputElement>) {
    const el = e.target;
    // 8자리가 다 찬 코드에 글자를 더하면 받지 않는다(뒤 글자를 몰래 잘라 다른 코드가 되지 않게).
    // 값을 바꾸지 않으면 React가 원래 값으로 되돌리므로, 커서만 넣으려던 자리로 돌려놓는다.
    if (codeChars(el.value).length > 8 && codeChars(code).length === 8) {
      const caret = Math.max(0, (el.selectionStart ?? el.value.length) - (el.value.length - code.length));
      requestAnimationFrame(() => {
        if (el.ownerDocument.activeElement === el) el.setSelectionRange(caret, caret);
      });
      return;
    }
    const next = formatCode(el.value);
    // 모양을 맞추면 커서가 끝으로 튄다. 가운데를 고쳐도 고친 자리에 커서가 남도록, 그려진 뒤에 되돌려 놓는다.
    const before = Math.min(8, codeChars(el.value.slice(0, el.selectionStart ?? el.value.length)).length);
    const pos = Math.min(next.length, before > 4 ? before + 1 : before);
    setCode(next);
    if (codeError) setCodeError(null);
    if (formError) setFormError(null);
    requestAnimationFrame(() => {
      if (el.ownerDocument.activeElement === el) el.setSelectionRange(pos, pos);
    });
  }

  /** 입력칸 아래에 오류를 보이고, 오류 문장이 화면에 붙은 뒤 칸으로 포커스를 옮겨 함께 읽히게 한다. */
  function fail(message: string) {
    flushSync(() => {
      setCodeError(message);
      setFormError(null);
    });
    refocus(codeRef.current);
  }

  async function link(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (codeChars(code).length < 8) {
      fail(CODE_SHORT);
      return;
    }
    setBusy(true);
    setCodeError(null);
    setFormError(null);
    try {
      const c = await api<TeacherChild>('POST', '/teacher/links', { code });
      rememberChild(c.id);
      toast(`연결했어요. ${c.nickname} 이야기를 써 보세요.`);
      buddy.emit('wave');
      if (onLinked) onLinked();
      else nav('/t', { replace: closable });
    } catch (err) {
      // 인터넷 연결·서버·시도 횟수 문제는 코드가 틀린 게 아니므로 칸을 오류로 표시하지 않는다.
      if (err instanceof ApiError && CODE_ERRORS.includes(err.code)) fail(errorMessage(err));
      else setFormError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="invite-page">
      {closable && <SubHead title="아이 추가하기" icon="close" fallback="/t" />}
      <h1 className="invite-title">선생님, 안녕하세요</h1>
      <p className="invite-lead">보호자가 공유한 기록만 주 단위로 볼 수 있어요.</p>
      <form className="invite-form" onSubmit={link} noValidate>
        <Field
          id="th-code"
          data-demo="th-code"
          ref={codeRef}
          label="초대 코드로 아이 연결"
          hint="보호자에게 받은 8자리 코드예요."
          error={codeError}
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="예: ABCD-2345"
          style={code ? CODE_STYLE : undefined}
          value={code}
          onChange={onCode}
        />
        <div className="invite-actions">
          <ErrorText error={formError} />
          <button type="submit" className="btn block" data-demo="th-link-submit" aria-disabled={busy || undefined}>
            {busy ? '연결하는 중…' : '연결하기'}
          </button>
        </div>
      </form>
    </div>
  );
}
