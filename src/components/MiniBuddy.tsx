import { useEffect, useRef } from 'react';
import { useMotionOn } from '../motion';
import { buddy, type BuddyKind } from './buddyBus';
import Mascot, { type MascotName } from './Mascot';

/*
 * 한자리에 앉아 있는 작은 모찌. 돌아다니는 모찌(MochiBuddy)가 없는 화면(이야기·촬영)이나 좁은 자리에 둔다.
 * buddyBus 신호에 맞춰 그 자리에서 움직인다: 축하=폴짝+하트, 응원=두 번 뜀, 인사=좌우로 흔들, 엿보기=쏙 들어갔다 빼꼼,
 * 생각=머리 위 점 세 개, 졸기=꾸벅. 꾸밈이라 낭독하지 않고 누를 수도 없다.
 * '움직이는 캐릭터'가 꺼져 있으면 신호를 듣지 않는다(그림만 있다). 모양은 styles.css '움직임 체계'.
 */

const KINDS: BuddyKind[] = ['celebrate', 'cheer', 'wave', 'peek', 'think', 'sleep'];

export default function MiniBuddy({ name = 'dome', size = 34, className }: { name?: MascotName; size?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const motionOn = useMotionOn();

  useEffect(() => {
    if (!motionOn) return;
    let clear = 0;
    const off = buddy.on((kind) => {
      const el = ref.current;
      if (!el) return;
      el.classList.remove(...KINDS.map((k) => `mini-${k}`));
      void el.offsetWidth; // 같은 신호가 이어 와도 처음부터 다시
      el.classList.add(`mini-${kind}`);
      window.clearTimeout(clear);
      clear = window.setTimeout(() => el.classList.remove(`mini-${kind}`), 2400);
    });
    return () => {
      off();
      window.clearTimeout(clear);
    };
  }, [motionOn]);

  return (
    <span ref={ref} className={className ? `mini-buddy ${className}` : 'mini-buddy'} style={{ width: size }} aria-hidden="true">
      <span className="mini-body">
        <Mascot name={name} size={size} />
      </span>
      <span className="mini-heart">♥</span>
      <span className="mini-dots">
        <span />
        <span />
        <span />
      </span>
    </span>
  );
}
