import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { ACCENT } from './fonts';
import { W, H } from '../piano';

// Flicker da 11 frame sui tagli: graffi, polvere, lampo, griglia verde.
// tear=true aggiunge le strisce di carta millimetrata strappata.
export const BlueprintFlicker: React.FC<{ seed: number; tear?: boolean; intensity?: number }> = ({ seed, tear = false, intensity = 1 }) => {
  const frame = useCurrentFrame();
  const rnd = (n: number) => { const x = Math.sin((n + seed * 101.3) * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
  const pattern = [1, 0.35, 0.95, 0.6, 0.15, 0.85, 0.4, 0.1, 0.55, 0.05, 0.3, 0];
  const vis = (pattern[frame] ?? 0) * intensity;
  const flash = [0.22, 0, 0.14, 0, 0.07, 0, 0, 0][frame] || 0;
  const f = frame + 1;

  const scratches = Array.from({ length: 6 }, (_, i) => {
    const x = rnd(f * 31 + i) * W;
    const y0 = rnd(f * 17 + i) * H * 0.6;
    const len = 300 + rnd(f * 13 + i) * 900;
    let d = `M ${x} ${y0}`;
    for (let s = 1; s <= 8; s++) d += ` L ${x + (rnd(f * 7 + i * 9 + s) - 0.5) * 14} ${y0 + (len / 8) * s}`;
    return { d, w: 1 + rnd(f * 3 + i) * 2.5, o: 0.35 + rnd(f * 5 + i) * 0.5 };
  });
  const hairs = Array.from({ length: 5 }, (_, i) => {
    const y = rnd(f * 41 + i) * H;
    const x0 = rnd(f * 43 + i) * W * 0.7;
    const len = 80 + rnd(f * 47 + i) * 260;
    let d = `M ${x0} ${y}`;
    for (let s = 1; s <= 10; s++) d += ` L ${x0 + (len / 10) * s} ${y + (rnd(f * 53 + i * 11 + s) - 0.5) * 10}`;
    return d;
  });
  const dust = Array.from({ length: 34 }, (_, i) => ({
    x: rnd(f * 61 + i) * W, y: rnd(f * 67 + i) * H, r: 1 + rnd(f * 71 + i) * 4.5, o: 0.4 + rnd(f * 73 + i) * 0.6,
  }));
  const jag = (x0: number, i: number, side: number) => {
    const pts: [number, number][] = [];
    for (let s = 0; s <= 40; s++) {
      const y = -200 + ((H + 400) / 40) * s;
      pts.push([x0 + (rnd(i * 97 + s * 3 + side) - 0.5) * 46 + Math.sin(s * 0.7 + i) * 18, y]);
    }
    return pts;
  };
  const strips = tear ? [0, 1].map((i) => {
    const t = interpolate(frame, [i * 2, 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) });
    const width = i === 0 ? 170 : 110;
    const cx = -350 + t * (W + 700) + i * 160;
    const left = jag(cx - width / 2, i + 1, 0);
    const right = jag(cx + width / 2, i + 1, 5).reverse();
    const pts = left.concat(right).map(([x, y]) => `${x},${y}`).join(' ');
    return { pts, cx };
  }) : [];

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', left: 0, top: 0 }}>
        <defs>
          <pattern id={`bpgrid${seed}`} width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke={ACCENT} strokeWidth="1" />
          </pattern>
        </defs>
        <rect width={W} height={H} fill="#FFFFFF" opacity={flash * intensity} />
        <rect width={W} height={H} fill={`url(#bpgrid${seed})`} opacity={frame % 2 === 0 ? 0.22 * vis : 0} />
        <g opacity={vis}>
          {scratches.map((s, i) => (
            <path key={i} d={s.d} fill="none" stroke={i === 0 ? ACCENT : '#FFFFFF'} strokeWidth={s.w} opacity={s.o} />
          ))}
          {hairs.map((d, i) => <path key={'h' + i} d={d} fill="none" stroke="#FFFFFF" strokeWidth={1.6} opacity={0.6} />)}
          {dust.map((p, i) => <circle key={'d' + i} cx={p.x} cy={p.y} r={p.r} fill="#FFFFFF" opacity={p.o} />)}
        </g>
        {strips.map((s, i) => (
          <g key={'s' + i} transform={`rotate(-7 ${s.cx} ${H / 2})`}>
            <polygon points={s.pts} fill="#000000" opacity={0.18} transform="translate(6 4)" />
            <clipPath id={`bptear${seed}_${i}`}><polygon points={s.pts} /></clipPath>
            <polygon points={s.pts} fill="#F3F5EF" />
            <g clipPath={`url(#bptear${seed}_${i})`}>
              {Array.from({ length: Math.ceil((H + 400) / 24) }, (_, k) => (
                <line key={k} x1={s.cx - 160} x2={s.cx + 160} y1={-200 + k * 24} y2={-200 + k * 24} stroke="#9ADCC6" strokeWidth={1} />
              ))}
              {Array.from({ length: 14 }, (_, k) => (
                <line key={'v' + k} x1={s.cx - 160 + k * 24} x2={s.cx - 160 + k * 24} y1={-200} y2={H + 200} stroke="#9ADCC6" strokeWidth={1} />
              ))}
            </g>
          </g>
        ))}
      </svg>
    </AbsoluteFill>
  );
};
