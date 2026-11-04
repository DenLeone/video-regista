import React from 'react';
import { Easing, Img } from 'remotion';
import { loadFont as caricaGrotesk } from '@remotion/google-fonts/SpaceGrotesk';
import { loadFont as caricaMono } from '@remotion/google-fonts/JetBrainsMono';
import { centro, clamp01, f, inOut, outCubic, Pos, prog } from './pezzi';

// Mondo "Tech" del documentario (stesso beats.json del Rotolo, altro aspetto): un canvas infinito
// scuro a griglia blueprint, card di vetro, un bus dati con i nodi degli anni, numeri enormi,
// badge rossi al posto dei timbri e riquadri che scattano sui dettagli. Prompt: 12 · Risorse/Prompts/Tech.

const { fontFamily: GROTESK } = caricaGrotesk('normal', { weights: ['500', '700'], subsets: ['latin', 'latin-ext'] });
const { fontFamily: MONO } = caricaMono('normal', { weights: ['500', '700', '800'], subsets: ['latin', 'latin-ext'] });
export { GROTESK, MONO };

export const T = {
  fondo: '#05070b', griglia: 'rgba(110,150,255,0.07)', grigliaForte: 'rgba(110,150,255,0.15)',
  accento: '#4fd1ff', rosso: '#ff4040', testo: '#f2f5fa', spento: '#8b95a7', vetro: 'rgba(16,22,34,0.78)', bordo: 'rgba(160,190,255,0.22)',
};
const glow = (c: string, r = 40, a = 0.45) => `0 0 ${r}px ${c.replace('#', '') === c ? c : hexA(c, a)}`;
function hexA(h: string, a: number) {
  const n = parseInt(h.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// misure delle card (le usa anche impagina.ts per l'ingombro): bordo interno e barra in alto
export const CARD = { pad: 24, testa: 64 };

// ---------------------------------------------------------------- canvas
export const Canvas: React.FC<{ altezza: number; anni: [string, number][]; tracce: { y: number; t: number }[]; tempo: number }> = ({ altezza, anni, tracce, tempo }) => (
  <>
    <div style={{
      position: 'absolute', left: -9000, top: -9000, width: 18000, height: altezza + 18000, background: T.fondo,
      backgroundImage: `linear-gradient(${T.grigliaForte} 2px, transparent 2px), linear-gradient(90deg, ${T.grigliaForte} 2px, transparent 2px), linear-gradient(${T.griglia} 1px, transparent 1px), linear-gradient(90deg, ${T.griglia} 1px, transparent 1px)`,
      backgroundSize: '400px 400px, 400px 400px, 80px 80px, 80px 80px', backgroundPosition: '-1000px 0, -1000px 0, -1000px 0, -1000px 0',
    }} />
    {/* bus dati a sinistra con i nodi degli anni, e una traccia verso ogni beat */}
    <svg width={2400} height={altezza} style={{ position: 'absolute', left: -1200, top: 0, overflow: 'visible' }}>
      <defs><filter id="luceBus"><feGaussianBlur stdDeviation="6" /></filter></defs>
      <path d={`M340 300 V${altezza - 300}`} stroke={T.accento} strokeWidth={4} opacity={0.28} />
      {tracce.map((tr, i) => {
        const k = outCubic(prog(tempo, tr.t - 0.15, 0.6));
        const d = `M340 ${tr.y} H420 L460 ${tr.y + 40} H500`;
        return <g key={i}>
          <path d={d} stroke={T.accento} strokeWidth={4} fill="none" opacity={0.18} />
          <path d={d} stroke={T.accento} strokeWidth={5} fill="none" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - k} opacity={0.9} />
          <circle cx={340} cy={tr.y} r={11} fill={T.fondo} stroke={T.accento} strokeWidth={4} opacity={0.4 + 0.6 * k} />
          {k > 0 && k < 1 && <circle cx={340 + 160 * k} cy={tr.y + (k > 0.5 ? 40 * (k - 0.5) * 2 : 0)} r={14} fill={T.accento} filter="url(#luceBus)" />}
        </g>;
      })}
      {anni.map(([a, y], i) => (
        <g key={`a${i}`}>
          <rect x={300} y={y - 40} width={80} height={80} rx={14} fill={T.fondo} stroke={T.accento} strokeWidth={4} />
          <circle cx={340} cy={y} r={12} fill={T.accento} />
          <text x={340} y={y + 100} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={40} fill={T.accento} opacity={0.75}>{a}</text>
        </g>
      ))}
    </svg>
  </>
);

// ---------------------------------------------------------------- elementi
// card di vetro con la barra in alto (tre punti + etichetta monospace) e la foto dentro
export const Vetro: React.FC<{ src: string; w: number; etichetta: string; attivo: number }> = ({ src, w, etichetta, attivo }) => (
  <div style={{
    width: w, padding: CARD.pad, paddingTop: CARD.testa, borderRadius: 30, background: T.vetro, position: 'relative',
    border: `2px solid ${T.bordo}`, boxShadow: `0 40px 90px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08), 0 0 ${60 * attivo}px ${hexA(T.accento, 0.18 * attivo)}`,
  }}>
    <div style={{ position: 'absolute', top: 20, left: 28, display: 'flex', gap: 12 }}>
      {['#ff5f57', '#febc2e', '#28c840'].map((c) => <div key={c} style={{ width: 20, height: 20, borderRadius: 10, background: c, opacity: 0.85 }} />)}
    </div>
    <div style={{ position: 'absolute', top: 14, right: 30, fontFamily: MONO, fontWeight: 700, fontSize: 30, letterSpacing: 3, color: T.spento, whiteSpace: 'nowrap' }}>{etichetta}</div>
    <Img src={f(src)} style={{ display: 'block', width: '100%', borderRadius: 18 }} />
  </div>
);

// numero o parola enorme: entra dal basso con una scia di sfocatura e un bagliore
export const Hero: React.FC<Pos & { testo: string; t: number; tempo: number; size: number; colore?: string; mono?: boolean }> = ({ testo, t, tempo, size, colore = T.testo, mono, ...p }) => {
  if (tempo < t) return null;
  const k = outCubic(prog(tempo, t, 0.45));
  return (
    <div style={{
      ...centro(p, `translateY(${(1 - k) * size * 0.25}px)`), opacity: k, filter: `blur(${(1 - k) * 18}px)`,
      fontFamily: mono ? MONO : GROTESK, fontWeight: mono ? 800 : 700, fontSize: size, color: colore, letterSpacing: mono ? '-0.02em' : '-0.03em',
      lineHeight: 1, whiteSpace: 'nowrap', textShadow: `0 0 ${size * 0.12}px ${hexA(T.accento, 0.35)}`, fontVariantNumeric: 'tabular-nums',
    }}>{testo}</div>
  );
};

// etichetta monospace che si scrive con il cursore a blocco
export const Riga: React.FC<Pos & { testo: string; t: number; tempo: number; size: number; colore?: string; cps?: number }> = ({ testo, t, tempo, size, colore = T.accento, cps = 32, ...p }) => {
  if (tempo < t) return null;
  const n = Math.min(testo.length, Math.floor((tempo - t) * cps) + 1);
  const fine = (tempo - t) * cps > testo.length + 18;
  const cursore = !fine && Math.floor(tempo * 3) % 2 === 0;
  return <div style={{ ...centro(p), fontFamily: MONO, fontWeight: 700, fontSize: size, color: colore, whiteSpace: 'pre', letterSpacing: size * 0.06, textShadow: `0 0 18px ${hexA(colore, 0.4)}` }}>
    {testo.slice(0, n)}<span style={{ opacity: cursore ? 1 : 0 }}>█</span><span style={{ opacity: 0 }}>{testo.slice(n)}</span>
  </div>;
};

export const NomeTech: React.FC<Pos & { nome: string; ruolo?: string; t: number; tempo: number; size: number }> = ({ nome, ruolo, t, tempo, size, ...p }) => {
  if (tempo < t) return null;
  const k = outCubic(prog(tempo, t, 0.5));
  return (
    <div style={{ ...centro(p, `translateY(${(1 - k) * 30}px)`), opacity: k, textAlign: 'center', whiteSpace: 'nowrap' }}>
      {ruolo && <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: size * 0.36, letterSpacing: 6, color: T.accento, marginBottom: size * 0.18 }}>{ruolo}</div>}
      <div style={{ fontFamily: GROTESK, fontWeight: 700, fontSize: size, color: T.testo, lineHeight: 1, letterSpacing: '-0.02em' }}>{nome}</div>
      <div style={{ margin: `${size * 0.22}px auto 0`, width: size * 2.2 * k, height: 5, borderRadius: 3, background: T.accento, boxShadow: glow(T.accento, 20) }} />
    </div>
  );
};

// badge rosso che sbatte (al posto del timbro hanko)
export const Badge: React.FC<Pos & { testo: string; sotto?: string; t: number; tempo: number; size: number }> = ({ testo, sotto, t, tempo, size, ...p }) => {
  if (tempo < t) return null;
  const k = prog(tempo, t, 0.12);
  const s = 1.6 - 0.6 * Easing.in(Easing.quad)(k);
  const lampo = Math.max(0, 1 - (tempo - t - 0.12) / 0.5);
  return (
    <div style={{ ...centro(p, `scale(${s})`), opacity: 0.35 + 0.65 * k, textAlign: 'center' }}>
      <div style={{
        display: 'inline-block', padding: `${size * 0.16}px ${size * 0.42}px`, borderRadius: size, border: `${Math.max(5, size * 0.06)}px solid ${T.rosso}`,
        background: hexA(T.rosso, 0.16 + 0.3 * lampo), color: T.rosso, fontFamily: GROTESK, fontWeight: 700, fontSize: size, letterSpacing: '0.04em', whiteSpace: 'nowrap',
        boxShadow: `0 0 ${40 + 80 * lampo}px ${hexA(T.rosso, 0.45)}`, textShadow: `0 0 20px ${hexA(T.rosso, 0.6)}`,
      }}>{testo}</div>
      {sotto && <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: size * 0.32, letterSpacing: 6, color: T.rosso, marginTop: size * 0.22 }}>{sotto}</div>}
    </div>
  );
};

export const ContatoreTech: React.FC<Pos & { t: number; tempo: number; valore: number; prefisso?: string; suffisso?: string; etichetta?: string }> = ({ t, tempo, valore, prefisso = '', suffisso = '', etichetta, ...p }) => {
  if (tempo < t) return null;
  const k = outCubic(prog(tempo, t, 1.1));
  const n = Math.round(valore * k);
  return (
    <div style={{ ...centro(p), textAlign: 'center', whiteSpace: 'nowrap' }}>
      <div style={{ fontFamily: GROTESK, fontWeight: 700, fontSize: 300, color: T.testo, lineHeight: 1, letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums', textShadow: `0 0 50px ${hexA(T.accento, 0.35)}` }}>
        {prefisso}{n.toLocaleString('it-IT')}{suffisso}
      </div>
      {etichetta && <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 62, letterSpacing: 10, color: T.accento, marginTop: 26, opacity: clamp01((tempo - t) / 0.4) }}>{etichetta}</div>}
    </div>
  );
};

// riquadro che scatta su un dettaglio (al posto del cerchio rosso)
export const Riquadro: React.FC<Pos & { w: number; h: number; t: number; tempo: number }> = ({ w, h, t, tempo, ...p }) => {
  if (tempo < t) return null;
  const k = outCubic(prog(tempo, t, 0.22));
  const s = 1.5 - 0.5 * k, l = Math.min(w, h) * 0.28;
  const angolo = (x: number, y: number, dx: number, dy: number) => `M${x + dx * l} ${y} H${x} V${y + dy * l}`;
  return (
    <svg width={w} height={h} style={{ ...centro(p, `scale(${s})`), overflow: 'visible', opacity: k, filter: `drop-shadow(0 0 12px ${hexA(T.accento, 0.8)})` }}>
      <g stroke={T.accento} strokeWidth={8} fill="none" strokeLinecap="round">
        <path d={angolo(0, 0, 1, 1)} /><path d={angolo(w, 0, -1, 1)} /><path d={angolo(0, h, 1, -1)} /><path d={angolo(w, h, -1, -1)} />
      </g>
    </svg>
  );
};

// icone a linea per le schede tecniche
const linea = { fill: 'none', stroke: T.accento, strokeWidth: 6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
export const ICONE_TECH: Record<string, React.FC> = {
  mouse: () => <svg viewBox="0 0 100 100" width={150}><rect x="30" y="14" width="40" height="70" rx="20" {...linea} /><path d="M50 14 V40 M30 40 H70" {...linea} /></svg>,
  finestra: () => <svg viewBox="0 0 100 100" width={150}><rect x="12" y="20" width="76" height="60" rx="6" {...linea} /><path d="M12 34 H88 M20 27 h2 M28 27 h2" {...linea} /><rect x="24" y="44" width="26" height="24" rx="3" {...linea} /></svg>,
  chip: () => <svg viewBox="0 0 100 100" width={150}><rect x="26" y="26" width="48" height="48" rx="6" {...linea} /><path d="M38 26 V14 M50 26 V14 M62 26 V14 M38 86 V74 M50 86 V74 M62 86 V74 M26 38 H14 M26 62 H14 M86 38 H74 M86 62 H74" {...linea} /></svg>,
  floppy: () => <svg viewBox="0 0 100 100" width={150}><path d="M16 14 H74 L86 26 V86 H16 Z" {...linea} /><rect x="30" y="14" width="34" height="22" {...linea} /><rect x="28" y="54" width="44" height="32" {...linea} /></svg>,
  soldi: () => <svg viewBox="0 0 100 100" width={150}><rect x="8" y="28" width="84" height="46" rx="6" {...linea} /><circle cx="50" cy="51" r="12" {...linea} /></svg>,
  telefono: () => <svg viewBox="0 0 100 100" width={130}><rect x="28" y="8" width="44" height="84" rx="9" {...linea} /><path d="M44 80 H56" {...linea} /></svg>,
};

export const SchedaTech: React.FC<{ titolo: string; icona?: string; barrata: number }> = ({ titolo, icona, barrata }) => {
  const Icona = icona ? ICONE_TECH[icona] : undefined;
  return (
    <div style={{
      width: 980, height: 360, borderRadius: 30, background: T.vetro, border: `2px solid ${barrata > 0 ? hexA(T.rosso, 0.5) : T.bordo}`,
      display: 'flex', alignItems: 'center', gap: 56, padding: '0 70px', position: 'relative', boxShadow: '0 30px 70px rgba(0,0,0,0.55)',
    }}>
      <div style={{ width: 170, height: 170, borderRadius: 26, border: `2px solid ${T.bordo}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Icona ? <Icona /> : null}</div>
      <div style={{ fontFamily: GROTESK, fontWeight: 700, fontSize: 104, color: barrata > 0 ? T.spento : T.testo, whiteSpace: 'nowrap', letterSpacing: '-0.02em' }}>{titolo}</div>
      {barrata > 0 && <div style={{ position: 'absolute', left: 50, right: 50, top: '50%', height: 10, borderRadius: 5, background: T.rosso, transformOrigin: 'left', transform: `scaleX(${barrata})`, boxShadow: glow(T.rosso, 24) }} />}
    </div>
  );
};

export const progBarra = (tempo: number, t?: number) => (t === undefined ? 0 : inOut(prog(tempo, t, 0.25)));
