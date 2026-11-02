import React from 'react';
import { AbsoluteFill, Sequence, spring, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { Clips, f, Inserti, Sfx, usaFps, volumeSfx, Icone, MusicaSotto } from './comune';
import { durataTotale, Piano } from './piano';

// Stile motion-collage: mix di clip reali (5-10%) + motion graphics collage (90-95%)
// Sfondo carta/giornale, elementi strappati, box gialli, frecce, testi kinetici
// Sincronizzato ai tempi della voce (Whisper).

const HighlightBox: React.FC<{ text: string; from: number; dur: number; top?: number; left?: number }> = ({ text, from, dur, top = 400, left = 100 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = spring({ frame: frame - from, fps, config: { damping: 12, stiffness: 100 } });
  const opacity = interpolate(frame, [from, from + 5, from + dur - 5, from + dur], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <div style={{
      position: 'absolute',
      top,
      left,
      background: '#FFE62E',
      color: '#111',
      padding: '8px 16px',
      fontSize: 42,
      fontWeight: 800,
      borderRadius: 4,
      transform: `scale(${0.8 + 0.2 * progress}) rotate(${(1 - progress) * 2}deg)`,
      opacity,
      boxShadow: '2px 3px 0 rgba(0,0,0,0.15)',
    }}>
      {text}
    </div>
  );
};

const SimpleArrow: React.FC<{ from: number; dur: number; x1: number; y1: number; x2: number; y2: number }> = ({ from, dur, x1, y1, x2, y2 }) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [from, from + 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const length = Math.hypot(x2 - x1, y2 - y1);
  const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;

  return (
    <div style={{
      position: 'absolute',
      left: x1,
      top: y1,
      width: length * progress,
      height: 8,
      background: '#222',
      transform: `rotate(${angle}deg)`,
      transformOrigin: '0 50%',
      opacity: progress,
    }} />
  );
};

export const MotionCollage: React.FC<Piano> = (piano) => {
  usaFps(piano);
  const totale = f(durataTotale(piano));
  const sfx = volumeSfx(piano);

  // Elementi di prova Sharia (76%, 53%, 30%)
  const elementi = [
    { type: 'box', text: '76%', at: 2.5, dur: 3.2, top: 340, left: 90 },
    { type: 'box', text: '53%', at: 8.0, dur: 2.8, top: 680, left: 380 },
    { type: 'box', text: '30%', at: 12.5, dur: 2.5, top: 520, left: 160 },
    { type: 'box', text: 'SHARIA', at: 1.0, dur: 2.5, top: 220, left: 70 },
    { type: 'arrow', at: 3.8, dur: 2.0, x1: 220, y1: 400, x2: 480, y2: 640 },
  ];

  return (
    <AbsoluteFill style={{ backgroundColor: '#F4EDE0' }}>
      <AbsoluteFill style={{
        background: 'linear-gradient(135deg, #f7f1e3 0%, #e8dcc8 100%)',
        filter: 'contrast(1.05)',
      }} />

      <Clips piano={piano} />

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
