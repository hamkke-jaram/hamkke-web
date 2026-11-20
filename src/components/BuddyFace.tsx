import type { Ref } from 'react';
import type { MascotName } from './Mascot';
import type { BuddyEyes } from './buddyPhysics';

/*
 * 돌아다니는 모찌(MochiBuddy)의 눈. 그림(webp)의 눈 자리를 몸 색으로 살짝 덮고 그 위에 눈을 다시 그려
 * 깜빡이고(‿), 웃고(^^), 쳐다보고(눈동자 이동), 어지러워한다(@@).
 * 평소처럼 정면을 보고 뜬 눈이면 덮개째 숨겨 원래 그림의 눈이 그대로 보인다.
 * 좌표는 원본 그림 픽셀(640px 너비) 기준. 그림 파일을 바꾸면 아래 값도 다시 잰다(눈 가운데·반지름·주변 몸 색).
 */

interface EyeRig {
  w: number;
  h: number;
  eyes: [[number, number], [number, number]];
  /** 눈동자 반지름. */
  r: number;
  /** 눈 둘레의 몸 색(덮개). */
  body: string;
  ink: string;
}

export const EYE_RIG: Partial<Record<MascotName, EyeRig>> = {
  dome: { w: 640, h: 505, eyes: [[276, 200], [369, 199]], r: 16.5, body: '#fddc96', ink: '#6b3d1c' },
  // 안경알 안쪽 반지름이 약 30이라 덮개가 테를 넘지 않는다.
  teacher: { w: 640, h: 539, eyes: [[278, 162], [365, 160]], r: 15, body: '#fdcc72', ink: '#6b3d1c' },
};

function spiral(r: number) {
  const pts: string[] = [];
  for (let i = 0; i <= 40; i++) {
    const t = (i / 40) * Math.PI * 4;
    const rr = r * (0.12 + 0.88 * (i / 40));
    pts.push(`${(Math.cos(t) * rr).toFixed(1)} ${(Math.sin(t) * rr).toFixed(1)}`);
  }
  return `M ${pts.join(' L ')}`;
}

/**
 * svgRef가 있으면 매 장면 paintFace로 바꾼다(돌아다니는 모찌). 없으면 eyes로 정한 눈을 늘 그린다
 * (화면 속 캐릭터의 깜빡임 덮개: CSS가 잠깐씩만 보이게 한다).
 */
export function BuddyFace({ name, svgRef, eyes, className }: { name: MascotName; svgRef?: Ref<SVGSVGElement>; eyes?: BuddyEyes; className?: string }) {
  const rig = EYE_RIG[name];
  if (!rig) return null;
  const { r, ink } = rig;
  const line = { fill: 'none', stroke: ink, strokeWidth: r * 0.42, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const gid = `buddy-patch-${name}${eyes ? `-${eyes}` : ''}`;
  return (
    <svg
      ref={svgRef}
      className={className ? `buddy-face ${className}` : 'buddy-face'}
      viewBox={`0 0 ${rig.w} ${rig.h}`}
      preserveAspectRatio="none"
      data-eyes={eyes ?? 'open'}
      style={eyes ? undefined : { display: 'none' }}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={gid}>
          <stop offset="0.72" stopColor={rig.body} />
          <stop offset="1" stopColor={rig.body} stopOpacity="0" />
        </radialGradient>
      </defs>
      {rig.eyes.map(([cx, cy], i) => (
        <g key={i} transform={`translate(${cx} ${cy})`}>
          <circle r={r * 1.75} fill={`url(#${gid})`} />
          <g className="eye-open">
            <g className="eye-pupil">
              <circle r={r} fill={ink} />
              <circle cx={-r * 0.32} cy={-r * 0.36} r={r * 0.3} fill="#ffffff" opacity="0.85" />
            </g>
          </g>
          <path className="eye-closed" d={`M ${-r} 0 Q 0 ${r * 0.95} ${r} 0`} {...line} />
          <path className="eye-happy" d={`M ${-r} ${r * 0.4} Q 0 ${-r * 1} ${r} ${r * 0.4}`} {...line} />
          <path className="eye-dizzy" d={spiral(r * 1.05)} {...line} strokeWidth={r * 0.28} />
        </g>
      ))}
    </svg>
  );
}

/** 매 장면 눈을 바꾼다. 바뀐 것만 고친다. 덮을 필요가 없으면(정면·뜬 눈) 통째로 숨긴다. */
export function paintFace(svg: SVGSVGElement | null, name: MascotName, eyes: BuddyEyes, lookX: number, lookY: number) {
  const rig = EYE_RIG[name];
  if (!svg || !rig) return;
  const dx = Math.round(lookX * rig.r * 0.6);
  const dy = Math.round(lookY * rig.r * 0.45);
  const plain = eyes === 'open' && dx === 0 && dy === 0;
  const display = plain ? 'none' : '';
  if (svg.style.display !== display) svg.style.display = display;
  if (plain) return;
  if (svg.dataset.eyes !== eyes) svg.dataset.eyes = eyes;
  const t = `translate(${dx} ${dy})`;
  svg.querySelectorAll<SVGGElement>('.eye-pupil').forEach((g) => {
    if (g.getAttribute('transform') !== t) g.setAttribute('transform', t);
  });
}
