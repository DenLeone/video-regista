import React from 'react';
import { AbsoluteFill, Sequence, spring, useCurrentFrame, useVideoConfig, interpolate, Easing } from 'remotion';
import { Clips, f, Inserti, Sfx, usaFps, volumeSfx, Icone, MusicaSotto } from './comune';
import { durataTotale, Piano } from './piano';

// Stile motion-collage denso: carta, box, frecce, testi kinetici, elementi sovrapposti.
// Clip reali solo in finestre brevi.

const HighlightBox: React.FC<{ text: string; from: number; dur: number; top?: number; left?: number; rotate?: number }> = ({ text, from, dur, top = 400, left = 100, rotate = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = spring({ frame: frame - from, fps, config: { damping: 12, stiffness: 140 } });
  const opacity = interpolate(frame, [from, from + 5, from + dur - 5, from + dur], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <div style={{
      position: 'absolute',
      top,
      left,
      background: '#FFE62E',
      color: '#111',
      padding: '8px 14px',
      fontSize: 40,
      fontWeight: 900,
      borderRadius: 2,
      transform: `scale(${0.7 + 0.3 * progress}) rotate(${rotate + (1 - progress) * 4}deg)`,
      opacity,
      boxShadow: '2px 3px 0 #111',
      border: '2px solid #111',
      whiteSpace: 'nowrap',
    }}>
      {text}
    </div>
  );
};

const KineticWord: React.FC<{ text: string; from: number; dur: number; top: number; left: number; size?: number }> = ({ text, from, dur, top, left, size = 64 }) => {
  const frame = useCurrentFrame();
  const progress = spring({ frame: frame - from, fps: 30, config: { damping: 10, stiffness: 160 } });
  const opacity = interpolate(frame, [from, from + 4, from + dur - 4, from + dur], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <div style={{
      position: 'absolute',
      top,
      left,
      fontSize: size,
      fontWeight: 800,
      color: '#1a1a1a',
      transform: `scale(${0.6 + 0.4 * progress}) rotate(${(1 - progress) * -6}deg)`,
      opacity,
      textShadow: '1px 1px 0 rgba(255,230,46,0.6)',
    }}>
      {text}
    </div>
  );
};

const Arrow: React.FC<{ from: number; dur: number; x1: number; y1: number; x2: number; y2: number }> = ({ from, dur, x1, y1, x2, y2 }) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [from, from + 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const length = Math.hypot(x2 - x1, y2 - y1);
  const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;

  return (
    <div style={{
      position: 'absolute',
      left: x1,
      top: y1 - 5,
      width: length * progress,
      height: 8,
      background: '#111',
      transform: `rotate(${angle}deg)`,
      transformOrigin: '0 50%',
      opacity: progress,
    }}>
      <div style={{ position: 'absolute', right: -2, top: -4, width: 0, height: 0, borderLeft: '10px solid #111', borderTop: '8px solid transparent', borderBottom: '8px solid transparent' }} />
    </div>
  );
};

export const MotionCollage: React.FC<Piano> = (piano) => {
  usaFps(piano);
  const sfx = volumeSfx(piano);

  const finestreClip = [
    { from: 0.3, dur: 1.4 },
    { from: 7.2, dur: 1.2 },
    { from: 14.5, dur: 1.3 },
  ];

  const elementi = [
    { type: 'word', text: 'SHARIA', at: 1.0, dur: 3.2, top: 180, left: 40, size: 72 },
    { type: 'box', text: '76%', at: 2.2, dur: 3.5, top: 340, left: 90, rotate: -2 },
    { type: 'box', text: 'STRANIERI', at: 2.8, dur: 2.8, top: 500, left: 60, rotate: 1 },
    { type: 'arrow', at: 3.5, dur: 2.0, x1: 200, y1: 390, x2: 420, y2: 560 },
    { type: 'word', text: 'CRISTIANI', at: 5.5, dur: 2.5, top: 620, left: 80, size: 48 },
    { type: 'box', text: '53%', at: 6.8, dur: 2.8, top: 760, left: 320, rotate: -1 },
    { type: 'word', text: 'MUSULMANI', at: 9.5, dur: 2.4, top: 420, left: 140, size: 44 },
    { type: 'box', text: '30%', at: 10.5, dur: 2.6, top: 540, left: 160, rotate: 2 },
    { type: 'arrow', at: 11.2, dur: 1.6, x1: 280, y1: 580, x2: 480, y2: 720 },
  ];

  return (
    <AbsoluteFill style={{ backgroundColor: '#F2E8D4' }}>
      <AbsoluteFill style={{
        background: 'linear-gradient(135deg, #f9f3e8 0%, #e8d9c0 40%, #f4ead8 100%)',
        filter: 'contrast(1.1)',
      }} />

      {finestreClip.map((w, i) => (
        <Sequence key={`clip${i}`} from={f(w.from)} durationInFrames={f(w.dur)}>
          <Clips piano={piano} />
        </Sequence>
      ))}

      {elementi.map((el, i) => {
        if (el.type === 'box') {
          return (
            <Sequence key={i} from={f(el.at)} durationInFrames={f(el.dur)}>
              <HighlightBox text={el.text} from={0} dur={f(el.dur)} top={el.top} left={el.left} rotate={el.rotate} />
            </Sequence>
          );
        }
        if (el.type === 'word') {
          return (
            <Sequence key={i} from={f(el.at)} durationInFrames={f(el.dur)}>
              <KineticWord text={el.text} from={0} dur={f(el.dur)} top={el.top} left={el.left} size={el.size} />
            </Sequence>
          );
        }
        if (el.type === 'arrow') {
          return (
            <Sequence key={i} from={f(el.at)} durationInFrames={f(el.dur)}>
              <Arrow from={0} dur={f(el.dur)} x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2} />
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
