import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { ACCENT, DARK, MONO_FONT } from './fonts';
import { W, H } from '../piano';

// Tavola tecnica che lampeggia nei primi 15 frame.
export const BlueprintIntroSheet: React.FC<{ label: string }> = ({ label }) => {
  const frame = useCurrentFrame();
  const on = [1, 1, 1, 1, 0, 0, 1, 1, 1, 0.6, 0, 0, 0, 0, 0][frame] || 0;
  const grow = interpolate(frame, [0, 6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const dimX = 930;
  const top = 380;
  const bottom = 1700;
  const yA = top + ((bottom - top) * (1 - grow)) / 2;
  const yB = bottom - ((bottom - top) * (1 - grow)) / 2;
  return (
    <AbsoluteFill style={{ opacity: on }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', left: 0, top: 0 }}>
        <defs>
          <pattern id="introMinor" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke={ACCENT} strokeWidth="0.6" opacity="0.35" />
          </pattern>
          <pattern id="introMajor" width="120" height="120" patternUnits="userSpaceOnUse">
            <path d="M 120 0 L 0 0 0 120" fill="none" stroke={ACCENT} strokeWidth="1.4" opacity="0.6" />
          </pattern>
        </defs>
        <rect width={W} height={H} fill={DARK} opacity={0.86} />
        <rect width={W} height={H} fill="url(#introMinor)" />
        <rect width={W} height={H} fill="url(#introMajor)" />
        <line x1={dimX} y1={yA} x2={dimX} y2={yB} stroke={ACCENT} strokeWidth={3} />
        <path d={`M ${dimX} ${yA} l -9 16 l 18 0 z`} fill={ACCENT} />
        <path d={`M ${dimX} ${yB} l -9 -16 l 18 0 z`} fill={ACCENT} />
        <line x1={dimX - 24} y1={top} x2={dimX + 24} y2={top} stroke={ACCENT} strokeWidth={2} opacity={grow} />
        <line x1={dimX - 24} y1={bottom} x2={dimX + 24} y2={bottom} stroke={ACCENT} strokeWidth={2} opacity={grow} />
      </svg>
      <div style={{ position: 'absolute', left: dimX - 26, top: (top + bottom) / 2, transform: 'translate(-50%,-50%) rotate(-90deg)',
        background: DARK, padding: '4px 12px', fontFamily: MONO_FONT, fontWeight: 700, fontSize: 26, letterSpacing: 2, color: ACCENT, whiteSpace: 'nowrap' }}>
        H 1:1
      </div>
      <div style={{ position: 'absolute', left: 80, bottom: 150, fontFamily: MONO_FONT, fontWeight: 700, fontSize: 30,
        letterSpacing: 3, color: '#FFFFFF' }}>{label}</div>
    </AbsoluteFill>
  );
};
