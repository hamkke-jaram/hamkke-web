import { useRef, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import type { Child } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import Mascot from '../../components/Mascot';
import { BackLink, Field, describedBy, refocus, useToast } from '../../components/feedback';
import { ErrorText, Loading, useLoad } from '../../components/ui';
import { YEAR_MONTH, ageHint, birthError, birthRange } from './childForm';
import './parent.css';

interface FieldErrors {
  nickname?: string;
  birth?: string;
  guardian?: string;
}

export default function ChildNew() {
  const { policies } = useAuth();
  const nav = useNavigate();
  const { state } = useLocation();
  const toast = useToast();
  // 이미 등록한 아이가 있으면 '우리 아이'로 돌아가는 줄을 보인다(없으면 가입 직후의 첫 등록이라 돌아갈 곳이 없다).
  const kids = useLoad(() => api<Child[]>('GET', '/children'), []);
  const [nickname, setNickname] = useState('');
  const [birth, setBirth] = useState('');
  const [guardian, setGuardian] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const nicknameRef = useRef<HTMLInputElement>(null);
  const birthRef = useRef<HTMLInputElement>(null);
  const guardianRef = useRef<HTMLInputElement>(null);

  // 제목은 아이 목록을 기다리지 않고 먼저 그린다(화면을 옮길 때 제목으로 가는 포커스가 늦지 않게).
  if (!policies) return <Loading />;

  const { min: minMonth, max: maxMonth } = birthRange();
  const birthOk = YEAR_MONTH.test(birth) && !birthError(birth);
  const hasChildren = (kids.data?.length ?? 0) > 0;
  // 가입 화면이 보호자를 여기로 보낼 때 state로 알려 준다.
  const onboarding = !hasChildren && (state as { onboarding?: unknown } | null)?.onboarding === true;

  function clear(key: keyof FieldErrors) {
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
    // 고친 값에 대한 예전 서버 오류가 남아 있지 않게 한다.
    if (error) setError(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!policies || busy) return;
    const next: FieldErrors = {
      nickname: nickname.trim() ? undefined : '별칭을 써 주세요.',
      birth: birthError(birth),
      guardian: guardian ? undefined : '법정대리인 동의가 필요해요.',
    };
    if (next.nickname || next.birth || next.guardian) {
      // 오류 문장이 화면에 붙은 뒤에 포커스를 옮겨야 칸 이름과 오류가 함께 읽힌다.
      flushSync(() => {
        setErrors(next);
        setError(null);
      });
      refocus(next.nickname ? nicknameRef.current : next.birth ? birthRef.current : guardianRef.current);
      return;
    }
    setErrors({});
    setBusy(true);
    setError(null);
    try {
      const c = await api<Child>('POST', '/children', {
        nickname,
        birthYearMonth: birth,
        guardianConsent: { agreed: guardian, version: policies.guardianVersion },
      });
      toast(`${c.nickname} 등록을 마쳤어요.`);
      nav(`/p/children/${c.id}`, { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="child-new">
      {/* 첫 칸은 비어 있어도 자리가 유지되어, 뒤로 줄이 나중에 나타나도 제목은 다시 그려지지 않는다(포커스 유지). */}
      {!kids.loading && hasChildren && <BackLink to="/p" label="우리 아이" />}
      {/* Figma: 화면 너비만큼 큰 캐릭터(테디를 품은 모찌)가 제목 위에 온다. 꾸밈이고 아이를 나타내지 않는다.
          그림 자리는 크기가 정해져 있어 늦게 떠도 제목이 밀리지 않고, 못 불러오면 자리째 빠진다. */}
      <div className="p-hero">
        <Mascot name="teddy" size={340} />
      </div>
      <h1>
        아이 이름을 알려주세요 <span aria-hidden="true">:)</span>
      </h1>
      {kids.loading ? (
        <Loading />
      ) : (
        <>
          <p className="lead">
            {onboarding && '가입을 마쳤어요. 이제 함께할 아이를 등록해 주세요. '}
            실명 대신 집에서 부르는 별칭을 써 주세요.
          </p>

          <form onSubmit={submit} noValidate>
            <Field
              ref={nicknameRef}
              id="child-nickname"
              data-demo="child-nickname"
              label="별칭"
              type="text"
              maxLength={20}
              showCount
              autoComplete="off"
              placeholder="예: 하늘"
              value={nickname}
              onChange={(e) => {
                setNickname(e.target.value);
                clear('nickname');
              }}
              error={errors.nickname}
            />
            <Field
              ref={birthRef}
              id="child-birth"
              data-demo="child-birth"
              label="태어난 해와 달"
              type="month"
              min={minMonth}
              max={maxMonth}
              // 달 고르기를 지원하지 않는 브라우저(글 입력칸으로 보임)를 위한 예시
              placeholder="예: 2024-08"
              value={birth}
              onChange={(e) => {
                setBirth(e.target.value);
                clear('birth');
              }}
              hint={birthOk ? ageHint(birth) : undefined}
              error={errors.birth}
            />

            <section className="card warm" aria-labelledby="child-guardian-title" data-demo="child-guardian-info">
              <h2 id="child-guardian-title">법정대리인 동의</h2>
              <p style={{ marginTop: 0 }}>
                만 14세 미만 아동의 정보는 법정대리인(보호자)의 동의가 있어야 저장할 수 있어요. 시나브로는 아래 정보만 저장해요.
              </p>
              <ul style={{ paddingLeft: 20, fontSize: 14, color: 'var(--ink-2)' }}>
                <li>아이 별칭, 태어난 해와 달</li>
                <li>폰 안에서 계산한 상호작용 수치(영상·소리는 저장하지 않음)</li>
                <li>AI 관찰 기록(AI가 적은 글) — 등록한 뒤 아이 홈에서 따로 동의해 켠 경우에만</li>
                <li>보호자가 공유를 허락한 항목에 한해 연결된 선생님이 보는 주간 요약</li>
              </ul>
              <p className="muted">아이 정보를 삭제하면 언제든 동의를 철회할 수 있고, 관련 기록은 즉시 지워져요.</p>
              <label className="check">
                <input
                  ref={guardianRef}
                  id="child-guardian"
                  data-demo="child-guardian"
                  type="checkbox"
                  checked={guardian}
                  onChange={(e) => {
                    setGuardian(e.target.checked);
                    clear('guardian');
                  }}
                  aria-invalid={errors.guardian ? true : undefined}
                  aria-describedby={describedBy(errors.guardian && 'child-guardian-err')}
                />
                <span>
                  <strong>[필수] 저는 이 아이의 법정대리인이며, 위 내용에 동의해요.</strong>
                </span>
              </label>
            </section>
            {errors.guardian && (
              <p className="error field-error" id="child-guardian-err">
                {errors.guardian}
              </p>
            )}

            <ErrorText error={error} />
            <button type="submit" className="btn block child-start" data-demo="child-submit" disabled={busy}>
              {busy ? '등록하는 중…' : '시작하기'}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
