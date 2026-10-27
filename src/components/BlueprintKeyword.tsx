import React from 'react';
import { AbsoluteFill, Easing, interpolate, interpolateColors, useCurrentFrame } from 'remotion';
import { ACCENT, DARK, MONO_FONT, TITLE_FONT } from './fonts';
import { W, H } from '../piano';
import { dentro, SICURA } from '../testo';

// Parola chiave in box CAD tratteggiato (o pieno per sponsor/verdetto).
// Porting di BlueprintKeyword da memory/blueprint-code.md (Vyra).
export const BlueprintKeyword: React.FC<{
  word: string; note?: string; tag?: string; filled?: boolean; top?: number; fontSize?: number;
}> = ({ word, note = '', tag = '', filled = false, top = 1330, fontSize = 124 }) => {
  const frame = useCurrentFrame();
  const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
  const ease = (a: number, b: number) => interpolate(frame, [a, b], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });

  const padX = 44;
  const padY = 22;
  // il box (bordi compresi) sta nella zona sicura di TikTok: 120 px liberi ai lati (testo.ts)
  const stima = Math.min(fontSize, (SICURA.larghezza - padX * 2) / Math.max(1, word.length * 0.64));
  const fs = dentro(word, { famiglia: TITLE_FONT, peso: 700 }, stima, SICURA.larghezza - padX * 2 - 24);
  const textW = word.length * fs * 0.64;
  const boxW = Math.min(SICURA.larghezza - 24, textW + padX * 2);
  const boxH = fs * 1.05 + padY * 2;
  const bx = (W - boxW) / 2;
  // il box e la nota sotto restano sopra la descrizione e i pulsanti di TikTok (zona sicura)
  const by = Math.min(top, SICURA.basso - boxH - 70);

  const draw = ease(0, 9);
  const perim = 2 * (boxW + boxH);
  const typed = Math.round(interpolate(frame, [3, 3 + word.length * 1.1], [0, word.length], clamp));
  const typing = typed < word.length;
  const dim = ease(7, 15);
  const noteIn = ease(11, 18);
  const fill = filled ? ease(5, 10) : 0;

  const cx = W / 2;
  const dimY = by - 46;
  const half = (boxW / 2) * dim;
  const corner = 22;
  const cOff = 12;
  const corners: [number, number, number, number][] = [
    [bx - cOff, by - cOff, 1, 1],
    [bx + boxW + cOff, by - cOff, -1, 1],
    [bx - cOff, by + boxH + cOff, 1, -1],
    [bx + boxW + cOff, by + boxH + cOff, -1, -1],
  ];
  const textColor = filled ? interpolateColors(fill, [0, 1], ['#FFFFFF', DARK]) : '#FFFFFF';

  return (
    <AbsoluteFill>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', left: 0, top: 0, filter: 'drop-shadow(0 3px 8px rgba(0,0,0,0.6))' }}>
        <rect x={bx} y={by} width={boxW} height={boxH} fill={DARK} fillOpacity={filled ? 0 : 0.4 * draw} />
        <rect x={bx} y={by} width={boxW} height={boxH} fill={ACCENT} fillOpacity={fill} />
        <rect x={bx} y={by} width={boxW} height={boxH} fill="none" stroke={ACCENT} strokeWidth={4}
          strokeDasharray={draw >= 1 ? '18 12' : `${perim * draw} ${perim}`} />
        {corners.map(([x, y, sx, sy], i) => (
          <path key={i} d={`M ${x} ${y + sy * corner} L ${x} ${y} L ${x + sx * corner} ${y}`}
            fill="none" stroke="#FFFFFF" strokeWidth={3} opacity={ease(4, 8)} />
        ))}
        <line x1={cx - half} y1={dimY} x2={cx + half} y2={dimY} stroke={ACCENT} strokeWidth={2.5} />
        <path d={`M ${cx - half} ${dimY} l 14 -7 l 0 14 z`} fill={ACCENT} opacity={dim} />
        <path d={`M ${cx + half} ${dimY} l -14 -7 l 0 14 z`} fill={ACCENT} opacity={dim} />
        <line x1={bx} y1={dimY - 14} x2={bx} y2={by - 6} stroke={ACCENT} strokeWidth={2} opacity={dim} />
        <line x1={bx + boxW} y1={dimY - 14} x2={bx + boxW} y2={by - 6} stroke={ACCENT} strokeWidth={2} opacity={dim} />
        {tag ? <rect x={cx - 64} y={dimY - 20} width={128} height={40} fill={DARK} opacity={dim} /> : null}
      </svg>
      {tag ? (
        <div style={{ position: 'absolute', left: cx - 64, top: dimY - 20, width: 128, height: 40, display: 'flex',
          alignItems: 'center', justifyContent: 'center', fontFamily: MONO_FONT, fontWeight: 700, fontSize: 24,
          color: ACCENT, opacity: dim, letterSpacing: 2 }}>{tag}</div>
      ) : null}
      <div style={{ position: 'absolute', left: bx, top: by, width: boxW, height: boxH, display: 'flex',
        alignItems: 'center', justifyContent: 'center', fontFamily: TITLE_FONT, fontWeight: 700, fontSize: fs,
        lineHeight: 1, letterSpacing: -1, color: textColor, whiteSpace: 'nowrap',
        textShadow: filled ? 'none' : '0 3px 10px rgba(0,0,0,0.5)' }}>
        <span>{word.slice(0, typed)}</span>
        <span style={{ opacity: typing ? 1 : 0, color: ACCENT, width: 0 }}>▌</span>
      </div>
      {note ? (
        <div style={{ position: 'absolute', left: bx, top: by + boxH + 22, fontFamily: MONO_FONT, fontWeight: 700,
          fontSize: 30, color: ACCENT, whiteSpace: 'nowrap', textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>
          {note.slice(0, Math.round(note.length * noteIn))}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
