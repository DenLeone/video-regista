import React from 'react';
import { AbsoluteFill, Easing, interpolate, Sequence, useCurrentFrame } from 'remotion';
import { f, Sfx } from './comune';
import { GraficaStile, H, Piano, W } from './piano';
import { OMBRA, stileFont } from './testo';

// Mattoni del 13/11, nati dallo stile «Tech Macro» copiato dal 🥷 Copiatore (recensione di una webcam): il
// Regista non li sapeva fare e metteva titoli normali. Si accendono da stile.txt e valgono per ogni stile:
//   Titolo prodotto: marca e modello → marca enorme nel colore d'accento, modello bianco largo sopra
//   Etichette tecniche: sì           → specifica (es. «0,2 s») con una linea che punta al dettaglio
//   Invito a commentare: sì          → finale «COMMENTA: PAROLA» + «CHE TI MANDO IL LINK»

const entra = (fr: number, da: number, durata: number) => interpolate(fr, [da, da + durata], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
const esce = (fr: number, len: number, durata = 6) => interpolate(fr, [len - durata, len], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

// --- 1. titolo marca / modello a due livelli ---
const TitoloProdotto: React.FC<{ marca: string; modello: string; len: number; g: GraficaStile }> = ({ marca, modello, len, g }) => {
  const fr = useCurrentFrame();
  const a = entra(fr, 0, 9), b = entra(fr, 5, 9), via = esce(fr, len);
  // la marca riempie la larghezza: più lettere, più piccola
  const sizeMarca = Math.min(300, Math.round((W - 80) / Math.max(3, marca.length) * 1.55));
  const sizeModello = Math.min(170, Math.round((W - 160) / Math.max(2, modello.length) * 1.5));
  const y = g.posTitoli === 'alto' ? 520 : g.posTitoli === 'basso' ? 1180 : 860;
  return (
    <AbsoluteFill style={{ opacity: via }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: y - sizeMarca * 0.55, textAlign: 'center', ...stileFont(g.fontTitoli),
        fontSize: sizeMarca, lineHeight: 1, color: g.accento, letterSpacing: '0.02em', textTransform: 'uppercase', opacity: 0.92 * a,
        transform: `scale(${1.18 - 0.18 * a})`, textShadow: '0 10px 40px rgba(0,0,0,0.45)' }}>{marca}</div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: y + sizeMarca * 0.32, textAlign: 'center', ...stileFont(g.fontTitoli),
        fontSize: sizeModello, lineHeight: 1, color: '#FFFFFF', letterSpacing: '0.12em', textTransform: 'uppercase', opacity: b,
        transform: `translateY(${(1 - b) * 40}px) scaleX(${1.12 - 0.12 * b})`, textShadow: OMBRA }}>{modello}</div>
    </AbsoluteFill>
  );
};

// --- 2. etichetta tecnica con puntatore ---
const Etichetta: React.FC<{ e: NonNullable<Piano['etichette']>[number]; len: number; g: GraficaStile }> = ({ e, len, g }) => {
  const fr = useCurrentFrame();
  const px = e.x * W, py = e.y * H;
  // l'etichetta sta dalla parte con più spazio, un po' sopra il punto
  const aDestra = e.x < 0.5;
  const lx = aDestra ? Math.min(W - 120, px + 230) : Math.max(120, px - 230);
  const ly = Math.max(300, Math.min(H - 640, py - 170));
  const punto = entra(fr, 0, 6), linea = entra(fr, 4, 9), testo = entra(fr, 10, 8), via = esce(fr, len);
  const lunga = Math.hypot(lx - px, ly - py);
  const pulsa = 1 + 0.25 * Math.sin(fr / 4);
  return (
    <AbsoluteFill style={{ opacity: via }}>
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
        <circle cx={px} cy={py} r={16 * punto * pulsa} fill="none" stroke={g.accento} strokeWidth={4} opacity={0.6} />
        <circle cx={px} cy={py} r={9 * punto} fill={g.accento} />
        <line x1={px} y1={py} x2={lx} y2={ly} stroke={g.accento} strokeWidth={5} strokeLinecap="round"
          strokeDasharray={lunga} strokeDashoffset={lunga * (1 - linea)} />
      </svg>
      <div style={{ position: 'absolute', top: ly - 58, ...(aDestra ? { left: lx } : { right: W - lx }), opacity: testo,
        transform: `translateX(${(aDestra ? -1 : 1) * (1 - testo) * 30}px)`, background: 'rgba(10,10,12,0.78)', borderRadius: 14,
        borderLeft: aDestra ? `8px solid ${g.accento}` : undefined, borderRight: aDestra ? undefined : `8px solid ${g.accento}`, padding: '14px 26px',
        textAlign: aDestra ? 'left' : 'right', maxWidth: 560 }}>
        <div style={{ ...stileFont(g.fontTitoli), fontSize: 64, lineHeight: 1, color: '#FFFFFF', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{e.testo}</div>
        {e.sotto ? <div style={{ ...stileFont(g.fontSottotitoli), fontSize: 30, marginTop: 8, color: '#E8E8E8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{e.sotto}</div> : null}
      </div>
    </AbsoluteFill>
  );
};

// --- 3. invito a commentare ---
const Commenta: React.FC<{ parola: string; riga: string; len: number; g: GraficaStile }> = ({ parola, riga, len, g }) => {
  const fr = useCurrentFrame();
  const a = entra(fr, 0, 7), b = entra(fr, 6, 8);
  const pop = interpolate(fr, [0, 5, 9], [0.6, 1.08, 1], { extrapolateRight: 'clamp' });
  const testo = `COMMENTA: ${parola}`;
  const size = Math.min(130, Math.round((W - 120) / Math.max(6, testo.length) * 1.7));
  return (
    <AbsoluteFill style={{ background: `rgba(0,0,0,${0.42 * a})`, alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', marginTop: -120 }}>
        <div style={{ ...stileFont(g.fontTitoli), fontSize: size, lineHeight: 1.05, color: g.accento, textTransform: 'uppercase',
          WebkitTextStroke: '3px #FFFFFF', paintOrder: 'stroke fill', transform: `scale(${pop})`, opacity: a, textShadow: '0 8px 30px rgba(0,0,0,0.6)' }}>{testo}</div>
        <div style={{ ...stileFont(g.fontTitoli), fontSize: Math.round(size * 0.52), marginTop: 22, color: '#FFFFFF', textTransform: 'uppercase',
          letterSpacing: '0.05em', opacity: b, transform: `translateY(${(1 - b) * 24}px)`, textShadow: OMBRA }}>{riga}</div>
      </div>
    </AbsoluteFill>
  );
};

export const Mattoni: React.FC<{ piano: Piano; g: GraficaStile; totale: number; sfx: number }> = ({ piano, g, totale, sfx }) => {
  const tp = g.titoloProdotto ? piano.titoloProdotto : undefined;
  const et = g.etichette ? (piano.etichette || []).filter((e) => f(e.at) < totale - 4) : [];
  const cm = g.commenta ? piano.commenta : undefined;
  const lenC = cm ? Math.min(f(cm.dur), Math.max(0, totale - 2)) : 0;
  return (
    <>
      {tp && f(tp.at) < totale - 4 ? (
        <Sequence from={f(tp.at)} durationInFrames={Math.max(8, Math.min(f(tp.dur), totale - f(tp.at)))}>
          <TitoloProdotto marca={tp.marca} modello={tp.modello} len={Math.max(8, Math.min(f(tp.dur), totale - f(tp.at)))} g={g} />
        </Sequence>
      ) : null}
      {et.map((e, i) => {
        const len = Math.max(8, Math.min(f(e.dur), totale - f(e.at)));
        return <Sequence key={`et${i}`} from={f(e.at)} durationInFrames={len}><Etichetta e={e} len={len} g={g} /></Sequence>;
      })}
      {cm && lenC > 20 ? <Sequence from={totale - lenC} durationInFrames={lenC}><Commenta parola={cm.parola} riga={cm.riga} len={lenC} g={g} /></Sequence> : null}
      {sfx > 0 ? (
        <>
          {tp && f(tp.at) < totale - 4 ? <Sfx nome="impatto" da={f(tp.at)} volume={0.4 * sfx} /> : null}
          {et.map((e, i) => <Sfx key={`es${i}`} nome="ui_in" da={f(e.at) + 4} volume={0.45 * sfx} />)}
          {cm && lenC > 20 ? <Sfx nome="ui_conferma" da={totale - lenC} volume={0.5 * sfx} /> : null}
        </>
      ) : null}
    </>
  );
};
