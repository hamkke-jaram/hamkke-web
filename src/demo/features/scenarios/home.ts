import * as netlog from '../netlog';
import type { Scenario, StepContext } from '../types';
import { childHome, n } from './helpers';

/** ② 집에서: 영상 기록, 코칭 카드, AI 관찰 기록 동의, 아이 정보 고치기, 기록 지우기, 주간 기록 */

/** 시연용 샘플 영상(사람이 나오지 않는 30초 시험 영상). hamkke-web/public/demo/에 두면 자동으로 쓴다. */
export const SAMPLE_VIDEO_URL = '/demo/sample-30s.mp4';

/** 샘플 영상을 이 기기로 받아 온다. 없으면(파일이 없거나 영상이 아니면) null. 받은 것은 업로드가 아니다. */
async function loadSample(): Promise<File | null> {
  const id = netlog.begin('sample', 'GET', SAMPLE_VIDEO_URL);
  try {
    const res = await fetch(SAMPLE_VIDEO_URL, { cache: 'no-store' });
    const type = res.headers.get('content-type') ?? '';
    // 개발 서버는 없는 경로에도 앱 화면(HTML)을 돌려주므로 종류까지 본다.
    if (!res.ok || !type.startsWith('video/')) {
      netlog.finish(id, res.ok ? 404 : res.status, { 안내: '시연용 샘플 영상이 없어요' });
      return null;
    }
    const blob = await res.blob();
    netlog.finish(id, res.status, { 안내: '시연용 샘플 영상을 이 기기로 받았어요(업로드 아님)', 크기KB: Math.round(blob.size / 1024) });
    return new File([blob], 'sample-30s.mp4', { type: type || 'video/mp4' });
  } catch {
    netlog.finish(id, 'offline');
    return null;
  }
}

async function pickVideo(ctx: StepContext) {
  const file = await loadSample();
  if (file) {
    await ctx.say(
      n('앨범에서 영상 고르기', '시연용 샘플 영상(사람이 나오지 않는 30초 영상)을 골라 넣을게요. 실제 파일 창은 열지 않아요.', 'device'),
      '@record-gallery',
    );
    await ctx.driver.putFile('@record-gallery-input', file);
    return;
  }
  // 샘플이 없으면 사람이 직접 고르게 한다. 고르는 동안은 시연이 멈추지 않는다.
  await ctx.say(
    n('영상을 직접 골라 주세요', '시연용 샘플 영상을 찾지 못했어요. "앨범에서 영상 고르기"를 눌러 10초 이상 영상을 하나 골라 주세요. 영상은 이 기기 밖으로 나가지 않아요.', 'device'),
    '@record-gallery',
  );
  await ctx.letUser(() =>
    ctx.driver.find('@record-stop', { timeout: 5 * 60_000, signal: ctx.signal, skip: ctx.skipSignal }),
  );
  if (ctx.skipped()) throw new Error('영상을 고르지 않아 이 단계를 건너뛰었어요.');
}

export const record: Scenario = {
  key: 'record',
  group: 'home',
  title: '영상 기록: 폰 안에서 분석하고 숫자만 보내기',
  summary: '영상은 이 기기 안에서만 분석하고, 기록 서버에는 숫자 몇 개만 가요. 파일 전송은 0건이에요.',
  needs: 'child',
  badges: ['입력 과정 보기', '샘플 영상'],
  minutes: 3,
  steps: () => [
    { kind: 'as', account: 'parent' },
    { kind: 'goto', path: childHome, target: '@childhome-record-link', say: n('영상 기록하기', '아이 홈에서 "오늘 함께 논 영상 기록하기"를 눌러요.') },
    { kind: 'click', target: '@childhome-record-link' },
    { kind: 'wait', route: /\/record$/ },
    {
      kind: 'say',
      target: '@record-lead',
      say: n('무엇이 어디로 가나요', '영상은 이 폰 안에서만 분석하고 서버에는 숫자만 보내요. 처음 한 번은 분석 도구(약 17MB)를 내려받아요.', 'device', 'server'),
    },
    {
      kind: 'do',
      uses: ['@record-gallery', '@record-gallery-input', '@record-stop'],
      run: async (ctx) => {
        ctx.data.vars.recordMark = String(ctx.mark());
        await pickVideo(ctx);
      },
    },
    {
      kind: 'do',
      target: '@record-stages',
      uses: ['@record-stages', '@record-done', '@record-stop'],
      expect: { method: 'POST', path: /\/interaction-records$/, status: [200, 201] },
      run: async (ctx) => {
        await ctx.say(n('분석 준비', '분석 도구가 이 폰에서 돌아가요. 서버로 영상을 올리지 않아요.', 'device'), '@record-stages');
        await ctx.say(n('소리 살펴보기', '소리는 폰 안의 작업 스레드에서 살펴보고 바로 버려요.', 'device'));
        await ctx.say(n('함께한 모습 살펴보기', '두 사람이 함께 화면에 있는 시간과 반응까지 걸린 시간을 셉니다. 길면 1~2분 걸려요("건너뛰기"를 누르면 분석을 멈춰요).', 'device'));
        await ctx.driver.find('@record-done', { timeout: 4 * 60_000, signal: ctx.signal, skip: ctx.skipSignal, hidden: true });
        if (!ctx.driver.exists('@record-done')) {
          await ctx.say(n('분석을 멈췄어요', '멈추면 아무것도 저장하거나 보내지 않아요.', 'device'));
        }
      },
      onSkip: async (ctx) => {
        if (ctx.driver.exists('@record-stop')) await ctx.driver.click('@record-stop');
      },
      after: n('서버로 간 것은 숫자뿐이에요', '분석한 시간, 함께한 시간, 반응 시간, 주고받은 횟수, 크게 운 횟수와 분석 도구 버전이에요. 기록 서버에는 파일을 받는 기능이 아예 없어요.', 'server'),
    },
    {
      kind: 'do',
      run: async (ctx) => {
        const since = Number(ctx.data.vars.recordMark ?? '0');
        const { files, photos } = netlog.uploadCounts(netlog.since(since));
        ctx.data.vars.uploads = `파일 ${files}건 · 장면 사진 ${photos}장`;
        await ctx.say(
          n(
            `이번 기록에서 보낸 파일: ${files}건`,
            photos === 0
              ? `영상 파일도, 장면 사진도 보내지 않았어요(${ctx.data.vars.uploads}). 샘플을 받아 온 것은 이 기기로 내려받은 것이에요.`
              : `AI 관찰 기록이 켜져 있어서 장면 사진 ${photos}장을 AI 서버로 보냈어요. 영상 파일은 보내지 않았어요.`,
            'device',
          ),
        );
      },
    },
    {
      kind: 'say',
      target: '@record-result',
      optional: true,
      say: n('오늘의 기록', '같은 집의 변화를 보기 위한 숫자예요. 다른 아이와 비교하지 않아요.'),
    },
    {
      kind: 'do',
      uses: ['@record-guidance'],
      run: async (ctx) => {
        if (ctx.driver.exists('@record-guidance')) {
          await ctx.say(
            n('카드 대신 이야기 나눌 곳 안내', '사람이 나오지 않는 샘플이라 함께한 시간이 낮게 나와요. 이런 날에는 앱이 조언을 만들지 않고 상담·기관 연결을 안내해요.'),
            '@record-guidance',
          );
        }
      },
    },
  ],
};

export const coaching: Scenario = {
  key: 'coaching',
  group: 'home',
  title: "코칭 카드와 '오늘 해봤어요'",
  summary: '기록 변화에 맞춰 전문가가 쓴 카드를 출처와 함께 보여 주고, 해봤다는 표시만 남겨요.',
  needs: 'records',
  badges: [],
  minutes: 1,
  steps: () => [
    { kind: 'as', account: 'parent' },
    { kind: 'goto', path: childHome },
    {
      kind: 'do',
      uses: ['#childhome-coach-h', '@coach-evidence', '@coach-tried'],
      run: async (ctx) => {
        if (!ctx.driver.exists('#childhome-coach-h')) {
          await ctx.say(n('카드가 아직 없어요', '예시 기록으로 카드가 만들어지지 않았어요. 이 시연은 여기서 마칠게요.'));
          return;
        }
        await ctx.say(
          n('이번 코칭', '기록 변화에 맞춰 전문가가 쓴 카드 한 장을 골라 보여 줘요. 앱이 조언 문장을 새로 만들지 않아요.'),
          '#childhome-coach-h',
        );
        await ctx.say(n('출처와 작성·검수', '카드마다 근거, 출처, 쓴 사람과 검수한 사람을 함께 보여 줘요.'), '@coach-evidence');
        if (!ctx.driver.exists('@coach-tried')) {
          await ctx.say(n('이미 해봤어요', '이 카드는 이미 "해봤어요"로 남겨져 있어요.'));
          return;
        }
        await ctx.say(n("'오늘 해봤어요'", '눌러 볼게요. 해봤다는 표시만 남고, 잘했는지 점수를 매기지 않아요.'), '@coach-tried');
        const since = ctx.mark();
        await ctx.driver.click('@coach-tried');
        const e = await ctx.waitRequest({ method: 'POST', path: /\/card-deliveries\/\d+\/tried$/ }, since);
        if (e) ctx.show(e.id);
        await ctx.say(n('이렇게 갔어요', '본문 없는 요청 하나예요. "해봤어요" 시각만 기록돼요.', 'server'));
      },
    },
  ],
};

export const aiConsent: Scenario = {
  key: 'ai-consent',
  group: 'home',
  title: 'AI 관찰 기록 동의 켜고 끄기',
  summary: '아이마다 따로 켜요. 무엇이 어디로 가고 언제 지워지는지 읽고 체크해야 켜지고, 끄면 그동안의 관찰 기록이 지워져요.',
  needs: 'child',
  badges: ['AI 서버 필요'],
  minutes: 2,
  aiDependent: true,
  steps: ({ aiOn }) =>
    aiOn
      ? [
          { kind: 'as', account: 'parent' },
          { kind: 'goto', path: childHome, target: '@ai-card', say: n('AI 관찰 기록', '지금은 꺼져 있어서 사진을 한 장도 보내지 않아요.') },
          { kind: 'click', target: '@ai-open' },
          {
            kind: 'say',
            target: '@ai-facts',
            say: n('무엇이, 어디로', '장면 사진 최대 6장만 AI 서버로 가요. 소리와 영상 원본은 보내지 않아요. AI가 사진을 보고 짧은 글로 적어요.', 'ai'),
          },
          {
            kind: 'say',
            target: '@ai-facts',
            say: n('언제 지워지나요', '사진은 살펴본 직후 지워요. AI가 적은 글만 남고 기본은 보호자만 봐요. 끄면 그동안의 관찰 기록이 모두 지워져요.', 'ai', 'server'),
          },
          {
            kind: 'do',
            target: '@ai-agree',
            run: async (ctx) => {
              await ctx.say(
                ctx.driver.isDisabled('@ai-agree')
                  ? n('체크하기 전에는 못 켜요', '"동의하고 켜기"가 눌리지 않는 상태예요.')
                  : n('동의하고 켜기', '체크한 뒤에 켤 수 있어요.'),
              );
            },
          },
          { kind: 'click', target: '@ai-check' },
          {
            kind: 'click',
            target: '@ai-agree',
            expect: { method: 'PUT', path: /\/ai-consent$/, status: [200, 201, 204] },
            after: n('이렇게 갔어요', '동의 여부와 동의서 버전만 가요. 이제 이 아이는 영상 기록 뒤 장면 사진으로 관찰 기록을 만들 수 있어요.', 'server'),
          },
          {
            kind: 'say',
            say: n(
              '사진이 가는 길',
              '① 기록 서버에서 10분짜리 분석 토큰을 받고 ② 사진은 AI 서버로만 가서 살펴본 뒤 지워지고 ③ 기록 서버에는 AI가 적은 글만 저장돼요.',
              'server',
              'ai',
            ),
          },
          { kind: 'click', target: '@ai-off', say: n('다시 끄기', '시작할 때처럼 꺼 둘게요.') },
          { kind: 'say', target: '@ai-off-confirm', say: n('한 번 더 확인해요', '끄면 이 아이의 AI 관찰 기록이 모두 지워지고 되돌릴 수 없어요.') },
          {
            kind: 'click',
            target: '@ai-off-confirm',
            expect: { method: 'DELETE', path: /\/ai-consent$/, status: [200, 204] },
            after: n('껐어요', '서버가 이 아이의 AI 관찰 기록을 모두 지웠어요. 숫자 기록과 코칭 카드는 그대로 남아요.', 'server'),
          },
        ]
      : [
          { kind: 'as', account: 'parent' },
          { kind: 'goto', path: childHome },
          {
            kind: 'say',
            say: n('지금은 AI 서버가 꺼져 있어요', '그래서 켜는 카드가 보이지 않아요. 켜져 있으면 무엇이 어디로 가는지 읽고 체크한 뒤에만 켤 수 있어요.', 'ai'),
          },
          {
            kind: 'say',
            say: n('켜면 무엇이 가나요', '장면 사진 최대 6장만 AI 서버로 가서 살펴본 직후 지워지고, AI가 적은 글만 남아요. 끄면 그동안의 관찰 기록이 모두 지워져요.', 'ai', 'server'),
          },
        ],
};

export const childEdit: Scenario = {
  key: 'child-edit',
  group: 'home',
  title: '아이 정보 고치기',
  summary: '바꾼 칸만 서버로 보내요. 바꾸지 않은 칸은 요청에 담기지 않아요.',
  needs: 'child',
  badges: ['입력 과정 보기'],
  minutes: 1,
  steps: () => [
    { kind: 'as', account: 'parent' },
    { kind: 'goto', path: childHome, target: '@childhome-edit-link', say: n('정보 고치기', '아이 이름 옆 "정보 고치기"를 눌러요.') },
    { kind: 'click', target: '@childhome-edit-link' },
    {
      kind: 'type',
      target: '@child-edit-nickname',
      clear: true,
      text: '콩콩이',
      say: n('별칭만 바꿔요', '태어난 해와 달은 그대로 두고 별칭만 고칠게요.'),
    },
    {
      kind: 'click',
      target: '@child-edit-submit',
      expect: { method: 'PATCH', path: /\/children\/\d+$/, status: 200 },
      after: n('바꾼 칸만 갔어요', '요청에는 별칭 하나만 담겼어요. 바꾸지 않은 칸은 보내지 않아요.', 'server'),
    },
  ],
};

export const recordsList: Scenario = {
  key: 'records',
  group: 'home',
  title: '기록 하나씩 보기·지우기',
  summary: '지난 기록을 한 건씩 보고, 확인을 거쳐 지울 수 있어요.',
  needs: 'records',
  badges: [],
  minutes: 1,
  steps: () => [
    { kind: 'as', account: 'parent' },
    { kind: 'goto', path: childHome, target: '@childhome-records-link', say: n('기록 목록', '주간 기록 아래 "기록 하나씩 보기·지우기"로 가요.') },
    { kind: 'click', target: '@childhome-records-link' },
    { kind: 'wait', route: /\/records$/ },
    { kind: 'click', target: '@records-delete', say: n('한 건 지우기', '맨 위 기록을 지워 볼게요.') },
    { kind: 'say', target: '@records-delete-confirm', say: n('한 번 더 확인해요', '지우면 되돌릴 수 없어서 한 번 더 물어요.') },
    {
      kind: 'click',
      target: '@records-delete-confirm',
      expect: { method: 'DELETE', path: /\/interaction-records\/\d+$/, status: [200, 204] },
      after: n('지웠어요', '서버에서 그 기록이 지워지고 주간 요약에서도 빠져요.', 'server'),
    },
  ],
};

export const weekly: Scenario = {
  key: 'weekly',
  group: 'home',
  title: '주간 기록 보기',
  summary: '매번의 숫자 대신 주 단위 변화를 보여 줘요. 항목을 바꿔 가며 볼 수 있어요.',
  needs: 'records',
  badges: [],
  minutes: 1,
  steps: () => [
    { kind: 'as', account: 'parent' },
    { kind: 'goto', path: childHome, target: '#childhome-week-h', say: n('주간 기록', '매일 열어 보지 않아도 되도록 주 단위로 모아 보여 줘요. 예시 기록은 시연을 위해 넣은 숫자예요.') },
    { kind: 'click', target: '@weekly-metric-responseLatencySec', say: n('반응까지 걸린 시간', '항목을 바꾸면 같은 주들의 다른 숫자를 보여 줘요.') },
    { kind: 'click', target: '@weekly-metric-distressPerTenMinutes', say: n('크게 운 횟수', '10분당 횟수로 맞춰 보여 줘요. 화면 안에서만 바뀌고 서버에 다시 묻지 않아요.', 'device') },
    { kind: 'click', target: '@weekly-metric-jointPlayRatio' },
  ],
};
