import React from 'react';
import { AbsoluteFill, Easing, interpolate, Sequence, useCurrentFrame } from 'remotion';
import { Ritagli } from './comune';
import type { Piano } from './piano';

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

// Mosaico sulla sola sagoma (Denis, 27/11): nel riferimento i quadrati di vetro stanno solo sulla persona, non su tutto il quadro.
// Si prende lo stesso ritaglio con trasparenza che serve alle parole dietro la testa, lo si riduce a blocchi (filtro SVG: ogni blocco
// prende il colore di un punto) e lo si schiarisce come vetro smerigliato; i blocchi diventano sempre più piccoli e svaniscono.
const FINE_MOSAICO = 16;
export const Pixelata: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const fr = useCurrentFrame();
  const lato = Math.max(2, Math.round(interpolate(fr, [0, FINE_MOSAICO], [120, 20], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.quad) })));
  const opacita = interpolate(fr, [4, FINE_MOSAICO], [0.92, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const id = `pix${lato}`;
  return (
    <AbsoluteFill style={{ opacity: opacita }}>
      <svg width={0} height={0} style={{ position: 'absolute' }}>
        <filter id={id} filterUnits="userSpaceOnUse" x={0} y={0} width={1080} height={1920} colorInterpolationFilters="sRGB">
          <feFlood x={lato / 2} y={lato / 2} width={1} height={1} />
          <feComposite width={lato} height={lato} />
          <feTile result="punti" />
          <feComposite in="SourceGraphic" in2="punti" operator="in" />
          <feMorphology operator="dilate" radius={lato / 2} />
        </filter>
      </svg>
      <AbsoluteFill style={{ filter: `url(#${id}) brightness(1.35) saturate(0.75)` }}>{children}</AbsoluteFill>
    </AbsoluteFill>
  );
};

export const MosaicoSagoma: React.FC<{ piano: Piano; filtro?: string }> = ({ piano, filtro }) => (
  <Sequence from={0} durationInFrames={FINE_MOSAICO + 2}>
    <Pixelata><Ritagli piano={piano} filtro={filtro} /></Pixelata>
  </Sequence>
);

// Alone sottile attorno alla testa e puntini gialli (riferimento di Imran Edits, primi 2 secondi): subito dopo il mosaico un cerchio di vetro
// molto leggero si apre attorno alla testa, poi un riflesso freddo sullo sfondo e quattro-sette puntini gialli che brillano attorno alla persona.
const PUNTI: [number, number, number][] = [[250, 560, 12], [840, 520, 10], [180, 860, 9], [900, 930, 12], [330, 380, 9], [760, 360, 11], [470, 1010, 8]];
export const AloneEPuntini: React.FC = () => {
  const fr = useCurrentFrame();
  const cl = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
  if (fr > 96) return null;
  const alone = interpolate(fr, [6, 16, 30, 40], [0, 1, 1, 0], cl);
  const freddo = interpolate(fr, [34, 46, 70, 86], [0, 1, 1, 0], cl);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', left: 540 - 230, top: 700 - 230, width: 460, height: 460, borderRadius: '50%', opacity: alone * 0.9,
        transform: `scale(${(0.88 + 0.12 * alone).toFixed(3)})`, border: '3px solid rgba(255,255,255,0.42)',
        background: 'radial-gradient(circle, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.05) 62%, rgba(255,255,255,0) 74%)' }} />
      <AbsoluteFill style={{ background: 'rgba(70,100,150,0.16)', opacity: freddo }} />
      {PUNTI.map(([x, y, r], i) => {
        const v = interpolate(fr, [36 + i * 2, 46 + i * 2, 76, 90], [0, 1, 1, 0], cl) * (0.55 + 0.45 * Math.sin(fr / 4 + i * 1.7));
        return v > 0.02 ? <div key={i} style={{ position: 'absolute', left: x - r / 2, top: y - r / 2, width: r, height: r, borderRadius: '50%', background: '#F6D463', opacity: v, boxShadow: '0 0 14px rgba(246,212,99,0.9)' }} /> : null;
      })}
    </AbsoluteFill>
  );
};
