// Prova dei font per lo stile Presentazione: tre fasce sul fondo Tiffany, stessa frase, stessa infografica.
//   npx remotion still PresentazioneFont out/presentazione-font.png --scale=0.5
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { COLORI, FONT } from './tema';

const Griglia: React.FC = () => (
  <AbsoluteFill style={{
    backgroundImage: `linear-gradient(${COLORI.griglia}14 2px, transparent 2px), linear-gradient(90deg, ${COLORI.griglia}14 2px, transparent 2px)`,
    backgroundSize: '108px 108px',
  }} />
);

const Onda: React.FC<{ y: number }> = ({ y }) => (
  <svg width={1700} height={300} style={{ position: 'absolute', left: 230, top: y }}>
    {Array.from({ length: 56 }, (_, i) => {
      const h = 40 + Math.abs(Math.sin(i * 1.7) * 120 + Math.sin(i * 0.43) * 80);
      return <rect key={i} x={i * 30} y={150 - h / 2} width={14} height={h} rx={7} fill={COLORI.testo} />;
    })}
    <line x1={0} y1={22} x2={1560} y2={22} stroke={COLORI.accento} strokeWidth={6} />
    <circle cx={1560} cy={22} r={22} fill={COLORI.accento} />
    <text x={1560} y={-8} textAnchor="end" fontFamily={FONT.mono} fontWeight={700} fontSize={44} fill={COLORI.testo}>+6 dB</text>
  </svg>
);

const Fascia: React.FC<{ nome: string; font: string; y: number }> = ({ nome, font, y }) => (
  <div style={{ position: 'absolute', left: 0, top: y, width: 2160, height: 1280, borderBottom: `4px solid ${COLORI.testo}` }}>
    <div style={{ position: 'absolute', left: 120, top: 90, fontFamily: font, fontWeight: 800, color: COLORI.testo, lineHeight: 0.95, letterSpacing: -4 }}>
      <div style={{ fontSize: 96 }}>I MODELLI NON CRESCONO</div>
      <div style={{ fontSize: 250 }}>ESPLODONO.</div>
    </div>
    <div style={{ position: 'absolute', left: 120, top: 470, width: 900, height: 8, background: COLORI.linea }} />
    <Onda y={560} />
    <div style={{ position: 'absolute', right: 120, bottom: 70, fontFamily: FONT.mono, fontWeight: 700, fontSize: 48, color: COLORI.testo, opacity: 0.6 }}>{nome}</div>
  </div>
);

export const ProvaFont: React.FC = () => (
  <AbsoluteFill style={{ background: COLORI.fondo }}>
    <Griglia />
    <Fascia nome="1 · UNBOUNDED" font={FONT.unbounded} y={0} />
    <Fascia nome="2 · BRICOLAGE GROTESQUE" font={FONT.bricolage} y={1280} />
    <Fascia nome="3 · SYNE" font={FONT.syne} y={2560} />
  </AbsoluteFill>
);
