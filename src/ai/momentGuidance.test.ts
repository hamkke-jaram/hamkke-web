import { describe, expect, it } from 'vitest';
import { contextGuidance, guidanceOptionsFor } from './momentGuidance.mjs';

describe('guidance options for one recorded moment', () => {
  it.each([
    ['손이 파란 블록 위에 노란 블록을 올려요.', 'stack-turn'],
    ['아이가 블록을 옮기고 있어요.', 'block-turn'],
    ['파란 블록이 노란 블록 위에 놓여 있어요.', 'block-context'],
    ['아이가 물건을 어른에게 건네요.', 'receive-object'],
    ['아이가 손가락으로 그림을 가리켜요.', 'follow-point'],
    ['아이가 손을 내밀며 도움을 청해요.', 'offer-help'],
    ['아이가 블록을 밀어내요.', 'pause-offer'],
    ['아이가 선생님이 건넨 장난감을 밀어내요.', 'pause-offer'],
    ['아이가 이미 쌓인 블록 위에 새 블록을 올려요.', 'stack-turn'],
    ['아이가 블록을 포개 놓아요.', 'stack-turn'],
    ['사람이 바닥에 놓인 세 개의 블록을 바라봐요.', 'watch-block-choice'],
    ['사람이 파란색 블록을 노란색 블록 위에 올려놓아요.', 'check-stack-turn'],
    ['사람이 분홍색 블록을 바닥에 놓인 블록 옆에서 집어요.', 'check-block-pick'],
    ['보호자의 손이 블록을 옮겨요.', 'after-adult-turn'],
    ['어른이 세 개의 블록을 바닥에 놓아요.', 'after-adult-turn'],
    ['어른이 노란색 블록을 집어요.', 'after-adult-pick'],
    ['어른이 노란색 블록 위에 파란색 블록을 올려요.', 'after-adult-stack'],
    ['어른이 분홍색 블록을 아이에게 건네요.', 'adult-offers-block'],
    ['아이가 책장을 넘겨요.', 'page-turn'],
    ['아이가 손에 들고 있는 물건을 들어올려요.', 'object-turn'],
    ['아이가 손에 장난감을 들고 어른을 바라봐요.', 'notice-object'],
    ['아이가 머리 위로 책을 들어 올리고 있어요.', 'overhead-space'],
  ])('chooses an action supported by “%s”', (note, id) => {
    expect(guidanceOptionsFor(note)[0].id).toBe(id);
  });

  it.each([
    '어른이 손을 움직이며 아이를 바라보고 있어요.',
    '아이의 손에 장난감이 있고 어른이 아이를 바라보아요.',
    '어른이 입을 열고 있어요.',
    '블록을 쌓지 않아요.',
    '아이가 블록을 안 쌓아요.',
    '아이가 물건을 건넨 것 같아요.',
    '아이가 어른을 바라보고 있어요.',
    '아이가 어른에게 돌멩이를 던지지 않아요.',
    '서 있어요.',
    null,
  ])('asks for context without assigning another person’s action to the child', (note) => {
    expect(guidanceOptionsFor(note)).toEqual([contextGuidance]);
  });

  it('puts checking the space ahead of waiting for play to continue', () => {
    const [immediate] = guidanceOptionsFor('아이가 어른 쪽으로 딱딱한 블록을 던져요.');
    expect(immediate.decision).toBe('SAFETY');
    expect(guidanceOptionsFor('아이가 친구의 머리를 손으로 때리고 있어요.')[0].decision).toBe('SAFETY');
    expect(guidanceOptionsFor('아이가 딱딱한 블록을 옆 친구의 얼굴 쪽으로 던져요.')[0].decision).toBe('SAFETY');
    expect(guidanceOptionsFor('어른이 아이에게 공을 던져요.')[0].decision).toBe('CHECK');
    expect(guidanceOptionsFor('아이가 돌멩이를 허공에 던져요.')[0].decision).toBe('CHECK');
    expect(guidanceOptionsFor('아이가 돌멩이를 내려놓고 어른에게 공을 던져요.')[0].decision).toBe('CHECK');
  });

  it('keeps a hand-only observation conditional and avoids assigning the hand to a child', () => {
    for (const option of guidanceOptionsFor('손이 테이블에서 블록을 쌓고 있어요.')) {
      expect(option.decision).toBe('WAIT');
      expect(option.action).toMatch(/있다면|중이면/);
    }
  });
});
