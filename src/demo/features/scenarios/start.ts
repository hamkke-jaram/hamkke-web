import * as netlog from '../netlog';
import { demoEmail, demoPassword, notePending } from '../session';
import { ymFromToday } from '../timing';
import type { Scenario } from '../types';
import { isOk, lastOk, n } from './helpers';

/** ① 시작하기: 가입, 로그인, 아이 등록, 약관 다시 동의 */

export const signup: Scenario = {
  key: 'signup',
  group: 'start',
  title: '가입과 필수 약관 동의',
  summary: '입력 확인은 폰에서 먼저 하고, 동의 2건과 동의서 버전이 가입 요청에 함께 가요.',
  needs: 'none',
  badges: ['입력 과정 보기', '계정을 새로 만들어요'],
  minutes: 2,
  steps: () => [
    { kind: 'as', account: null, say: n('로그아웃 상태에서 시작해요', '가입은 로그인하지 않은 사람이 여는 화면이에요.') },
    {
      kind: 'goto',
      path: '/register',
      target: '@signup-role-parent',
      say: n('가입 유형 고르기', '보호자와 기관 선생님은 가입 유형만 달라요. 선생님은 보호자가 준 초대 코드로 연결된 아이만 볼 수 있어요.'),
    },
    { kind: 'click', target: '@signup-role-parent' },
    {
      kind: 'do',
      run: async (ctx) => {
        // 시연이 만든 임의 이메일·비밀번호만 쓴다. 가입 도중 멈춰도 지울 수 있게 미리 적어 둔다.
        ctx.data.vars.email = demoEmail('try');
        ctx.data.vars.pw = demoPassword();
        notePending({ email: ctx.data.vars.email, password: ctx.data.vars.pw });
      },
    },
    {
      kind: 'type',
      target: '@signup-email',
      text: (d) => d.vars.email,
      say: n('이메일', '이메일은 로그인할 때만 써요. 실명이나 전화번호는 받지 않아요.'),
    },
    {
      kind: 'type',
      target: '@signup-pw',
      text: 'abc',
      say: n('일부러 짧은 비밀번호', '규칙에 맞지 않는 비밀번호를 넣고 가입을 눌러 볼게요.'),
    },
    { kind: 'click', target: '@signup-submit', noRequest: true },
    {
      kind: 'say',
      target: '#signup-pw-err',
      say: n('폰 안에서 먼저 확인해요', '칸 아래에 안내가 떴어요. 이 확인은 폰 안에서 해서 서버로 간 요청은 0건이에요.', 'device'),
    },
    {
      kind: 'type',
      target: '@signup-pw',
      clear: true,
      reveal: true,
      text: (d) => d.vars.pw,
      say: n('규칙에 맞는 비밀번호', '영문과 숫자를 섞은 8자 이상이에요. 시연이 만든 임의 비밀번호를 "보기"로 잠깐 보여 준 뒤 다시 가려요.'),
    },
    {
      kind: 'type',
      target: '@signup-name',
      text: '시연 보호자',
      say: n('앱에서 부를 이름', '별명이어도 괜찮아요. 화면에서 부르는 데만 써요.'),
    },
    {
      kind: 'click',
      target: '@signup-submit',
      noRequest: true,
      say: n('동의 없이 가입 눌러 보기', '필수 약관에 동의하지 않으면 가입할 수 없어요.'),
    },
    {
      kind: 'say',
      target: '#signup-consent-err',
      say: n('필수 항목에 동의해 주세요', '이번에도 폰 안에서 막아서 서버로 간 요청은 없어요. 서버도 동의가 없는 가입은 받지 않아요.', 'device'),
    },
    {
      kind: 'say',
      target: '#signup-terms-desc',
      say: n('서비스 이용약관', '시나브로는 의료기기가 아닌 웰니스 서비스이고, 발달 상태를 판단하지 않는다는 데 동의하는 칸이에요.'),
    },
    { kind: 'click', target: '@signup-terms' },
    {
      kind: 'say',
      target: '#signup-privacy-desc',
      say: n('개인정보 수집·이용', '저장하는 것은 이메일, 이름, 폰에서 계산한 숫자뿐이에요. 영상과 소리는 저장하지 않아요.'),
    },
    { kind: 'click', target: '@signup-privacy' },
    {
      kind: 'say',
      target: '@signup-agree-all',
      say: n('"모두 동의"도 함께 켜져요', '두 필수 항목에 모두 동의하면 "모두 동의"가 저절로 켜져요.'),
    },
    {
      kind: 'click',
      target: '@signup-submit',
      expect: { method: 'POST', path: /\/auth\/signup$/, status: [200, 201] },
      say: n('가입 요청 보내기', '이제 처음으로 서버에 보내요. 아래 "서버로 간 내용"에 실제로 보낸 내용이 남아요.', 'server'),
      after: n(
        '이렇게 갔어요',
        '이메일, 비밀번호(서버가 암호화해 저장), 이름, 가입 유형, 동의 2건과 각 동의서 버전이에요. 비밀번호와 토큰은 여기서도 가려서 보여요.',
        'server',
      ),
    },
    {
      kind: 'do',
      run: async (ctx) => {
        await ctx.services.adopt('extra', { email: ctx.data.vars.email, password: ctx.data.vars.pw });
      },
    },
    {
      kind: 'wait',
      route: /^\/p\/children\/new$/,
      after: n('바로 아이 등록으로', '보호자는 가입하자마자 아이 등록 화면으로 이어져요. 동의 기록은 내 정보 > 동의 기록에서 다시 볼 수 있어요.'),
    },
  ],
};

export const login: Scenario = {
  key: 'login',
  group: 'start',
  title: '로그인',
  summary: '빈 칸은 폰이 먼저 알려 주고, 틀린 비밀번호는 서버가 어느 칸이 틀렸는지 밝히지 않고 거절해요.',
  needs: 'parent',
  badges: ['입력 과정 보기'],
  minutes: 1,
  steps: () => [
    { kind: 'as', account: null },
    {
      kind: 'goto',
      path: '/login',
      target: '@login-submit',
      say: n('빈 칸으로 눌러 보기', '아무것도 넣지 않고 로그인을 눌러 볼게요.'),
    },
    { kind: 'click', target: '@login-submit', noRequest: true },
    {
      kind: 'say',
      target: '#login-email-err',
      say: n('폰에서 먼저 알려요', '빈 칸은 서버에 묻지 않고 폰에서 바로 알려 드려요. 서버로 간 요청은 0건이에요.', 'device'),
    },
    {
      kind: 'type',
      target: '@login-email',
      text: (d) => d.parent?.email ?? '',
      say: n('시연 보호자 이메일', '방금 시연이 만든 보호자 계정의 이메일이에요.'),
    },
    {
      kind: 'type',
      target: '@login-pw',
      text: 'wrong-pass1',
      say: n('틀린 비밀번호(한 번만)', '일부러 틀린 비밀번호를 넣어 볼게요. 같은 이메일로 여러 번 틀리면 잠시 잠기니 한 번만 해요.'),
    },
    {
      kind: 'click',
      target: '@login-submit',
      expect: { method: 'POST', path: /\/auth\/login$/, status: [400, 401] },
      after: n(
        '서버가 거절했어요',
        '이메일과 비밀번호 중 어느 쪽이 틀렸는지는 알려 주지 않아요. 같은 이메일로 5번 틀리면 15분 동안 잠겨요.',
        'server',
      ),
    },
    {
      kind: 'type',
      target: '@login-pw',
      clear: true,
      text: (d) => d.parent?.password ?? '',
      say: n('맞는 비밀번호', '이번에는 맞는 비밀번호를 넣어요(칸에서는 가려져 보여요).'),
    },
    {
      kind: 'click',
      target: '@login-submit',
      expect: { method: 'POST', path: /\/auth\/login$/, status: 200 },
      after: n(
        '로그인했어요',
        '30분짜리 출입증(액세스 토큰)과 14일짜리 갱신 토큰을 받아 이 브라우저에만 보관해요. 응답의 토큰도 여기서는 가려서 보여요.',
        'server',
        'device',
      ),
    },
    { kind: 'do', run: (ctx) => ctx.services.adopt('parent') },
    { kind: 'wait', route: /^\/p/, after: n('보호자 홈으로', '역할에 따라 보호자는 보호자 홈, 선생님은 선생님 홈으로 가요.') },
  ],
};

export const childConsent: Scenario = {
  key: 'child',
  group: 'start',
  title: '아이 등록과 법정대리인 동의',
  summary: '별칭과 태어난 해·달만 받고, 동의 없이 보내면 화면도 서버도 저장을 거부해요.',
  needs: 'parent',
  badges: ['입력 과정 보기'],
  minutes: 2,
  steps: () => [
    { kind: 'as', account: 'parent' },
    {
      kind: 'goto',
      path: '/p/children/new',
      target: '@child-nickname',
      say: n('별칭', '실명 대신 집에서 부르는 별칭만 받아요.'),
    },
    { kind: 'type', target: '@child-nickname', text: '별이' },
    {
      kind: 'fill',
      target: '@child-birth',
      value: () => ymFromToday(36),
      say: n('태어난 해와 달', '생일 날짜 대신 태어난 해와 달만 받아요. 달력에서 고르는 칸이라 한 번에 골라요.'),
    },
    { kind: 'say', target: '#child-birth-hint', say: n('나이는 개월로만 세요', '고른 달로 지금 나이를 보여 드려요. 날짜는 저장하지 않아요.', 'device') },
    {
      kind: 'click',
      target: '@child-submit',
      noRequest: true,
      say: n('동의 없이 등록 눌러 보기', '법정대리인 동의 칸을 비워 둔 채 눌러 볼게요.'),
    },
    {
      kind: 'say',
      target: '#child-guardian-err',
      say: n('화면이 먼저 막아요', '동의가 없으면 등록 요청을 보내지 않아요. 서버로 간 요청은 0건이에요.', 'device'),
    },
    {
      kind: 'do',
      say: n('서버도 거부하는지 확인', '화면을 거치지 않고 동의를 "아니요"로 해서 서버에 직접 보내 볼게요(화면 밖 확인).', 'server'),
      run: async (ctx) => {
        const r = await ctx.services.check('parent', 'POST', '/children', {
          nickname: '별이',
          birthYearMonth: ymFromToday(36),
          guardianConsent: { agreed: false, version: ctx.data.vars.guardianVersion },
        });
        ctx.show(r.id);
        await ctx.say(
          isOk(r.status)
            ? n('서버가 받았어요', `예상과 달리 서버가 ${r.status}로 답했어요. 서버 설정을 확인해 주세요.`, 'server')
            : n('서버도 거부했어요', `화면을 우회해 동의 없이 보내도 서버가 저장하지 않아요(${r.status}).`, 'server'),
        );
      },
    },
    {
      kind: 'say',
      target: '@child-guardian-info',
      say: n('저장하는 것은 이것뿐이에요', '별칭과 태어난 해·달, 폰에서 계산한 숫자, 따로 켠 경우의 AI 관찰 기록, 보호자가 허락한 공유 요약이에요.'),
    },
    {
      kind: 'click',
      target: '@child-guardian',
      say: n('법정대리인 동의', '이 동의가 있어야만 아이 정보를 저장해요. 아이 정보를 지우면 언제든 동의를 철회할 수 있어요.'),
    },
    {
      kind: 'click',
      target: '@child-submit',
      expect: { method: 'POST', path: /\/children$/, status: [200, 201] },
      after: n('이렇게 갔어요', '별칭, 태어난 해·달, 그리고 동의 여부와 동의서 버전이에요. 서버는 동의한 시각을 함께 기록해요.', 'server'),
    },
    { kind: 'wait', route: /^\/p\/children\/\d+$/, after: n('아이 홈', '등록을 마치면 아이 홈으로 가요.') },
  ],
};

export const reconsent: Scenario = {
  key: 'reconsent',
  group: 'start',
  title: '약관이 바뀌었을 때 다시 동의',
  summary: '서버가 "다시 동의할 약관이 있다"고 알려 주면 다른 화면 대신 동의 화면이 먼저 나와요.',
  needs: 'parent',
  badges: ['입력 과정 보기', '응답 흉내', '새 서버 기능'],
  minutes: 2,
  steps: () => [
    {
      kind: 'do',
      say: n(
        '시연용으로 응답을 바꿔요',
        '약관이 실제로 바뀐 상황을 만들 수 없어서, 이 화면이 받는 내 정보 응답에 "다시 동의할 약관 2개"를 시연이 덧붙여요. 서버로 간 내용에 "응답 흉내"로 표시돼요.',
      ),
      run: async (ctx) => {
        netlog.setTransform((method, path, data) =>
          method === 'GET' && path === '/me' && data && typeof data === 'object'
            ? { ...(data as object), pendingConsents: ['TERMS_OF_SERVICE', 'PRIVACY_POLICY'] }
            : undefined,
        );
        await ctx.services.switchTo('parent');
      },
    },
    {
      kind: 'goto',
      path: '/p',
      target: '@reconsent-submit',
      say: n('다른 화면 대신 동의 화면', '다시 동의할 약관이 있으면 약관·개인정보 안내, 도움받기, 내 정보 말고는 이 화면이 먼저 나와요.'),
    },
    { kind: 'click', target: '@reconsent-submit', noRequest: true, say: n('체크 없이 눌러 보기', '체크하지 않으면 보내지 않아요.') },
    { kind: 'click', target: '@reconsent-terms', say: n('바뀐 약관에 동의', '바뀐 내용은 "자세히"에서 읽을 수 있어요.') },
    { kind: 'click', target: '@reconsent-privacy' },
    {
      kind: 'do',
      run: async () => {
        // 동의를 보낸 뒤 화면이 내 정보를 다시 불러오면 실제 서버 응답 그대로 보이게 흉내를 끈다.
        netlog.setTransform(null);
      },
    },
    { kind: 'click', target: '@reconsent-submit', expect: { method: 'POST', path: /\/me\/consents$/ } },
    {
      kind: 'do',
      run: async (ctx) => {
        await ctx.sleep(800);
        await ctx.say(
          lastOk('POST', /\/me\/consents$/)
            ? n('동의 한 건마다 요청 하나', '항목마다 종류와 버전을 POST /me/consents로 보내고, 서버가 동의 기록에 남겨요. 그다음 원래 보려던 화면이 나와요.', 'server')
            : n('이 서버에서는 아직 안 돼요', '연결된 기록 서버가 다시 동의 받기를 아직 지원하지 않아 화면에 안내가 떴어요. 새 서버에서는 동의 한 건마다 요청 하나가 가고 원래 화면으로 이어져요.', 'server'),
        );
      },
    },
  ],
};
