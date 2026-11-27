import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';

// Apertura a tessere di vetro (stile «Elaborato», dal riferimento di Imran Edits): nei primi ~0,8 s il quadro è coperto da
// quadrati traslucidi smerigliati che si spengono uno a uno, a caso, e scoprono il video. Nessun dato nel piano: dipende solo dal fotogramma.
const LATO = 180;
const COLONNE = 6;
const RIGHE = 11;
const FINE = 26; // fotogramma in cui sparisce l'ultima tessera

// numero "a caso" ma sempre uguale (stesso render, stesso disegno)
const caso = (i: number, j: number) => { const x = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return x - Math.floor(x); };

export const TessereVetro: React.FC = () => {
  const fr = useCurrentFrame();
  if (fr >= FINE + 2) return null;
  const celle: React.ReactNode[] = [];
  for (let j = 0; j < RIGHE; j++) {
    for (let i = 0; i < COLONNE; i++) {
      const h = caso(i, j);
      if (h > 0.62) continue; // non tutte le tessere: il quadro resta a chiazze, come nel riferimento
      const fine = 6 + (h / 0.62) * (FINE - 6);
      const v = interpolate(fr, [fine - 7, fine], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.cubic) });
      if (v <= 0) continue;
      celle.push(
        <div key={`${i}-${j}`} style={{
          position: 'absolute', left: i * LATO, top: j * LATO, width: LATO, height: LATO, opacity: v,
          transform: `scale(${(0.9 + 0.1 * v).toFixed(3)})`,
          background: 'rgba(235,240,250,0.30)', border: '1px solid rgba(255,255,255,0.35)',
          backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
        }} />,
      );
    }
  }
  return <AbsoluteFill style={{ pointerEvents: 'none' }}>{celle}</AbsoluteFill>;
};
