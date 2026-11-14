import { useEffect, useRef, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, api } from '../../api/client';
import type { Child } from '../../api/types';
import { BackLink, Field, refocus, useToast } from '../../components/feedback';
import { ErrorText, Loading, useLoad } from '../../components/ui';
import { YEAR_MONTH, ageHint, birthError, birthRange } from './childForm';

interface FieldErrors {
  nickname?: string;
  birth?: string;
}

/**
 * 아이 정보(별칭·태어난 해와 달) 고치기. 바뀐 칸만 PATCH로 보낸다.
 * 법정대리인 동의는 등록할 때 받았으므로 여기서는 다시 받지 않는다.
 */
export default function ChildEdit() {
  const { childId } = useParams();
  const id = Number(childId);
  const home = `/p/children/${id}`;
  const nav = useNavigate();
  const toast = useToast();
  const child = useLoad(() => api<Child>('GET', `/children/${id}`), [id]);
  const [nickname, setNickname] = useState('');
  const [birth, setBirth] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const nicknameRef = useRef<HTMLInputElement>(null);
  const birthRef = useRef<HTMLInputElement>(null);

  // 불러온 값으로 칸을 채운다(이 아이를 처음 불러왔을 때 한 번).
  const filledFor = useRef<number | null>(null);
  useEffect(() => {
    const c = child.data;
    if (!c || c.id !== id || filledFor.current === id) return;
    filledFor.current = id;
    setNickname(c.nickname);
    setBirth(c.birthYearMonth);
  }, [child.data, id]);

  if (child.loading && !child.data) return <Loading />;
  if (child.error || !child.data) {
    return (
      <div>
        <BackLink to="/p" label="우리 아이" />
        <h1>아이 정보 고치기</h1>
        <ErrorText error={child.error ?? new Error('아이 정보를 찾을 수 없어요.')} />
        <div className="stack">
          <button type="button" className="btn block secondary" onClick={child.reload}>
            다시 불러오기
          </button>
          <Link to="/p" className="btn block ghost">
            우리 아이 목록으로
          </Link>
        </div>
      </div>
    );
  }
  const c = child.data;
  const { min: minMonth, max: maxMonth } = birthRange();
  const birthOk = YEAR_MONTH.test(birth) && !birthError(birth);

  function clear(key: keyof FieldErrors) {
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
    if (error) setError(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const next: FieldErrors = {
      nickname: nickname.trim() ? undefined : '별칭을 써 주세요.',
      // 원래 값 그대로라면(오래전에 등록해 지금 범위를 벗어났어도) 다시 묻지 않는다.
      birth: birth === c.birthYearMonth ? undefined : birthError(birth),
    };
    if (next.nickname || next.birth) {
      flushSync(() => {
        setErrors(next);
        setError(null);
      });
      refocus(next.nickname ? nicknameRef.current : birthRef.current);
      return;
    }
    const body: { nickname?: string; birthYearMonth?: string } = {};
    if (nickname.trim() !== c.nickname) body.nickname = nickname.trim();
    if (birth !== c.birthYearMonth) body.birthYearMonth = birth;
    if (Object.keys(body).length === 0) {
      toast('바뀐 내용이 없어요.');
      nav(home, { replace: true });
      return;
    }
    setErrors({});
    setBusy(true);
    setError(null);
    try {
      const saved = await api<Child>('PATCH', `/children/${id}`, body);
      child.setData(saved);
      toast(`${saved.nickname} 정보를 고쳤어요.`);
      nav(home, { replace: true });
    } catch (err) {
      // 서버가 칸을 짚어 준 오류는 그 칸 아래에 보인다.
      const field = err instanceof ApiError ? err.fieldErrors[0] : undefined;
      if (field && (field.field === 'nickname' || field.field === 'birthYearMonth')) {
        const key: keyof FieldErrors = field.field === 'nickname' ? 'nickname' : 'birth';
        flushSync(() => setErrors({ [key]: field.message }));
        refocus(key === 'nickname' ? nicknameRef.current : birthRef.current);
      } else {
        setError(err);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <BackLink to={home} label={c.nickname} />
      <h1>아이 정보 고치기</h1>
      <p className="lead">실명 대신 집에서 부르는 별칭을 써 주세요.</p>
      <form onSubmit={submit} noValidate>
        <Field
          ref={nicknameRef}
          id="child-edit-nickname"
          data-demo="child-edit-nickname"
          label="별칭"
          type="text"
          maxLength={20}
          showCount
          autoComplete="off"
          value={nickname}
          onChange={(e) => {
            setNickname(e.target.value);
            clear('nickname');
          }}
          error={errors.nickname}
        />
        <Field
          ref={birthRef}
          id="child-edit-birth"
          data-demo="child-edit-birth"
          label="태어난 해와 달"
          type="month"
          min={minMonth}
          max={maxMonth}
          placeholder="예: 2024-08"
          value={birth}
          onChange={(e) => {
            setBirth(e.target.value);
            clear('birth');
          }}
          hint={birthOk ? ageHint(birth) : undefined}
          error={errors.birth}
        />
        <ErrorText error={error} />
        <div className="stack">
          <button type="submit" className="btn block" data-demo="child-edit-submit" disabled={busy}>
            {busy ? '저장하는 중…' : '저장하기'}
          </button>
          <Link to={home} className="btn block ghost">
            취소
          </Link>
        </div>
      </form>
    </div>
  );
}
