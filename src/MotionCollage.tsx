import React from 'react';
import { AbsoluteFill, Sequence, spring, useCurrentFrame, useVideoConfig, interpolate, Easing } from 'remotion';
import { Clips, f, Inserti, Sfx, usaFps, volumeSfx, Icone, MusicaSotto } from './comune';
import { durataTotale, Piano } from './piano';

// Stile motion-collage: mix di clip reali (5-10%) + motion graphics collage (90-95%)
// Sfondo carta, box gialli, frecce, testi kinetici. Clip solo in finestre brevi.

const HighlightBox: React.FC<{ text: string; from: number; dur: number; top?: number; left?: number }> = ({ text, from, dur, top = 400, left = 100 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = spring({ frame: frame - from, fps, config: { damping: 14, stiffness: 120 } });
  const opacity = interpolate(frame, [from, from + 6, from + dur - 6, from + dur], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <div style={{
      position: 'absolute',
      top,
      left,
      background: '#FFE62E',
      color: '#111',
      padding: '10px 18px',
      fontSize: 48,
      fontWeight: 900,
      borderRadius: 3,
      transform: `scale(${0.75 + 0.25 * progress}) rotate(${(1 - progress) * 3}deg)`,
      opacity,
      boxShadow: '3px 4px 0 rgba(0,0,0,0.2)',
      border: '2px solid #111',
    }}>
      {text}
    </div>
  );
};

const SimpleArrow: React.FC<{ from: number; dur: number; x1: number; y1: number; x2: number; y2: number }> = ({ from, dur, x1, y1, x2, y2 }) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [from, from + 15], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const length = Math.hypot(x2 - x1, y2 - y1);
  const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;

  return (
    <div style={{
      position: 'absolute',
      left: x1,
      top: y1 - 4,
      width: length * progress,
      height: 10,
      background: '#111',
      transform: `rotate(${angle}deg)`,
      transformOrigin: '0 50%',
      opacity: progress,
      borderRadius: 2,
    }} />
  );
};

export const MotionCollage: React.FC<Piano> = (piano) => {
  usaFps(piano);
  const totale = f(durataTotale(piano));
  const sfx = volumeSfx(piano);

  // Finestre in cui mostriamo le clip reali (brevi, ~5-10%)
  const finestreClip = [
    { from: 0, dur: 1.8 },
    { from: 6.5, dur: 1.5 },
    { from: 14, dur: 1.6 },
  ];

  const elementi = [
    { type: 'box', text: 'SHARIA', at: 1.2, dur: 2.8, top: 280, left: 60 },
    { type: 'box', text: '76%', at: 3.0, dur: 3.0, top: 480, left: 120 },
    { type: 'box', text: '53%', at: 7.5, dur: 2.6, top: 720, left: 340 },
    { type: 'box', text: '30%', at: 11.0, dur: 2.4, top: 560, left: 180 },
    { type: 'arrow', at: 4.2, dur: 1.8, x1: 250, y1: 520, x2: 520, y2: 680 },
  ];

  return (
    <AbsoluteFill style={{ backgroundColor: '#F3E9D7' }}>
      {/* Sfondo carta */}
      <AbsoluteFill style={{
        background: 'linear-gradient(145deg, #f8f2e6 0%, #e9dcc4 50%, #f0e6d0 100%)',
        filter: 'contrast(1.08) saturate(0.9)',
      }} />

      {/* Clip solo nelle finestre */}
      {finestreClip.map((w, i) => (
        <Sequence key={`clip${i}`} from={f(w.from)} durationInFrames={f(w.dur)}>
          <Clips piano={piano} />
        </Sequence>
      ))}

      {/* Elementi collage sempre sopra */}
      {elementi.map((el, i) => {
        if (el.type === 'box') {
          return (
            <Sequence key={i} from={f(el.at)} durationInFrames={f(el.dur)}>
              <HighlightBox text={el.text} from={0} dur={f(el.dur)} top={el.top} left={el.left} />
            </Sequence>
          );
        }
        if (el.type === 'arrow') {
          return (
            <Sequence key={i} from={f(el.at)} durationInFrames={f(el.dur)}>
              <SimpleArrow from={0} dur={f(el.dur)} x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2} />
            </Sequence>
          );
        }
        return null;
      })}

      <Inserti piano={piano} sfx={sfx} />
      <Icone piano={piano} sfx={sfx} />
      <MusicaSotto piano={piano} />
    </AbsoluteFill>
  );
};
