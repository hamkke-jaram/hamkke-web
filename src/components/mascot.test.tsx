import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import EmptyState from './EmptyState';
import Mascot, { MASCOT_NAMES, mascotSrc } from './Mascot';
import { ICON_NAMES, Icon } from './icons';

// 그림 파일(public/characters/*.webp)이 있는지는 보지 않는다 — 파일이 없어도 화면이 깨지지 않는 것이 조건이다.

describe('캐릭터 그림(Mascot)', () => {
  it('이름마다 public/characters 아래의 파일을 가리킨다', () => {
    expect([...MASCOT_NAMES]).toEqual(['family', 'teddy', 'dome', 'friend', 'teacher']);
    for (const name of MASCOT_NAMES) expect(mascotSrc(name)).toBe(`/characters/${name}.webp`);
  });

  it('꾸밈 그림으로(alt 없음) 너비와 비율에 맞는 높이를 정해 그린다', () => {
    const html = renderToStaticMarkup(<Mascot name="family" size={160} />);
    expect(html).toContain('src="/characters/family.webp"');
    expect(html).toContain('alt=""');
    expect(html).toContain('width="160"');
    // 가로로 긴 그림(640×462)이라 높이는 너비보다 작다. 불러오기 전에 자리를 잡는 값이다.
    expect(html).toContain('height="116"');
    expect(html).toContain('class="mascot"');
  });

  it('크기를 안 주면 120, className은 덧붙는다', () => {
    const html = renderToStaticMarkup(<Mascot name="teacher" className="small" />);
    expect(html).toContain('width="120"');
    expect(html).toContain('class="mascot small"');
  });
});

describe('빈 화면 안내(EmptyState)', () => {
  it('캐릭터 → 제목 → 설명 → 버튼 순서로 그린다', () => {
    const html = renderToStaticMarkup(
      <EmptyState mascot="teacher" title="아직 연결된 선생님이 없어요" action={<button type="button">선생님 연결하기</button>}>
        공유할 항목을 선택하고 초대 코드를 보내요
      </EmptyState>,
    );
    const at = (text: string) => html.indexOf(text);
    expect(at('/characters/teacher.webp')).toBeGreaterThan(-1);
    expect(at('/characters/teacher.webp')).toBeLessThan(at('아직 연결된 선생님이 없어요'));
    expect(at('아직 연결된 선생님이 없어요')).toBeLessThan(at('공유할 항목을 선택하고'));
    expect(at('공유할 항목을 선택하고')).toBeLessThan(at('선생님 연결하기'));
    expect(html).toContain('<h2 class="empty-state-title">');
    expect(html).toContain('<p>공유할 항목을 선택하고 초대 코드를 보내요</p>');
    expect(html).toContain('width="160"');
  });

  it('캐릭터·설명·버튼은 빼도 되고, 제목 단계와 id를 정할 수 있다', () => {
    const html = renderToStaticMarkup(<EmptyState title="찾으시는 화면이 없어요" titleAs="h1" titleId="nf-h" />);
    expect(html).not.toContain('<img');
    expect(html).not.toContain('empty-state-body');
    expect(html).not.toContain('empty-state-action');
    // id를 준 제목은 코드에서 포커스를 옮길 수 있다(탭 순서에는 들지 않는다).
    expect(html).toContain('<h1 id="nf-h" tabindex="-1" class="empty-state-title">');
  });

  it('설명에 문단 여러 개를 그대로 넣을 수 있다', () => {
    const html = renderToStaticMarkup(
      <EmptyState title="제목" mascot="dome" mascotSize={120}>
        <p>첫 줄</p>
        <p>둘째 줄</p>
      </EmptyState>,
    );
    expect(html).toContain('<div class="empty-state-body"><p>첫 줄</p><p>둘째 줄</p></div>');
    expect(html).toContain('width="120"');
  });
});

describe('목록 행 아이콘', () => {
  it('모두 꾸밈(aria-hidden)이고 글자색을 따른다', () => {
    for (const name of ICON_NAMES) {
      const html = renderToStaticMarkup(<Icon name={name} />);
      expect(html, name).toContain('aria-hidden="true"');
      expect(html, name).toContain('stroke="currentColor"');
      expect(html, name).toContain('class="menu-icon"');
    }
  });
});
