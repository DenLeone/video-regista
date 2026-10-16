import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { ACCENT, MONO_FONT } from './fonts';
import { W, H } from '../piano';

// Cornice firma: crocini agli angoli + "TAV. 0X · SCALA 1:1".
export const BlueprintFrame: React.FC<{ sheet: string }> = ({ sheet }) => {
  const frame = useCurrentFrame();
  const inset = 44;
  const grow = interpolate(frame, [0, 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const l = 56 * grow;
  const marks: [number, number, number, number][] = [
    [inset, inset, 1, 1],
    [W - inset, inset, -1, 1],
    [inset, H - inset, 1, -1],
    [W - inset, H - inset, -1, -1],
  ];
  return (
    <AbsoluteFill>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', left: 0, top: 0, filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.6))' }}>
        {marks.map(([x, y, sx, sy], i) => (
          <g key={i}>
            <path d={`M ${x} ${y + sy * l} L ${x} ${y} L ${x + sx * l} ${y}`} fill="none" stroke="#FFFFFF" strokeWidth={3} opacity={0.9} />
            <circle cx={x + sx * 14} cy={y + sy * 14} r={3} fill={ACCENT} opacity={grow} />
          </g>
        ))}
      </svg>
      <div style={{ position: 'absolute', right: inset + 70, top: inset - 12, fontFamily: MONO_FONT, fontWeight: 700,
        fontSize: 22, letterSpacing: 2, color: ACCENT, opacity: grow, textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>{sheet}</div>
    </AbsoluteFill>
  );
};
