import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { ACCENT, MONO_FONT, TITLE_FONT } from './fonts';

// Cartiglio sponsor in alto a sinistra.
export const BlueprintTitleBlock: React.FC<{ material: string; test: string; label?: string }> = ({ material, test, label = 'MATERIALE' }) => {
  const frame = useCurrentFrame();
  const a = interpolate(frame, [0, 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const line = 'rgba(255,255,255,0.9)';
  return (
    <AbsoluteFill style={{ opacity: a, transform: `translateY(${(1 - a) * -12}px)` }}>
      <div style={{ position: 'absolute', left: 70, top: 120, width: 430, border: `2.5px solid ${line}`,
        background: 'rgba(11,16,20,0.55)', boxShadow: '0 4px 18px rgba(0,0,0,0.45)' }}>
        <div style={{ height: 92, borderBottom: `2px solid ${line}`, padding: '10px 16px', boxSizing: 'border-box' }}>
          <div style={{ fontFamily: MONO_FONT, fontSize: 18, letterSpacing: 3, color: 'rgba(255,255,255,0.75)' }}>{label}</div>
          <div style={{ fontFamily: TITLE_FONT, fontWeight: 700, fontSize: 46, lineHeight: 1.05, color: ACCENT }}>{material}</div>
        </div>
        <div style={{ display: 'flex', height: 40 }}>
          <div style={{ flex: 1, borderRight: `2px solid ${line}`, padding: '0 16px', display: 'flex', alignItems: 'center',
            fontFamily: MONO_FONT, fontSize: 18, color: '#FFFFFF', letterSpacing: 1 }}>{'TEST: ' + test}</div>
          <div style={{ width: 96, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: MONO_FONT, fontSize: 18, color: ACCENT, letterSpacing: 1 }}>REV.01</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
