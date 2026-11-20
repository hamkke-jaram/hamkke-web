/*
 * 모찌에게 보내는 신호. 화면은 보호자·선생님이 한 행동(저장, 보냄, 해봤어요 등)이 끝났을 때만 부른다.
 * 아이의 지표나 기록 내용에 따라 부르지 않는다(기뻐하거나 슬퍼하면 평가로 읽힌다).
 *
 *   import { buddy } from '../components/buddyBus';
 *   buddy.emit('celebrate');
 *
 * 받는 쪽은 돌아다니는 모찌(MochiBuddy)다. '움직이는 캐릭터'가 꺼져 있거나 모찌가 없는 화면이면
 * 아무도 듣지 않으므로 그냥 지나간다. 부르는 쪽에서 따로 확인할 것은 없다.
 */

export type BuddyKind =
  /** 축하: 폴짝 뛰고 하트 */
  | 'celebrate'
  /** 응원: 두 번 뜀 */
  | 'cheer'
  /** 인사: 손 흔들기 */
  | 'wave'
  /** 엿보기: 화면 가장자리에서 빼꼼 */
  | 'peek'
  /** 생각: 머리 위 점 세 개 */
  | 'think'
  /** 졸기 */
  | 'sleep';

export type BuddyListener = (kind: BuddyKind) => void;

const listeners = new Set<BuddyListener>();

export const buddy = {
  emit(kind: BuddyKind): void {
    listeners.forEach((fn) => {
      try {
        fn(kind);
      } catch {
        /* 꾸밈이 화면 동작을 깨뜨리지 않게 */
      }
    });
  },
  /** 신호를 듣는다. 돌려준 함수를 부르면 그만 듣는다. */
  on(fn: BuddyListener): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};
