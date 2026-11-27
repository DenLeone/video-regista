import React from 'react';
import { AbsoluteFill, Easing, interpolate, Sequence, useCurrentFrame } from 'remotion';
import { f, Sfx } from './comune';
import { ICONE_CONCETTO } from './iconeConcettoElenco';
import type { Piano } from './piano';

// Icone di concetto (stile «Elaborato»): quadratino bianco arrotondato con una piccola icona che entra con un «pop» vicino
// alle mani quando la persona nomina la cosa, resta ferma un attimo e sparisce. Le icone sono di Tabler.
// L'elenco (src/iconeConcettoElenco.tsx) è generato da scripts/icone-concetto.mjs.

// Zone del verticale (zone.json): dentro x 60–1020, y 240–1530; sotto y 970 non oltre x 920. L'icona sta all'altezza delle mani,
// ai lati, sempre dentro la zona sicura.
const LATO = 200;
const Y = 1010;
const X = { sinistra: 90, destra: 920 - LATO };

export const IconaConcettoView: React.FC<{ nome: string; lato: 'sinistra' | 'destra'; len: number }> = ({ nome, lato, len }) => {
  const fr = useCurrentFrame();
  const Icona = ICONE_CONCETTO[nome];
  if (!Icona) return null;
  const entra = interpolate(fr, [0, 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.back(2.2)) });
  const esce = interpolate(fr, [len - 7, len], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const verso = lato === 'sinistra' ? -1 : 1;
  const scala = (0.15 + 0.85 * entra) * (1 - 0.2 * esce);
  const sale = Math.sin(fr / 11) * 5; // galleggia appena
  return (
    <AbsoluteFill style={{ opacity: Math.min(1, fr / 3) * (1 - esce) }}>
      <div style={{
        position: 'absolute', left: X[lato], top: Y + sale, width: LATO, height: LATO, borderRadius: '28%', background: '#FFFFFF',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 18px 40px rgba(0,0,0,0.35), 0 2px 6px rgba(0,0,0,0.25)',
        transform: `scale(${scala}) rotate(${((1 - entra) * 14 * verso).toFixed(2)}deg)`,
      }}>
        <Icona size={Math.round(LATO * 0.56)} stroke={1.8} color="#16181D" />
      </div>
    </AbsoluteFill>
  );
};

export const IconeConcetto: React.FC<{ piano: Piano; sfx?: number }> = ({ piano, sfx = 0 }) => (
  <>
    {(piano.iconeConcetto || []).map((ic, i) => {
      const len = Math.max(12, f(ic.dur));
      return (
        <Sequence key={`ico${i}`} from={f(ic.at)} durationInFrames={len}>
          <IconaConcettoView nome={ic.nome} lato={ic.lato} len={len} />
          {sfx > 0 ? <Sfx nome="ui_in" da={0} volume={0.45 * sfx} /> : null}
        </Sequence>
      );
    })}
  </>
);

// Solo per vedere le icone (npx remotion still IconeProva): le 25 icone in griglia e due in azione sul fondo di un video
export const ProvaIcone: React.FC = () => (
  <AbsoluteFill style={{ background: 'linear-gradient(180deg,#3a2a24,#171212)' }}>
    <Sequence from={0} durationInFrames={54}><IconaConcettoView nome="corsa" lato="sinistra" len={54} /></Sequence>
    <Sequence from={0} durationInFrames={54}><IconaConcettoView nome="diamante" lato="destra" len={54} /></Sequence>
  </AbsoluteFill>
);
