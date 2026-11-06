// Pezzi dello stile Presentazione (fondo Tiffany, Bricolage Grotesque): testo che si accumula parola per parola sul
// parlato, infografiche che cambiano col tema (barre, curva, prompt, acronimo, oggetto su percorso) e uscita a barre.
// Tutti i tempi sono in secondi sul video; i componenti stanno dentro una composizione 2160×3840.
import React from 'react';
import { AbsoluteFill, Img, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, Easing } from 'remotion';
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

// altezza che occupano le righe (per impaginare la grafica sotto)
export const altezzaRighe = (parole: Parola[], scala = 1) => {
  const righe = [...new Set(parole.map((p) => p.riga))].map((r) => parole.filter((p) => p.riga === r));
  return righe.reduce((h, riga) => {
    const testo = riga.map((p) => p.w).join(' ');
    return h + Math.min(BASE[riga[0].taglia ?? 'grande'] * scala, fitText({ text: testo, withinWidth: LARGO, fontFamily: FONT.bricolage, fontWeight: '800' }).fontSize * 0.98) * 0.98;
  }, 0);
};

export const Righe: React.FC<{ parole: Parola[]; y: number; scala?: number }> = ({ parole, y, scala = 1 }) => {
  const { t } = useT();
  const righe = [...new Set(parole.map((p) => p.riga))].sort((a, b) => a - b).map((r) => parole.filter((p) => p.riga === r));
  let cursore = y;
  return (
    <>
      {righe.map((riga, k) => {
        const testo = riga.map((p) => p.w).join(' ');
        const taglia = riga[0].taglia ?? 'grande';
        const fs = Math.min(BASE[taglia] * scala, fitText({ text: testo, withinWidth: LARGO, fontFamily: FONT.bricolage, fontWeight: '800' }).fontSize * 0.98);
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

// ---------------------------------------------------------------- onda sonora (suono, voce, musica, audio)
export const Onda: React.FC<{ t0: number; y: number }> = ({ t0, y }) => {
  const { t } = useT();
  const n = 56;
  return (
    <svg width={1920} height={700} style={{ position: 'absolute', left: 120, top: y }}>
      {Array.from({ length: n }, (_, i) => {
        const e = entra(t, t0 + i * 0.012, 0.3);
        // le barre "suonano": l'altezza vive col tempo
        const vivo = 0.75 + 0.25 * Math.sin(t * 9 + i * 0.8);
        const h = (60 + Math.abs(Math.sin(i * 1.7) * 220 + Math.sin(i * 0.43) * 150)) * e * vivo;
        return <rect key={i} x={i * 34} y={350 - h / 2} width={18} height={Math.max(4, h)} rx={9} fill={COLORI.testo} />;
      })}
      {/* testina che scorre */}
      <rect x={interpolate(t, [t0, t0 + 3], [0, 1880], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} y={20} width={8} height={660} fill={COLORI.accento} opacity={entra(t, t0, 0.3)} />
    </svg>
  );
};

// ---------------------------------------------------------------- icona grande (concetto generico), con anello che pulsa
export const IconaGrande: React.FC<{ icona: string; t0: number; y: number; etichetta?: string }> = ({ icona, t0, y, etichetta }) => {
  const { t, fps } = useT();
  const Icona = ((Icone as unknown) as Record<string, React.FC<{ size: number; color: string; stroke: number }>>)[icona] ?? Icone.IconBulb;
  const s = spring({ frame: Math.round((t - t0) * fps), fps, config: { damping: 12, stiffness: 140 } });
  const anello = ((t - t0) % 1.6) / 1.6;
  return (
    <div style={{ position: 'absolute', left: 0, top: y, width: 2160, height: 900 }}>
      <div style={{ position: 'absolute', left: 1080 - 330, top: 70, width: 660, height: 660, borderRadius: 330, background: COLORI.scheda, transform: `scale(${s})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icona size={400} color={COLORI.schedaTesto} stroke={1.6} />
      </div>
      {t > t0 && <div style={{ position: 'absolute', left: 1080 - 330, top: 70, width: 660, height: 660, borderRadius: 330, border: `10px solid ${COLORI.accento}`, transform: `scale(${1 + anello * 0.45})`, opacity: (1 - anello) * s }} />}
      {etichetta && <div style={{ position: 'absolute', left: 0, right: 0, top: 790, textAlign: 'center', fontFamily: FONT.mono, fontWeight: 700, fontSize: 72, color: COLORI.testo, opacity: entra(t, t0 + 0.25, 0.3), letterSpacing: 4 }}>{etichetta}</div>}
    </div>
  );
};

// ---------------------------------------------------------------- numero che conta
export const Numero: React.FC<{ valore: number; suffisso?: string; t0: number; y: number }> = ({ valore, suffisso = '', t0, y }) => {
  const { t } = useT();
  const k = interpolate(t, [t0, t0 + 1.1], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const decimali = Number.isInteger(valore) ? 0 : 1;
  const testo = (valore * k).toLocaleString('it-IT', { minimumFractionDigits: decimali, maximumFractionDigits: decimali }) + suffisso;
  const fs = Math.min(560, fitText({ text: valore.toLocaleString('it-IT') + suffisso, withinWidth: LARGO, fontFamily: FONT.bricolage, fontWeight: '800' }).fontSize);
  return (
    <div style={{ position: 'absolute', left: SX, top: y, width: LARGO, opacity: entra(t, t0 - 0.1, 0.25) }}>
      <div style={{ fontFamily: FONT.bricolage, fontWeight: 800, fontSize: fs, lineHeight: 1, color: COLORI.testo, letterSpacing: -fs * 0.03, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{testo}</div>
      <div style={{ marginTop: 30, height: 16, width: `${k * 100}%`, background: COLORI.accento, borderRadius: 8 }} />
    </div>
  );
};

// ---------------------------------------------------------------- foto o clip in una scheda scura con etichetta monospace
export const Foto: React.FC<{ file: string; t0: number; y: number; h: number; etichetta?: string }> = ({ file, t0, y, h, etichetta }) => {
  const { t } = useT();
  const e = entra(t, t0, 0.4);
  const video = /\.mp4$/i.test(file);
  const barra = etichetta ? 110 : 0;
  // leggero zoom lento dentro la scheda
  const z = 1.04 + 0.04 * Math.min(1, Math.max(0, (t - t0) / 4));
  return (
    <div style={{
      position: 'absolute', left: SX, top: y, width: LARGO, height: h, borderRadius: 48, background: COLORI.scheda, overflow: 'hidden',
      opacity: e, transform: `translateY(${(1 - e) * 140}px) rotate(${(1 - e) * -2}deg)`, boxShadow: '0 30px 0 rgba(11,31,36,0.18)',
    }}>
      <div style={{ position: 'absolute', left: 24, top: 24, right: 24, bottom: 24 + barra, borderRadius: 30, overflow: 'hidden' }}>
        {video
          ? <OffthreadVideo src={staticFile(file)} muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${z})` }} />
          : <Img src={staticFile(file)} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${z})` }} />}
      </div>
      {etichetta && <div style={{ position: 'absolute', left: 50, bottom: 34, fontFamily: FONT.mono, fontWeight: 700, fontSize: 58, color: COLORI.schedaTesto, letterSpacing: 3, whiteSpace: 'nowrap' }}>
        <span style={{ display: 'inline-block', width: 26, height: 26, borderRadius: 13, background: COLORI.accento, marginRight: 22, verticalAlign: 'middle' }} />{etichetta}
      </div>}
    </div>
  );
};

// ---------------------------------------------------------------- il video vero di Denis dentro la grafica
// tu: il proxy del video sorgente (public) e i pezzi tenuti (tagli.json): al secondo t del video montato corrisponde
// il secondo giusto della sorgente. Il video copre il riquadro w×h con il viso (viso.py) al centro.
export type Tu = { video: string; tieni: { da: number; a: number }[]; ar: number; viso?: { t: number; x: number; y: number }[] };
const visoTu = (tu: Tu, t: number) => {
  const v = tu.viso;
  if (!v?.length) return { x: 0.5, y: 0.42 };
  let i = 0;
  while (i + 1 < v.length && v[i + 1].t <= t) i++;
  return v[i];
};
export const TuVideo: React.FC<{ tu: Tu; w: number; h: number; zoom?: number; yViso?: number }> = ({ tu, w, h, zoom = 1.15, yViso = 0.42 }) => {
  const { t, fps } = useT();
  const vw = Math.max(w, h * tu.ar) * zoom, vh = vw / tu.ar;
  const v = visoTu(tu, t);
  const left = Math.min(0, Math.max(w - vw, w / 2 - v.x * vw));
  const top = Math.min(0, Math.max(h - vh, h * yViso - v.y * vh));
  let cum = 0;
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {tu.tieni.map((x, i) => {
        const da = cum; cum += x.a - x.da;
        // solo il pezzo in corso (con mezzo secondo di margine): niente decodifica inutile
        if (t < da - 0.5 || t > cum + 0.5) return null;
        return (
          <Sequence key={i} from={Math.round(da * fps)} durationInFrames={Math.max(1, Math.round((x.a - x.da) * fps))} layout="none">
            <OffthreadVideo src={staticFile(tu.video)} startFrom={Math.round(x.da * fps)} muted style={{ position: 'absolute', left, top, width: vw, height: vh }} />
          </Sequence>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------- riquadro: il contorno si disegna, poi dentro c'è lui
export const Riquadro: React.FC<{ tu: Tu; t0: number; y: number; w?: number; h?: number }> = ({ tu, t0, y, w = 1920, h = 1240 }) => {
  const { t } = useT();
  const linea = interpolate(t, [t0, t0 + 0.35], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) });
  const pieno = entra(t, t0 + 0.3, 0.25);
  const video = entra(t, t0 + 0.45, 0.3);
  const per = 2 * (w + h);
  return (
    <div style={{ position: 'absolute', left: (2160 - w) / 2, top: y, width: w, height: h }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: 40, overflow: 'hidden', background: COLORI.scheda, opacity: pieno, transform: `scale(${0.96 + 0.04 * pieno})` }}>
        <div style={{ position: 'absolute', inset: 0, opacity: video, filter: `blur(${(1 - video) * 20}px)` }}><TuVideo tu={tu} w={w} h={h} /></div>
      </div>
      <svg width={w + 20} height={h + 20} style={{ position: 'absolute', left: -10, top: -10, overflow: 'visible' }}>
        <rect x={10} y={10} width={w} height={h} rx={40} fill="none" stroke={COLORI.linea} strokeWidth={8} strokeDasharray={per} strokeDashoffset={per * (1 - linea)} opacity={1 - pieno * 0.85} />
      </svg>
      <div style={{ position: 'absolute', right: -26, top: -26, width: 52, height: 52, borderRadius: 26, background: COLORI.accento, transform: `scale(${pieno})` }} />
    </div>
  );
};

// ---------------------------------------------------------------- parola-finestra: parola enorme, nella O c'è lui
export const ParolaFinestra: React.FC<{ tu: Tu; parola: string; t0: number; y: number }> = ({ tu, parola, t0, y }) => {
  const { t } = useT();
  const W = parola.toUpperCase();
  const k = W.indexOf('O') >= 0 ? W.indexOf('O') : -1;
  const fs = Math.min(560, fitText({ text: W, withinWidth: LARGO, fontFamily: FONT.bricolage, fontWeight: '800' }).fontSize * 0.98);
  const e = entra(t, t0, 0.32);
  const capW = measureText({ text: 'O', fontFamily: FONT.bricolage, fontSize: fs, fontWeight: '800' }).width * 0.92;
  const capH = fs * 0.74;
  const aperta = entra(t, t0 + 0.25, 0.3);
  return (
    <div style={{
      position: 'absolute', left: SX, top: y, whiteSpace: 'nowrap', fontFamily: FONT.bricolage, fontWeight: 800, fontSize: fs, lineHeight: 1,
      letterSpacing: -fs * 0.02, color: COLORI.testo, transform: `translateX(${(1 - e) * -500}px) skewX(${(1 - e) * -12}deg)`, filter: `blur(${(1 - e) * 24}px)`, opacity: Math.min(1, e * 2),
    }}>
      {k < 0 ? W : <>
        {W.slice(0, k)}
        <span style={{ display: 'inline-block', position: 'relative', width: capW, height: capH, borderRadius: capW / 2, overflow: 'hidden', background: COLORI.testo, verticalAlign: 'baseline', margin: `0 ${fs * 0.02}px`, transform: `translateY(${fs * 0.02}px)` }}>
          <div style={{ position: 'absolute', inset: 0, opacity: aperta }}><TuVideo tu={tu} w={capW} h={capH} zoom={1.6} yViso={0.45} /></div>
        </span>
        {W.slice(k + 1)}
      </>}
    </div>
  );
};

// ---------------------------------------------------------------- collage: foto sparse su fondo crema, si accumulano
const CREMA = '#F4EFE4';
export const Collage: React.FC<{ foto: { file: string; t0: number }[]; cartella: string }> = ({ foto, cartella }) => {
  const { t } = useT();
  // posizioni fisse e ruotate, alternate a sinistra e a destra, dall'alto in basso
  const posti = [
    { x: 160, y: 340, r: -6, w: 1280 }, { x: 760, y: 1050, r: 5, w: 1240 }, { x: 120, y: 1850, r: -3, w: 1300 },
    { x: 700, y: 2550, r: 7, w: 1200 }, { x: 260, y: 700, r: 3, w: 1500 }, { x: 600, y: 1500, r: -7, w: 1350 },
  ];
  return (
    <AbsoluteFill style={{ background: CREMA }}>
      {foto.filter((f) => t >= f.t0 - 0.05).map((f, i) => {
        const p = posti[i % posti.length];
        const e = entra(t, f.t0, 0.35);
        const video = /\.mp4$/i.test(f.file);
        return (
          <div key={f.file + i} style={{
            position: 'absolute', left: p.x, top: p.y, width: p.w, padding: 22, background: '#fff', boxShadow: '0 40px 80px rgba(40,30,10,0.28)',
            transform: `rotate(${p.r + (1 - e) * 14}deg) scale(${1.25 - 0.25 * e}) translateY(${(1 - e) * 200}px)`, opacity: e, filter: `blur(${(1 - e) * 22}px)`,
          }}>
            {video
              ? <OffthreadVideo src={staticFile(`${cartella}/${f.file}`)} muted style={{ width: '100%', display: 'block' }} />
              : <Img src={staticFile(`${cartella}/${f.file}`)} style={{ width: '100%', display: 'block' }} />}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
