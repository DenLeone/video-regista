// Pezzi dello stile Presentazione (fondo Tiffany, Bricolage Grotesque): testo che si accumula parola per parola sul
// parlato, infografiche che cambiano col tema (barre, curva, prompt, acronimo, oggetto su percorso) e uscita a barre.
// Tutti i tempi sono in secondi sul video; i componenti stanno dentro una composizione 2160×3840.
import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Easing } from 'remotion';
import { fitText, measureText } from '@remotion/layout-utils';
import * as Icone from '@tabler/icons-react';
import { COLORI, FONT } from './tema';

const LARGO = 1920; // larghezza utile del testo (120 px di margine per lato)
const SX = 120;

const useT = () => { const f = useCurrentFrame(); const { fps } = useVideoConfig(); return { t: f / fps, f, fps }; };
const entra = (t: number, da: number, durata = 0.35) => interpolate(t, [da, da + durata], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });

export const Griglia: React.FC = () => (
  <AbsoluteFill style={{
    background: COLORI.fondo,
    backgroundImage: `linear-gradient(${COLORI.griglia}14 2px, transparent 2px), linear-gradient(90deg, ${COLORI.griglia}14 2px, transparent 2px)`,
    backgroundSize: '108px 108px',
  }}>
    {/* righello con tacche sul bordo sinistro */}
    {Array.from({ length: 36 }, (_, i) => (
      <div key={i} style={{ position: 'absolute', left: 0, top: i * 108, width: i % 5 === 0 ? 44 : 24, height: 3, background: COLORI.griglia, opacity: 0.35 }} />
    ))}
  </AbsoluteFill>
);

// ---------------------------------------------------------------- testo che si accumula
export type Parola = { w: string; t: number; riga: number; taglia?: 'piccolo' | 'grande' | 'enorme'; accento?: boolean };
const BASE = { piccolo: 170, grande: 330, enorme: 440 };

export const Righe: React.FC<{ parole: Parola[]; y: number }> = ({ parole, y }) => {
  const { t } = useT();
  const righe = [...new Set(parole.map((p) => p.riga))].sort((a, b) => a - b).map((r) => parole.filter((p) => p.riga === r));
  let cursore = y;
  return (
    <>
      {righe.map((riga, k) => {
        const testo = riga.map((p) => p.w).join(' ');
        const taglia = riga[0].taglia ?? 'grande';
        const fs = Math.min(BASE[taglia], fitText({ text: testo, withinWidth: LARGO, fontFamily: FONT.bricolage, fontWeight: '800' }).fontSize * 0.98);
        const top = cursore;
        cursore += fs * 0.98;
        const larghezza = measureText({ text: testo, fontFamily: FONT.bricolage, fontSize: fs, fontWeight: '800' }).width;
        // la linea bianca corre davanti alla riga prima che arrivino le parole, poi sparisce
        const t0 = riga[0].t;
        const linea = interpolate(t, [t0 - 0.18, t0 + 0.25, t0 + 0.55], [0, 1, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const lineaOp = interpolate(t, [t0 + 0.35, t0 + 0.7], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        return (
          <div key={k} style={{ position: 'absolute', left: SX, top, height: fs, whiteSpace: 'nowrap' }}>
            <div style={{ position: 'absolute', left: 0, top: fs * 0.86, height: 8, width: larghezza * linea, background: COLORI.linea, opacity: t < t0 - 0.18 ? 0 : lineaOp }} />
            {riga.map((p, i) => {
              const e = entra(t, p.t, 0.3);
              return (
                <span key={i} style={{
                  display: 'inline-block', marginRight: i < riga.length - 1 ? fs * 0.22 : 0,
                  fontFamily: FONT.bricolage, fontWeight: 800, fontSize: fs, lineHeight: 1, letterSpacing: -fs * 0.02,
                  color: p.accento ? COLORI.accento : COLORI.testo,
                  opacity: e, transform: `translateY(${(1 - e) * fs * 0.45}px)`, filter: `blur(${(1 - e) * 18}px)`,
                }}>{p.w}</span>
              );
            })}
          </div>
        );
      })}
    </>
  );
};

// ---------------------------------------------------------------- barre che crescono (dati, quantità, confronti)
export const Barre: React.FC<{ gruppi: { etichetta: string; t: number }[]; y: number }> = ({ gruppi, y }) => {
  const { t } = useT();
  const W = 1900, H = 1100, colonne = 6;
  const larghezzaGruppo = W / gruppi.length;
  return (
    <svg width={W} height={H + 160} style={{ position: 'absolute', left: 130, top: y }}>
      <line x1={0} y1={H} x2={W - 40} y2={H} stroke={COLORI.testo} strokeWidth={6} />
      {gruppi.map((g, gi) => (
        <g key={gi} transform={`translate(${gi * larghezzaGruppo}, 0)`}>
          {Array.from({ length: colonne }, (_, i) => {
            const e = entra(t, g.t + i * 0.06, 0.45);
            const h = (0.18 + (i / (colonne - 1)) ** 2 * 0.8) * H * e;
            const x = 40 + i * ((larghezzaGruppo - 120) / colonne);
            const w = (larghezzaGruppo - 120) / colonne - 26;
            return (
              <g key={i}>
                <rect x={x} y={H - h} width={w} height={h} rx={18} fill={COLORI.testo} />
                {i === colonne - 1 && e > 0.05 && <circle cx={x + w / 2} cy={H - h - 50} r={26} fill={COLORI.accento} opacity={e} />}
              </g>
            );
          })}
          <text x={40} y={H + 110} fontFamily={FONT.mono} fontWeight={700} fontSize={64} fill={COLORI.testo} opacity={entra(t, g.t, 0.3)}>{g.etichetta}</text>
        </g>
      ))}
    </svg>
  );
};

// ---------------------------------------------------------------- curva: lineare, poi esplode
export const Curva: React.FC<{ lineare: number; esplode: number; y: number }> = ({ lineare, esplode, y }) => {
  const { t } = useT();
  const W = 1900, H = 1250;
  const pl = entra(t, lineare, 0.7);
  const pe = interpolate(t, [esplode, esplode + 0.5], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const punto = (u: number) => ({ x: 40 + u * (W - 120), y: H - 40 - (Math.exp(u * 4.2) - 1) / (Math.exp(4.2) - 1) * (H - 120) });
  const passi = 60, n = Math.max(1, Math.round(pe * passi));
  const d = Array.from({ length: n + 1 }, (_, i) => punto((i / passi))).map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ');
  const testa = punto(n / passi);
  const scossa = t > esplode && t < esplode + 0.35 ? Math.sin(t * 90) * 14 * (1 - (t - esplode) / 0.35) : 0;
  return (
    <svg width={W} height={H} style={{ position: 'absolute', left: 130, top: y, transform: `translate(${scossa}px, ${-scossa}px)` }}>
      <line x1={40} y1={H - 40} x2={W - 40} y2={H - 40} stroke={COLORI.testo} strokeWidth={6} />
      <line x1={40} y1={H - 40} x2={40} y2={40} stroke={COLORI.testo} strokeWidth={6} />
      <line x1={40} y1={H - 40} x2={40 + (W - 120) * pl} y2={H - 40 - (H * 0.28) * pl} stroke={COLORI.testo} strokeWidth={10} strokeDasharray="30 22" opacity={0.55} />
      {pe > 0 && <path d={d} fill="none" stroke={COLORI.testo} strokeWidth={16} strokeLinecap="round" strokeLinejoin="round" />}
      {pe > 0 && <circle cx={testa.x} cy={testa.y} r={34} fill={COLORI.accento} />}
      {pe > 0 && <circle cx={testa.x} cy={testa.y} r={34 + 60 * (1 - pe)} fill="none" stroke={COLORI.accento} strokeWidth={6} opacity={1 - pe} />}
    </svg>
  );
};

// ---------------------------------------------------------------- casella prompt che si scrive
export const Prompt: React.FC<{ testo: string; t0: number; y: number }> = ({ testo, t0, y }) => {
  const { t } = useT();
  const n = Math.floor(interpolate(t, [t0, t0 + testo.length * 0.09], [0, testo.length], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  const comparsa = entra(t, t0 - 0.9, 0.4);
  const invio = t0 + testo.length * 0.09 + 0.2;
  const premuto = interpolate(t, [invio, invio + 0.08, invio + 0.25], [1, 0.82, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const cursore = Math.floor(t * 3) % 2 === 0 || (t > t0 && n < testo.length);
  return (
    <div style={{
      position: 'absolute', left: 120, top: y, width: 1920, height: 560, borderRadius: 64, background: COLORI.scheda,
      opacity: comparsa, transform: `translateY(${(1 - comparsa) * 120}px) scale(${0.94 + comparsa * 0.06})`,
    }}>
      <Icone.IconSparkles size={110} color={COLORI.fondo} stroke={2.2} style={{ position: 'absolute', left: 70, top: 64 }} />
      <div style={{ position: 'absolute', left: 90, top: 220, fontFamily: FONT.bricolage, fontWeight: 800, fontSize: 250, lineHeight: 1, color: COLORI.schedaTesto, whiteSpace: 'nowrap' }}>
        {testo.slice(0, n)}
        <span style={{ display: 'inline-block', width: 18, height: 220, marginLeft: 16, background: COLORI.accento, verticalAlign: 'top', opacity: cursore ? 1 : 0 }} />
      </div>
      <div style={{
        position: 'absolute', right: 70, bottom: 70, width: 170, height: 170, borderRadius: 85, background: COLORI.accento,
        display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${premuto})`,
      }}>
        <Icone.IconArrowUp size={110} color="#fff" stroke={3} />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- acronimo: una riga per lettera, iniziale in corallo
export const Acronimo: React.FC<{ parole: { w: string; t: number }[]; y: number }> = ({ parole, y }) => {
  const { t } = useT();
  return (
    <>
      {parole.map((p, i) => {
        const fs = Math.min(400, fitText({ text: p.w, withinWidth: LARGO, fontFamily: FONT.bricolage, fontWeight: '800' }).fontSize * 0.98);
        const e = entra(t, p.t, 0.3);
        return (
          <div key={i} style={{
            position: 'absolute', left: SX, top: y + i * 430, fontFamily: FONT.bricolage, fontWeight: 800, fontSize: fs, lineHeight: 1,
            letterSpacing: -fs * 0.02, color: COLORI.testo, opacity: e, transform: `translateX(${(1 - e) * -160}px)`, filter: `blur(${(1 - e) * 18}px)`, whiteSpace: 'nowrap',
          }}>
            <span style={{ color: COLORI.accento }}>{p.w[0]}</span>{p.w.slice(1)}
          </div>
        );
      })}
    </>
  );
};

// ---------------------------------------------------------------- oggetto su percorso (aereo su pista, auto su strada…)
// icona: nome di un'icona Tabler (es. "IconPlane", "IconCar", "IconTruck"): l'AI la sceglie dal tema
export const Percorso: React.FC<{ icona: string; t0: number; y: number; decolla?: boolean }> = ({ icona, t0, y, decolla = true }) => {
  const { t } = useT();
  const Icona = ((Icone as unknown) as Record<string, React.FC<{ size: number; color: string; stroke: number; fill?: string }>>)[icona] ?? Icone.IconPlane;
  const corsa = interpolate(t, [t0, t0 + 1.3], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.quad) });
  const volo = decolla ? interpolate(t, [t0 + 1.3, t0 + 2.3], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.quad) }) : 0;
  const pista = 900; // y della pista dentro il riquadro
  const pos = (c: number, v: number) => ({ x: 140 + c * 1000 + v * 560, y: pista - 170 - v * v * 650 });
  const p = pos(corsa, volo);
  const angolo = -Math.atan2(1400 * volo, 700) * 180 / Math.PI * (volo > 0 ? 1 : 0);
  const scia = Array.from({ length: 40 }, (_, i) => {
    const k = i / 39, c = Math.min(1, corsa * k * 2), v = Math.max(0, (corsa * k * 2 - 1)) * volo;
    return pos(c, Math.min(v, volo));
  });
  return (
    <div style={{ position: 'absolute', left: 0, top: y, width: 2160, height: 1100 }}>
      <svg width={2160} height={1100} style={{ position: 'absolute', left: 0, top: 0 }}>
        <rect x={100} y={pista - 10} width={1960} height={200} rx={40} fill={COLORI.testo} opacity={entra(t, t0 - 0.8, 0.4)} />
        {Array.from({ length: 14 }, (_, i) => (
          <rect key={i} x={160 + i * 138} y={pista + 82} width={80} height={16} rx={8} fill="#fff" opacity={entra(t, t0 - 0.7 + i * 0.03, 0.2)} />
        ))}
        <polyline points={scia.map((q) => `${q.x + 160},${q.y + 170}`).join(' ')} fill="none" stroke={COLORI.accento} strokeWidth={14} strokeLinecap="round" opacity={corsa > 0 ? 0.9 : 0} />
      </svg>
      <div style={{ position: 'absolute', left: p.x, top: p.y, transform: `rotate(${angolo}deg)`, opacity: entra(t, t0 - 0.6, 0.3) }}>
        <Icona size={320} color={COLORI.testo} stroke={1.8} />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- uscita a barre scure (copre e scopre)
export const Barriera: React.FC<{ t0: number }> = ({ t0 }) => {
  const { t } = useT();
  if (t < t0 - 0.05 || t > t0 + 0.7) return null;
  return (
    <AbsoluteFill>
      {Array.from({ length: 8 }, (_, i) => {
        const d = i * 0.025;
        const dentro = interpolate(t, [t0 + d, t0 + d + 0.22], [-1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) });
        const fuori = interpolate(t, [t0 + 0.32 + d, t0 + 0.54 + d], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) });
        return <div key={i} style={{ position: 'absolute', left: 0, top: i * 480, width: 2160, height: 482, background: COLORI.scheda, transform: `translateX(${(dentro + fuori) * 2160}px)` }} />;
      })}
      <div style={{ position: 'absolute', left: 1500, top: 0, width: 8, height: 3840, background: COLORI.fondo, opacity: interpolate(t, [t0 + 0.2, t0 + 0.32, t0 + 0.45], [0, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }} />
    </AbsoluteFill>
  );
};
