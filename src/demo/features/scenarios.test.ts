import { describe, expect, it } from 'vitest';
import { isTarget, toSelector } from './anchors';
import { GROUPS, SCENARIOS } from './scenarios';
import type { Step, Target } from './types';

/*
 * 시나리오 정의 확인. 시연이 가리키는 화면 요소('@이름' → data-demo, '#아이디' → id)가
 * 실제 화면 소스에 있는지 정적으로 살펴본다(이름을 바꾸면 여기서 먼저 알 수 있다).
 */

const appSources = import.meta.glob<string>(['../../**/*.{ts,tsx}', '!../../demo/**', '!../../**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

const scenarioSources = import.meta.glob<string>('./scenarios/*.ts', { query: '?raw', import: 'default', eager: true });

function collectAnchors() {
  const demo = new Set<string>();
  const prefixes: string[] = [];
  const ids = new Set<string>();
  for (const src of Object.values(appSources)) {
    for (const m of src.matchAll(/data-demo="([^"]+)"/g)) demo.add(m[1]);
    // DangerAction·MoreButton의 demo 이름. DangerAction은 확인·취소 버튼에 -confirm·-cancel을 붙인다.
    for (const m of src.matchAll(/\bdemo="([^"]+)"/g)) {
      demo.add(m[1]);
      demo.add(`${m[1]}-confirm`);
      demo.add(`${m[1]}-cancel`);
    }
    // 객체에 둔 이름(예: Reconsent의 demo: 'reconsent-terms')
    for (const m of src.matchAll(/\bdemo: '([^']+)'/g)) demo.add(m[1]);
    // data-demo={`share-switch-${it.key}`} 같은 이름은 앞부분만 확인한다.
    for (const m of src.matchAll(/data-demo=\{`([A-Za-z0-9-]+)\$\{/g)) prefixes.push(m[1]);
    for (const m of src.matchAll(/\bid="([^"]+)"/g)) {
      ids.add(m[1]);
      // Field·PasswordField가 붙이는 도움말·오류 id
      ids.add(`${m[1]}-hint`);
      ids.add(`${m[1]}-err`);
    }
  }
  return { demo, prefixes, ids };
}

const anchors = collectAnchors();

function exists(t: Target) {
  const name = t.slice(1);
  if (t.startsWith('#')) return anchors.ids.has(name);
  return anchors.demo.has(name) || anchors.prefixes.some((p) => name.startsWith(p) && name.length > p.length);
}

function stepTargets(step: Step): Target[] {
  const out: Target[] = [];
  if ('target' in step && step.target) out.push(step.target);
  if (step.kind === 'do' && step.uses) out.push(...step.uses);
  return out;
}

function allSteps() {
  return SCENARIOS.flatMap((s) => [true, false].flatMap((aiOn) => s.steps({ aiOn }).map((step) => ({ s, step }))));
}

describe('시나리오 정의', () => {
  it('화면 소스에서 시연 표식을 읽어 왔다', () => {
    expect(anchors.demo.has('signup-email')).toBe(true);
    expect(anchors.demo.has('account-delete-confirm')).toBe(true);
    expect(anchors.prefixes).toContain('share-switch-');
    expect(anchors.ids.has('signup-pw-err')).toBe(true);
  });

  it('이름이 겹치지 않고, 메뉴 그룹에 속하고, 단계가 있다', () => {
    const keys = SCENARIOS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const s of SCENARIOS) {
      expect(GROUPS.map((g) => g.key)).toContain(s.group);
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.summary.length).toBeGreaterThan(0);
      expect(s.steps({ aiOn: true }).length).toBeGreaterThan(0);
      expect(s.steps({ aiOn: false }).length).toBeGreaterThan(0);
    }
  });

  it('모든 단계의 대상이 실제 화면 소스에 있다', () => {
    const missing: string[] = [];
    for (const { s, step } of allSteps()) {
      for (const t of stepTargets(step)) {
        if (!isTarget(t)) missing.push(`${s.key}: 모양이 이상한 이름 ${t}`);
        else if (!exists(t)) missing.push(`${s.key}: ${t}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('시나리오 코드 안에서 직접 쓰는 이름(ctx.driver 등)도 화면 소스에 있다', () => {
    const missing: string[] = [];
    for (const [file, src] of Object.entries(scenarioSources)) {
      for (const m of src.matchAll(/['"`]([@#][A-Za-z][A-Za-z0-9-]*)['"`]/g)) {
        const t = m[1] as Target;
        if (!exists(t)) missing.push(`${file}: ${t}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('글자를 넣는 단계와 기다리는 요청이 올바른 모양이다', () => {
    for (const { s, step } of allSteps()) {
      if (step.kind === 'type') expect(step.target.startsWith('@') || step.target.startsWith('#'), s.key).toBe(true);
      if ((step.kind === 'click' || step.kind === 'do') && step.expect) {
        expect(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], s.key).toContain(step.expect.method);
        expect(step.expect.path).toBeInstanceOf(RegExp);
      }
      if (step.say && typeof step.say !== 'function') {
        expect(step.say.title.length, s.key).toBeGreaterThan(0);
        expect(step.say.body.length, s.key).toBeGreaterThan(0);
      }
    }
  });

  it('카메라를 켜는 버튼은 누르지 않는다(사람이 허락해야 하는 일)', () => {
    for (const { s, step } of allSteps()) {
      if (step.kind === 'click') expect(['@observe-camera-on', '@observe-start', '@record-camera'], s.key).not.toContain(step.target);
    }
  });
});

describe('셀렉터', () => {
  it('@이름은 data-demo, #아이디는 id 셀렉터가 된다', () => {
    expect(toSelector('@signup-email')).toBe('[data-demo="signup-email"]');
    expect(toSelector('#childhome-story-h')).toBe('#childhome-story-h');
  });

  it('이상한 이름은 받지 않는다', () => {
    expect(isTarget('@ok-name')).toBe(true);
    expect(isTarget('signup-email')).toBe(false);
    expect(isTarget('@bad name')).toBe(false);
  });
});
