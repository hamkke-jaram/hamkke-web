import { ymdFromToday } from '../timing';
import type { Scenario, StepContext } from '../types';
import { childHome, childId, hasShared, isOk, n, sharedNames, teacherChild } from './helpers';

/** ③ 선생님과: 공유 스위치, 초대 코드 연결, 목표·메모, 초대 코드 취소, 연결 끊기, 기관 촬영 설명 */

/** 선생님 계정으로 공유 요약을 직접 불러와(화면 밖 확인) 말풍선에 보여 준다. */
async function teacherView(ctx: StepContext, title: string, body: (names: string, data: unknown) => string) {
  const r = await ctx.services.check('teacher', 'GET', `/teacher/children/${childId(ctx.data)}/shared-summary?weeks=8`);
  ctx.show(r.id);
  await ctx.say(n(title, isOk(r.status) ? body(sharedNames(r.data), r.data) : `선생님 쪽 응답: ${r.status}`, 'server'));
  return r;
}

export const share: Scenario = {
  key: 'share',
  group: 'teacher',
  title: '공유 항목 켜고 끄기',
  summary: '켠 항목만 선생님에게 가요. 스위치를 켜고 끌 때마다 선생님 쪽 서버 응답이 실제로 바뀌는 것을 보여 줘요.',
  needs: 'linked',
  badges: ['계정 2개'],
  minutes: 2,
  steps: ({ aiOn }) => [
    { kind: 'as', account: 'parent' },
    {
      kind: 'goto',
      path: (d) => `${childHome(d)}/share`,
      target: '@share-status',
      say: n('기록은 기본 비공개', '켠 항목만 연결된 선생님이 주 단위 요약으로 봐요.'),
    },
    {
      kind: 'do',
      say: n('선생님 쪽에서 보면', '선생님 계정으로 서버에 직접 물어볼게요(화면 밖 확인).', 'server'),
      run: async (ctx) => {
        await teacherView(ctx, '지금 선생님이 받는 항목', (names) => `${names}. 크게 운 횟수는 응답에 아예 없어요.`);
      },
    },
    {
      kind: 'click',
      target: '@share-switch-distress',
      say: n('"크게 운 횟수" 켜기', '스위치를 누르면 여섯 항목의 켜짐·꺼짐을 한 번에 저장해요.'),
      expect: { method: 'PUT', path: /\/share-settings$/, status: 200 },
      after: n('이렇게 갔어요', '여섯 항목 값이 함께 가고, 그중 distress가 true로 바뀌었어요.', 'server'),
    },
    {
      kind: 'do',
      run: async (ctx) => {
        await teacherView(ctx, '선생님 응답이 바로 바뀌었어요', (names, data) =>
          hasShared(data, 'DISTRESS') ? `${names}. 켜는 즉시 서버가 선생님에게 주는 내용이 바뀌어요.` : `${names}.`,
        );
      },
    },
    {
      kind: 'click',
      target: '@share-switch-distress',
      say: n('다시 끄기', '시작할 때처럼 꺼 둘게요.'),
      expect: { method: 'PUT', path: /\/share-settings$/, status: 200 },
    },
    {
      kind: 'do',
      run: async (ctx) => {
        await teacherView(ctx, '끄면 바로 빠져요', (names, data) =>
          hasShared(data, 'DISTRESS') ? `${names}.` : `${names}. 끄면 지난 기록도 선생님에게서 바로 사라져요.`,
        );
      },
    },
    ...(aiOn
      ? ([
          {
            kind: 'say',
            target: '@share-switch-institutionCapture',
            optional: true,
            say: n('기관 촬영 허락', '이 스위치와 아이의 AI 관찰 기록 동의가 모두 켜져 있을 때만 선생님이 기관에서 촬영할 수 있어요.'),
          },
        ] as const)
      : []),
  ],
};

export const invite: Scenario = {
  key: 'invite',
  group: 'teacher',
  title: '초대 코드로 선생님 연결',
  summary: '보호자가 만든 코드를 선생님이 입력하면 연결돼요. 한 번 쓴 코드는 다시 쓸 수 없어요.',
  needs: 'child+teacher',
  badges: ['입력 과정 보기', '계정 2개'],
  minutes: 2,
  steps: () => [
    { kind: 'as', account: 'parent' },
    { kind: 'goto', path: (d) => `${childHome(d)}/share`, target: '@share-issue-code', say: n('초대 코드 만들기', '보호자가 선생님 초대 코드를 만들어요.') },
    {
      kind: 'click',
      target: '@share-issue-code',
      expect: { method: 'POST', path: /\/invite-codes$/, status: [200, 201] },
    },
    {
      kind: 'do',
      target: '#share-invite-code',
      uses: ['#share-invite-code'],
      run: async (ctx) => {
        ctx.data.vars.code = ctx.driver.text('#share-invite-code').trim();
        await ctx.say(n('72시간, 한 번만', '코드는 72시간 동안 한 번만 쓸 수 있어요. 이 코드를 선생님께 전해요.'));
      },
    },
    { kind: 'as', account: 'teacher', say: n('이제 선생님 폰이라고 생각해 주세요', '시연 선생님 계정으로 바꿔요.') },
    { kind: 'goto', path: '/t', target: '@th-code' },
    {
      kind: 'type',
      target: '@th-code',
      text: (d) => d.vars.code.replace(/-/g, '').toLowerCase(),
      say: n('받은 그대로 입력', '소문자로, "-" 없이 넣어도 화면이 대문자로 맞추고 보기 좋게 나눠요.'),
    },
    {
      kind: 'click',
      target: '@th-link-submit',
      expect: { method: 'POST', path: /\/teacher\/links$/, status: [200, 201] },
      after: n('연결했어요', '보낸 것은 코드 하나예요. 연결되면 보호자가 켜 둔 항목만 보여요. 기관 CCTV와는 연결하지 않아요.', 'server'),
    },
    { kind: 'wait', route: /^\/t\/children\/\d+$/ },
    {
      kind: 'do',
      say: n('같은 코드를 한 번 더', '같은 코드로 다시 연결해 볼게요(화면 밖 확인).', 'server'),
      run: async (ctx) => {
        const r = await ctx.services.check('teacher', 'POST', '/teacher/links', { code: ctx.data.vars.code });
        ctx.show(r.id);
        await ctx.say(
          isOk(r.status)
            ? n('서버가 받았어요', `예상과 달리 ${r.status}로 답했어요.`, 'server')
            : n('다시 쓸 수 없어요', `한 번 쓴 코드는 서버가 거절해요(${r.status}).`, 'server'),
        );
      },
    },
    { kind: 'as', account: 'parent', say: n('보호자 쪽에서 연결 해제', '보호자는 언제든 연결을 끊을 수 있어요.') },
    { kind: 'goto', path: (d) => `${childHome(d)}/share`, target: '@share-teacher-unlink' },
    { kind: 'click', target: '@share-teacher-unlink' },
    {
      kind: 'click',
      target: '@share-teacher-unlink-confirm',
      say: n('한 번 더 확인해요', '해제하면 선생님은 더 이상 이 아이의 기록을 볼 수 없어요.'),
      expect: { method: 'DELETE', path: /\/teachers\/\d+$/, status: [200, 204] },
      after: n('해제했어요', '다시 연결하려면 새 초대 코드가 필요해요.', 'server'),
    },
  ],
};

export const teacherNotes: Scenario = {
  key: 'teacher-notes',
  group: 'teacher',
  title: '선생님 목표·관찰 메모 → 보호자 화면',
  summary: '선생님이 적은 목표와 메모가 보호자 아이 홈의 "선생님 이야기"에 이어져요.',
  needs: 'linked',
  badges: ['입력 과정 보기', '계정 2개'],
  minutes: 3,
  steps: () => [
    { kind: 'as', account: 'teacher' },
    {
      kind: 'goto',
      path: teacherChild,
      target: '@tc-tab-goals',
      say: n('선생님 화면', '선생님은 공유받은 요약을 보고, 아이 목표와 관찰 메모를 남길 수 있어요.'),
    },
    { kind: 'click', target: '@tc-tab-goals' },
    { kind: 'type', target: '@tc-goal-title', text: '친구 이름 불러 보기', say: n('새 목표', '60자까지 쓸 수 있고 글자 수가 함께 보여요.') },
    { kind: 'type', target: '@tc-goal-desc', text: '아침 인사 시간에 친구 이름을 함께 불러 보기' },
    {
      kind: 'click',
      target: '@tc-goal-submit',
      expect: { method: 'POST', path: /\/goals$/, status: [200, 201] },
      after: n('이렇게 갔어요', '제목과 설명이에요. 진행 중이거나 이룬 목표는 보호자 화면에도 보이고, 보관하면 빠져요.', 'server'),
    },
    { kind: 'click', target: '@tc-tab-notes' },
    {
      kind: 'type',
      target: '@tc-note-text',
      text: '모래 놀이에서 컵을 친구와 번갈아 쓰며 끝까지 함께 놀았어요.',
      say: n('관찰 메모', '잘한 점, 즐거워한 활동을 중심으로 적어요.'),
    },
    {
      kind: 'fill',
      target: '@tc-note-date',
      value: () => ymdFromToday(1),
      say: n('일부러 내일 날짜', '아직 오지 않은 날을 고르고 남겨 볼게요.'),
    },
    { kind: 'click', target: '@tc-note-submit', noRequest: true },
    { kind: 'say', target: '#tc-note-date-err', say: n('오늘이나 지난 날만', '폰에서 먼저 막아서 서버로 간 요청은 없어요.', 'device') },
    { kind: 'fill', target: '@tc-note-date', value: () => ymdFromToday(-1), say: n('어제로 고치기', '관찰한 날을 어제로 고를게요.') },
    {
      kind: 'click',
      target: '@tc-note-submit',
      expect: { method: 'POST', path: /\/observations$/, status: [200, 201] },
      after: n('이렇게 갔어요', '메모 내용과 관찰한 날이에요.', 'server'),
    },
    { kind: 'as', account: 'parent', say: n('보호자 화면으로', '이제 보호자 계정으로 바꿔요.') },
    {
      kind: 'goto',
      path: childHome,
      target: '#childhome-story-h',
      say: n('선생님 이야기', '방금 쓴 목표와 메모가 보여요. 집에서의 기록과 기관의 관찰이 한 화면에서 이어져요.'),
    },
  ],
};

export const inviteRevoke: Scenario = {
  key: 'invite-revoke',
  group: 'teacher',
  title: '초대 코드 취소',
  summary: '아직 쓰지 않은 코드는 목록에서 다시 보고 취소할 수 있어요. 취소한 코드로는 연결되지 않아요.',
  needs: 'child+teacher',
  badges: ['계정 2개', '새 서버 기능'],
  minutes: 1,
  steps: () => [
    { kind: 'as', account: 'parent' },
    { kind: 'goto', path: (d) => `${childHome(d)}/share`, target: '@share-issue-code' },
    { kind: 'click', target: '@share-issue-code', expect: { method: 'POST', path: /\/invite-codes$/, status: [200, 201] } },
    {
      kind: 'do',
      target: '#share-invite-code',
      uses: ['#share-invite-code'],
      run: async (ctx) => {
        const code = ctx.driver.text('#share-invite-code').trim();
        // 코드를 읽지 못하면 빈 코드로 확인하게 되어(400 입력 오류) 취소 효과를 잘못 보여 준다.
        if (!code) throw new Error('화면에서 초대 코드를 읽지 못했어요.');
        ctx.data.vars.code = code;
      },
    },
    {
      kind: 'click',
      target: '@share-code-revoke',
      say: n('쓸 수 있는 초대 코드', '쓰지 않은 코드는 기한과 함께 목록에 남아요. 취소해 볼게요.'),
    },
    {
      kind: 'click',
      target: '@share-code-revoke-confirm',
      expect: { method: 'DELETE', path: /\/invite-codes\/[^/]+$/, status: [200, 204] },
      after: n('취소했어요', '이미 연결된 선생님은 그대로이고, 이 코드로는 더 이상 연결할 수 없어요.', 'server'),
    },
    {
      kind: 'do',
      say: n('선생님이 써 보면', '취소한 코드로 선생님이 연결해 볼게요(화면 밖 확인).', 'server'),
      run: async (ctx) => {
        const r = await ctx.services.check('teacher', 'POST', '/teacher/links', { code: ctx.data.vars.code });
        ctx.show(r.id);
        await ctx.say(
          isOk(r.status)
            ? n('서버가 받았어요', `예상과 달리 ${r.status}로 답했어요.`, 'server')
            : n('연결되지 않아요', `취소한 코드는 서버가 받지 않아요(${r.status}).`, 'server'),
        );
      },
    },
  ],
};

export const teacherUnlink: Scenario = {
  key: 'teacher-unlink',
  group: 'teacher',
  title: '선생님이 연결 끊기',
  summary: '반이 바뀌면 선생님이 직접 연결을 끊어요. 끊은 뒤에는 그 아이의 기록을 볼 수 없어요.',
  needs: 'linked',
  badges: ['새 서버 기능'],
  minutes: 1,
  steps: () => [
    { kind: 'as', account: 'teacher' },
    { kind: 'goto', path: teacherChild, target: '@tc-unlink', say: n('이 아이와 연결 끊기', '화면 아래 펼침 안에 있어요.') },
    { kind: 'click', target: '@tc-unlink' },
    {
      kind: 'click',
      target: '@tc-unlink-confirm',
      say: n('한 번 더 확인해요', '이미 남긴 목표와 메모는 보호자 화면에 남아요.'),
      expect: { method: 'DELETE', path: /\/teacher\/links\/\d+$/, status: [200, 204] },
    },
    { kind: 'wait', route: /^\/t$/ },
    {
      kind: 'do',
      say: n('끊은 뒤에 열어 보면', '선생님 계정으로 그 아이 요약을 다시 불러 볼게요(화면 밖 확인).', 'server'),
      run: async (ctx) => {
        const r = await ctx.services.check('teacher', 'GET', `/teacher/children/${childId(ctx.data)}/shared-summary?weeks=8`);
        ctx.show(r.id);
        await ctx.say(
          isOk(r.status)
            ? n('아직 보여요', `예상과 달리 ${r.status}로 답했어요.`, 'server')
            : n('볼 수 없어요', `서버가 더 이상 이 아이의 기록을 주지 않아요(${r.status}).`, 'server'),
        );
      },
    },
  ],
};

export const aiCapture: Scenario = {
  key: 'ai-capture',
  group: 'teacher',
  title: '실시간 카메라·기관 촬영 원리',
  summary: '설명형이에요. 카메라는 시연이 켜지 않아요. 사진 6장만 AI 서버로 가고 글만 남는 길을 보여 줘요.',
  needs: 'linked',
  badges: ['설명형', 'AI 서버 필요'],
  minutes: 2,
  aiDependent: true,
  steps: ({ aiOn }) =>
    aiOn
      ? [
          {
            kind: 'do',
            say: n('허락 두 가지를 켜 둘게요', '보호자의 AI 관찰 기록 동의와 "기관 촬영 허락"을 화면 밖에서 켜요. 둘 다 있어야 선생님이 촬영할 수 있어요.', 'server'),
            run: async (ctx) => {
              const id = childId(ctx.data);
              const a = await ctx.services.check('parent', 'PUT', `/children/${id}/ai-consent`, {
                agreed: true,
                version: ctx.data.vars.aiVersion,
              });
              ctx.show(a.id);
              const s = await ctx.services.check('parent', 'PUT', `/children/${id}/share-settings`, {
                jointPlay: true,
                responseLatency: true,
                distress: false,
                coachingCards: true,
                aiObservations: false,
                institutionCapture: true,
              });
              ctx.show(s.id);
              if (!isOk(a.status) || !isOk(s.status)) throw new Error('허락을 켜지 못했어요. AI 서버 설정을 확인해 주세요.');
            },
          },
          { kind: 'as', account: 'teacher' },
          {
            kind: 'goto',
            path: teacherChild,
            target: '@tc-capture',
            say: n('기관에서 관찰 기록하기', '보호자가 허락한 아이에게만 이 버튼이 보여요.'),
          },
          {
            kind: 'say',
            say: n(
              '사진이 가는 길',
              '카메라 → 이 기기에서 장면 6장만 고르기 → AI 서버(살펴본 뒤 바로 지움) → AI가 적은 글만 기록 서버에 저장. 소리와 영상은 보내지 않아요.',
              'device',
              'ai',
              'server',
            ),
          },
          { kind: 'click', target: '@tc-capture' },
          {
            kind: 'say',
            target: '@observe-camera-on',
            say: n('카메라는 직접 켜요', '카메라 권한은 사람이 허락해야 해서 시연이 누르지 않아요. 직접 해 보려면 시연을 마친 뒤 눌러 주세요.'),
          },
          {
            kind: 'say',
            target: '@observe-start',
            optional: true,
            say: n('시작하기', '카메라가 켜지고 AI 서버가 준비되었을 때만 눌려요. 준비되지 않으면 사진을 보내지 않아요.', 'ai'),
          },
        ]
      : [
          { kind: 'as', account: 'parent' },
          { kind: 'goto', path: (d) => `${childHome(d)}/share` },
          {
            kind: 'say',
            say: n('지금은 AI 서버가 꺼져 있어요', '그래서 설명만 보여 드려요. 켜져 있으면 보호자가 허락한 아이만 선생님이 기관에서 촬영할 수 있어요.', 'ai'),
          },
          {
            kind: 'say',
            say: n(
              '사진이 가는 길',
              '카메라 → 이 기기에서 장면 6장만 고르기 → AI 서버(살펴본 뒤 바로 지움) → AI가 적은 글만 기록 서버에 저장. 카메라는 시연이 켜지 않아요.',
              'device',
              'ai',
              'server',
            ),
          },
        ],
};
