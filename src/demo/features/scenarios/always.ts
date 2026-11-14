import * as netlog from '../netlog';
import { demoPassword } from '../session';
import type { Scenario } from '../types';
import { isOk, lastOk, n } from './helpers';

/** ④ 언제나: 도움받기, 내 정보(동의 기록·비밀번호·내려받기·탈퇴) */

export const support: Scenario = {
  key: 'support',
  group: 'always',
  title: '도움받기: 로그인 없이도, 서버가 꺼져도',
  summary: '서버에 닿지 못하면 앱에 담아 둔 목록으로 연락처를 보여 줘요. 로그인과 상관없이 늘 열려요.',
  needs: 'none',
  badges: ['연결 실패 흉내'],
  minutes: 1,
  steps: () => [
    { kind: 'as', account: null, say: n('로그아웃 상태', '로그인하지 않은 채로 열어 볼게요.') },
    { kind: 'goto', path: '/' },
    {
      kind: 'do',
      uses: ['@support-list'],
      expect: { method: 'GET', path: /\/support-resources$/ },
      run: (ctx) => ctx.driver.goto('/support', { signal: ctx.signal, timeout: 12_000 }),
      after: n('최신 목록을 받아요', '도움받기는 로그인이나 결제와 상관없이 언제나 열려 있어요. 서버에서 최신 연락처를 받아 보여 줘요.', 'server'),
    },
    { kind: 'say', target: '@support-list', say: n('상담·기관 목록', '앱이 상담을 대신하지 않고, 도움받을 수 있는 곳으로 이어 드려요.') },
    {
      kind: 'do',
      say: n('서버가 꺼진 상황 흉내', '이번에는 시연이 이 요청을 서버에 보내지 않고 "연결 실패"로 처리해요. 서버로 간 내용에 "연결 실패 흉내"로 표시돼요.'),
      expect: { method: 'GET', path: /\/support-resources$/, status: 'offline' },
      run: async (ctx) => {
        netlog.setOffline(/\/support-resources$/);
        await ctx.driver.goto('/', { signal: ctx.signal, timeout: 12_000 });
        await ctx.driver.goto('/support', { signal: ctx.signal, timeout: 12_000 });
      },
    },
    {
      kind: 'say',
      target: '@support-fallback',
      say: n('그래도 번호가 보여요', '서버에 닿지 못해도 앱에 담아 둔 목록으로 연락처를 보여 드려요.', 'device'),
    },
    {
      kind: 'do',
      run: async () => {
        netlog.setOffline(null);
      },
    },
    {
      kind: 'say',
      target: '@support-list',
      say: n('전화는 누르지 않아요', '전화 링크는 실제 통화로 이어져서 시연에서는 비추기만 해요.'),
    },
  ],
};

export const account: Scenario = {
  key: 'account',
  group: 'always',
  title: '내 정보: 동의 기록·비밀번호·내려받기·탈퇴',
  summary: '언제 어떤 버전에 동의했는지 남고, 내 데이터를 파일로 받고, 탈퇴하면 아이 정보와 기록이 함께 지워져요.',
  needs: 'child',
  badges: ['입력 과정 보기', '계정을 지워요'],
  minutes: 3,
  steps: () => [
    { kind: 'as', account: 'parent' },
    {
      kind: 'goto',
      path: '/account',
      target: '#account-consents-h',
      say: n('동의 기록', '이용약관, 개인정보, 아이별 법정대리인 동의가 버전·시각과 함께 남아 있어요.'),
    },
    {
      kind: 'do',
      run: async (ctx) => {
        ctx.data.vars.newPw = demoPassword();
      },
    },
    {
      kind: 'type',
      target: '@account-pw-current',
      text: (d) => d.parent?.password ?? '',
      say: n('비밀번호 바꾸기', '지금 비밀번호와 새 비밀번호를 넣어요(칸에서는 가려져 보여요).'),
    },
    { kind: 'type', target: '@account-pw-new', text: (d) => d.vars.newPw },
    {
      kind: 'click',
      target: '@account-pw-submit',
      expect: { method: 'PUT', path: /\/me\/password$/ },
    },
    {
      kind: 'do',
      run: async (ctx) => {
        if (lastOk('PUT', /\/me\/password$/)) {
          await ctx.services.adopt('parent', { password: ctx.data.vars.newPw });
          await ctx.say(
            n('바꿨어요', '두 비밀번호는 서버로 가고, 여기서는 가려서 보여요. 이 기기만 로그인한 채로 두고 다른 기기의 로그인은 끝나요.', 'server'),
          );
        } else {
          await ctx.say(n('이 서버에서는 아직 안 돼요', '연결된 기록 서버가 비밀번호 바꾸기를 아직 지원하지 않아요. 다음 단계로 넘어갈게요.', 'server'));
        }
      },
    },
    {
      kind: 'say',
      target: '@account-export',
      say: n('내 데이터 내려받기', '계정·동의 기록·아이별 기록을 한 파일(JSON)로 받아요. 파일은 이 기기에만 저장돼요.', 'device'),
    },
    {
      kind: 'do',
      say: n('어떤 내용이 담기는지', '시연에서는 파일을 저장하지 않고, 같은 요청의 응답만 아래에 보여 드려요(화면 밖 확인).', 'server'),
      run: async (ctx) => {
        const r = await ctx.services.check('parent', 'GET', '/me/export');
        ctx.show(r.id);
        await ctx.say(
          isOk(r.status)
            ? n('이런 내용이에요', '"서버로 간 내용"에서 응답을 펼쳐 보세요. 토큰과 비밀번호는 담기지 않아요.', 'server')
            : n('이 서버에서는 아직 안 돼요', `연결된 기록 서버가 내려받기를 아직 지원하지 않아요(${r.status}).`, 'server'),
        );
      },
    },
    { kind: 'click', target: '@account-delete', say: n('회원 탈퇴', '시연 계정을 정리하는 겸 탈퇴해 볼게요.') },
    {
      kind: 'type',
      target: '@account-delete-pw',
      text: (d) => d.parent?.password ?? '',
      say: n('비밀번호로 한 번 더 확인', '탈퇴는 되돌릴 수 없어서 비밀번호를 다시 받아요.'),
    },
    {
      kind: 'click',
      target: '@account-delete-confirm',
      expect: { method: 'DELETE', path: /\/me$/, status: [200, 204] },
      after: n('탈퇴했어요', '계정과 아이 정보, 모든 기록, 공유 연결이 함께 지워졌어요. 요청의 비밀번호는 여기서도 가려서 보여요.', 'server'),
    },
    { kind: 'do', run: async (ctx) => ctx.services.forget('parent') },
    { kind: 'wait', route: /^\/$/ },
  ],
};
