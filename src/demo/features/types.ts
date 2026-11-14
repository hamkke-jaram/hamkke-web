/**
 * 기능별 시연의 공통 타입. 화면(DOM)에 기대지 않아서 단위 테스트에서도 그대로 쓴다.
 */

/** 시연이 가리키는 화면 요소: '@이름'은 data-demo="이름", '#아이디'는 id="아이디". */
export type Target = `@${string}` | `#${string}`;

/** 말풍선 배지: 이 기기 안에서 / 기록 서버로 / AI 서버로 */
export type Where = 'device' | 'server' | 'ai';

export interface Narration {
  title: string;
  body: string;
  where?: Where[];
}

/** 시연 계정(데모 전용). 비밀번호와 토큰은 메모리·이 탭의 sessionStorage에만 둔다. */
export interface DemoAcc {
  userId: number;
  email: string;
  password: string;
  accessToken: string;
  refreshToken: string;
}

export type AccountKey = 'parent' | 'teacher' | 'extra';

/** 시나리오가 읽는 값(시연 준비가 채운다). vars는 시나리오가 단계 사이에 주고받는 값. */
export interface ScenarioData {
  parent?: DemoAcc;
  teacher?: DemoAcc;
  /** 시나리오 안에서 새로 만든 계정(가입 시연 등). 끝나면 지운다. */
  extra?: DemoAcc;
  childId?: number;
  aiOn: boolean;
  vars: Record<string, string>;
}

export type Dyn<T> = T | ((d: ScenarioData) => T);

export function resolve<T>(v: Dyn<T>, d: ScenarioData): T {
  return typeof v === 'function' ? (v as (d: ScenarioData) => T)(d) : v;
}

/** 이 단계가 끝날 때 기다릴 요청. status를 주면 그 값(들)이어야 한다. */
export interface Expect {
  method: string;
  path: RegExp;
  status?: ExpectStatus | ExpectStatus[];
}

/** 숫자 상태 코드 또는 'offline'(서버에 닿지 못함) */
export type ExpectStatus = number | 'offline';

interface StepBase {
  /** 동작하기 전에 보여 줄 설명(무엇을 넣는지, 어디로 가는지, 왜) */
  say?: Dyn<Narration>;
  /** 동작한 뒤에 보여 줄 설명(결과) */
  after?: Dyn<Narration>;
  /** 실패해도 시연을 멈추지 않고 넘어간다(예: 옛 서버에 없는 기능). */
  optional?: boolean;
}

export type Step =
  | (StepBase & { kind: 'say'; target?: Target })
  | (StepBase & { kind: 'goto'; path: Dyn<string>; target?: Target })
  | (StepBase & { kind: 'type'; target: Target; text: Dyn<string>; clear?: boolean; reveal?: boolean })
  | (StepBase & { kind: 'fill'; target: Target; value: Dyn<string> })
  | (StepBase & { kind: 'click'; target: Target; expect?: Expect; noRequest?: boolean })
  | (StepBase & { kind: 'wait'; target?: Target; route?: RegExp; timeout?: number })
  | (StepBase & { kind: 'as'; account: AccountKey | null })
  | (StepBase & {
      kind: 'do';
      target?: Target;
      expect?: Expect;
      noRequest?: boolean;
      /** 이 단계에서 쓰는 화면 요소(정적 확인 테스트가 함께 본다) */
      uses?: Target[];
      run: (ctx: StepContext) => Promise<void>;
      /** '건너뛰기'를 눌렀을 때 할 일(예: 오래 걸리는 분석 멈추기) */
      onSkip?: (ctx: StepContext) => Promise<void> | void;
    });

export type StepKind = Step['kind'];

/** 'do' 단계가 쓰는 도구. */
export interface StepContext {
  data: ScenarioData;
  signal: AbortSignal;
  driver: Driver;
  services: Services;
  /** 일시정지·속도·건너뛰기를 따르는 기다리기 */
  sleep: (ms: number) => Promise<void>;
  /** 말풍선을 바꾸고 읽을 시간만큼 기다린다. */
  say: (n: Narration, target?: Target) => Promise<void>;
  /** 화면 밖에서 시연이 확인 삼아 보낸 요청을 말풍선에 보여 준다. */
  show: (entryId: number) => void;
  /** 건너뛰기를 눌렀는지(이 단계 안에서) */
  skipped: () => boolean;
  /** 건너뛰기를 누르면 abort되는 신호(오래 기다리는 find에 넘긴다) */
  skipSignal: AbortSignal;
  /** 사람이 직접 화면을 만지는 동안(파일 고르기 등) 멈추지 않게 한다. */
  letUser: <T>(fn: () => Promise<T>) => Promise<T>;
  /** 요청 기다리기(건너뛰면 null) */
  waitRequest: (e: Expect, since: number, timeoutMs?: number) => Promise<NetLike | null>;
  mark: () => number;
}

/** 엔진이 보는 요청 기록 한 줄(netlog.NetEntry의 일부). */
export interface NetLike {
  id: number;
  method: string;
  path: string;
  status: number | 'pending' | 'offline';
  source: string;
}

export interface FindOptions {
  timeout: number;
  signal: AbortSignal;
  /** 숨은 입력칸(파일 고르기 등)도 찾는다. */
  hidden?: boolean;
  /** 건너뛰면 기다리기를 끝낸다(오류 없이). */
  skip?: AbortSignal;
}

export interface TypeOptions {
  signal: AbortSignal;
  /** 한 글자를 넣은 뒤 기다릴 시간(ms)을 정한다. */
  delay: (ch: string, index: number) => number;
  sleep: (ms: number) => Promise<void>;
  clear?: boolean;
  /** 비밀번호를 '보기'로 잠깐 보여 준 뒤 다시 숨긴다. */
  reveal?: boolean;
  /** 움직임 줄이기: 한 번에 채운다. */
  instant?: boolean;
}

/** 화면을 실제로 움직이는 쪽. 브라우저에서는 domDriver, 테스트에서는 가짜. */
export interface Driver {
  find(target: Target, o: FindOptions): Promise<void>;
  /** 닫힌 펼침(details)을 열고 화면 가운데로 스크롤한다. */
  reveal(target: Target): Promise<void>;
  spotlight(target: Target | null): void;
  type(target: Target, text: string, o: TypeOptions): Promise<void>;
  fill(target: Target, value: string): Promise<void>;
  click(target: Target): Promise<void>;
  goto(path: string, o: { signal: AbortSignal; timeout: number }): Promise<void>;
  waitRoute(route: RegExp, o: FindOptions): Promise<void>;
  /** 숨은 파일 칸에 파일을 넣고 change를 알린다(파일 창은 열지 않는다). */
  putFile(target: Target, file: File): Promise<void>;
  /** 칸의 지금 글자(예: 초대 코드 읽기). 없으면 ''. */
  text(target: Target): string;
  exists(target: Target): boolean;
  isDisabled(target: Target): boolean;
}

/** 엔진 밖의 일: 계정 바꾸기 등(시연 준비 관리자가 맡는다). */
export interface Services {
  switchTo(account: AccountKey | null): Promise<void>;
  /** 화면에서 로그인·가입·비밀번호 변경으로 바뀐 세션을 그 시연 계정에 적는다. */
  adopt(account: AccountKey, patch?: Partial<DemoAcc>): Promise<void>;
  /** 화면 밖에서 시연이 확인 삼아 보내는 요청(서버로 간 내용에 '화면 밖 확인'으로 남는다). */
  check(
    account: AccountKey | null,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ id: number; status: number; data: unknown }>;
  /** 계정을 지웠다고 표시한다(정리할 때 다시 지우지 않게). */
  forget(account: AccountKey): void;
}

export type Need = 'none' | 'parent' | 'child' | 'records' | 'linked' | 'child+teacher';

export type Group = 'start' | 'home' | 'teacher' | 'always';

export interface Scenario {
  key: string;
  group: Group;
  title: string;
  /** 한 줄 원리 */
  summary: string;
  needs: Need;
  /** 메뉴 배지 */
  badges: string[];
  /** 예상 시간(분) */
  minutes: number;
  /** AI 서버가 꺼져 있으면 설명만 보여 준다. */
  aiDependent?: boolean;
  steps: (env: { aiOn: boolean }) => Step[];
}
