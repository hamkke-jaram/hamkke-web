import { describe, expect, it, vi } from 'vitest';
import { recheckTeacherDraft, suggestTeacherSupport } from './recheck.mjs';
import { contextGuidance, guidanceOptionsFor } from '../../src/ai/momentGuidance.mjs';

const stack = { timeSec: 6.6, note: '아이가 블록을 하나씩 쌓아요.' };
const unclear = { timeSec: 9.4, note: '누가 무엇을 하는지 확인하기 어려워요.' };
const signal = () => new AbortController().signal;

describe('시연의 장면별 대응 제안', () => {
  it('공통 규칙이 허용한 선택지 하나만 받아들이고 해당 장면의 근거와 시각을 그대로 붙인다', async () => {
    const options = guidanceOptionsFor(stack.note);
    expect(options.length).toBeGreaterThan(1);
    const option = options.at(-1);
    const select = vi.fn(async (rows, _prompt, schema) => {
      expect(rows.map((row) => row.key)).toEqual(['moment1']);
      expect(schema.properties.moment1.enum).toEqual(options.map(({ id }) => id));
      return { moment1: option.id };
    });
    const result = await suggestTeacherSupport({ observations: [stack, unclear] }, signal(), select);
    expect(result.source).toBe('ollama');
    expect(result.guidance).toEqual([
      { timeSec: stack.timeSec, evidence: stack.note, decision: option.decision, action: option.action, watchFor: option.watchFor },
      { timeSec: unclear.timeSec, evidence: unclear.note, decision: 'CHECK', action: contextGuidance.action, watchFor: contextGuidance.watchFor },
    ]);
  });

  it.each([
    ['잘못된 선택', async () => ({ moment1: '없는 선택 대신 의료 조치를 하세요.' })],
    ['모델 연결 실패', async () => { throw new Error('offline'); }],
  ])('%s 시 모든 장면의 근거와 대응을 보존하고 출처를 구분한다', async (_case, select) => {
    const result = await suggestTeacherSupport({ observations: [stack, unclear] }, signal(), select);
    expect(result).toMatchObject({ source: 'observation-rules', model: null });
    expect(result.guidance.map(({ timeSec, evidence }) => [timeSec, evidence])).toEqual([
      [stack.timeSec, stack.note], [unclear.timeSec, unclear.note],
    ]);
    expect(result.guidance[0].action).toBe(guidanceOptionsFor(stack.note)[0].action);
    expect(result.guidance[1].decision).toBe('CHECK');
    expect(result.suggestions[0].detail).toContain(result.guidance[0].watchFor);
  });

  it.each(['아이가 블록을 하나씩 쌓아요.', ''])('장면별 근거가 없으면 전체 요약으로 개입을 결정하지 않는다', async (observationSummary) => {
    const select = vi.fn();
    const result = await suggestTeacherSupport({ observations: [], observationSummary }, signal(), select);
    expect(result.guidance).toMatchObject([{ timeSec: null, evidence: observationSummary, decision: 'CHECK' }]);
    expect(select).not.toHaveBeenCalled();
  });

  it('사용자가 취소한 요청에는 대체 응답을 반환하지 않는다', async () => {
    const controller = new AbortController();
    await expect(suggestTeacherSupport({ observations: [stack] }, controller.signal, async () => {
      controller.abort();
      throw controller.signal.reason;
    })).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('교사가 고친 지원안 재검토', () => {
  async function checkSupport(proposedSupport, teacherContext = '') {
    const result = await recheckTeacherDraft({
      observations: [stack], teacherDraft: stack.note, teacherContext, proposedSupport,
    }, signal(), async () => ({ checks: [] }));
    return result.checks.filter(({ kind }) => kind === 'WORDING');
  }

  it.each([
    ['아이가 손을 놓아도 강제로 손을 잡아 쌓게 해 주세요.', '거절하면 멈출 수 있게'],
    ['아이는 절대로 혼자 할 수 없어요.', '직접 본 행동'],
    ['매번 어른이 대신 쌓아 주세요.', '도울 시점'],
  ])('단정적이거나 선택권이 빠진 지원안에 보낼 문장을 인용해 피드백을 준다', async (edit, hint) => {
    const checks = await checkSupport(edit);
    expect(checks).toHaveLength(1);
    expect(checks[0].detail).toContain('“' + edit + '”');
    expect(checks[0].detail).toContain(hint);
    expect(checks[0].timeSec).toBeNull();
  });

  it.each([
    ['아이가 원하면 한 개만 대신 쌓아 주세요.', ''],
    ['블록을 잡은 손을 강제로 움직이지 말고 잠시 기다려 주세요.', ''],
    ['대신 쌓아 주지 마세요. 아이가 블록을 내려놓을 때까지 기다려 주세요.', ''],
    ['어른이 한 개만 대신 쌓아 주세요.', '수업 중 아이가 블록을 건네며 도와 달라고 했어요.'],
  ])('조건부 도움, 거절 존중, 교사가 직접 적은 맥락을 존중한다', async (edit, context) => {
    expect(await checkSupport(edit, context)).toEqual([]);
  });
});
