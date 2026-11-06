// Stile Unboxing per il flusso locale: livello grafico trasparente sopra le riprese del prodotto in DaVinci.
// Titolo all'inizio (UNBOXING + nome del prodotto), schede delle caratteristiche (immagine + testo) e chiusura.
// Props da pc/locale/unboxing.mjs (grafica.json).
//   npx remotion render src/index.ts Unboxing grafica.mov --props=grafica.json --codec=prores --prores-profile=4444 --pixel-format=yuva444p10le --image-format=png --scale=0.5
import React from 'react';
import { AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { FONT } from '../presentazione/tema';

export type Scheda = { testo: string; file?: string | null; t: number; dur: number };
export type PropsUnboxing = {
  durata: number; fps?: number; cartella: string; titolo: string; sopratitolo?: string;
  schede: Scheda[]; chiusura?: { t: number; testo: string; immagine?: string | null };
};

const OMBRA = '0 6px 30px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.35)';
const fuori = Easing.bezier(0.16, 1, 0.3, 1);

// entrata e uscita comuni: sale dal basso sfocato, esce verso l'alto sfocato
function comparsa(t: number, dur: number, ritardo = 0) {
  const e = interpolate(t - ritardo, [0, 0.45], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: fuori });
  const u = interpolate(t, [dur - 0.3, dur], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.cubic) });
  return { opacity: e * (1 - u), transform: `translateY(${(1 - e) * 60 - u * 40}px)`, filter: `blur(${(1 - e) * 14 + u * 10}px)` };
}

// velo scuro in alto, solo mentre c'è testo, per leggerlo su qualunque ripresa
const Velo: React.FC<{ forza: number; alto?: boolean }> = ({ forza, alto = true }) => (
  <AbsoluteFill style={{ background: `linear-gradient(${alto ? '180deg' : '0deg'}, rgba(0,0,0,${0.55 * forza}) 0%, rgba(0,0,0,${0.25 * forza}) 32%, rgba(0,0,0,0) 52%)` }} />
);

const Titolo: React.FC<{ t: number; sopra: string; titolo: string; dur: number }> = ({ t, sopra, titolo, dur }) => {
  const parole = titolo.split(' ');
  const u = interpolate(t, [dur - 0.3, dur], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const spazio = interpolate(t, [0, 1.2], [0.9, 0.55], { extrapolateRight: 'clamp', easing: fuori });
  return (
    <AbsoluteFill>
      <Velo forza={1 - u} />
      <div style={{ position: 'absolute', top: 470, width: '100%', textAlign: 'center' }}>
        <div style={{ ...comparsa(t, dur), fontFamily: FONT.bricolage, fontWeight: 700, fontSize: 64, letterSpacing: `${spazio}em`, color: 'rgba(255,255,255,0.9)', textShadow: OMBRA, marginRight: `-${spazio}em` }}>
          {sopra}
        </div>
        <div style={{ marginTop: 26, padding: '0 140px', lineHeight: 0.98 }}>
          {parole.map((p, i) => (
            <span key={i} style={{ display: 'inline-block', ...comparsa(t, dur, 0.12 + i * 0.07), fontFamily: FONT.bricolage, fontWeight: 800, fontSize: 200,
              color: '#fff', textShadow: OMBRA, letterSpacing: '-0.02em', margin: '0 0.12em' }}>{p}</span>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// scheda: immagine in una card arrotondata + testo sotto; entra con una molla, esce rimpicciolendo
const SchedaVista: React.FC<{ s: Scheda; t: number; cartella: string }> = ({ s, t, cartella }) => {
  const { fps } = useVideoConfig();
  const k = spring({ frame: Math.max(0, t * fps), fps, config: { damping: 14, stiffness: 160, mass: 0.8 } });
  const u = interpolate(t, [s.dur - 0.3, s.dur], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.cubic) });
  const scala = (0.82 + 0.18 * k) * (1 - 0.12 * u);
  const opac = Math.min(1, k * 1.6) * (1 - u);
  return (
    <AbsoluteFill>
      <Velo forza={opac} />
      <div style={{ position: 'absolute', top: 420, left: 0, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center',
        transform: `scale(${scala}) translateY(${(1 - k) * 80}px)`, opacity: opac, filter: `blur(${(1 - Math.min(1, k * 1.3)) * 12 + u * 8}px)` }}>
        {s.file ? (
          <div style={{ width: 1500, height: 900, borderRadius: 64, overflow: 'hidden', background: '#F3F1EC', boxShadow: '0 40px 90px rgba(0,0,0,0.45)',
            border: '6px solid rgba(255,255,255,0.9)' }}>
            <Img src={staticFile(`${cartella}/${s.file}`)} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
        ) : null}
        <div style={{ marginTop: s.file ? 70 : 0, padding: '0 160px', textAlign: 'center', fontFamily: FONT.bricolage, fontWeight: 800, fontSize: s.testo.length > 18 ? 130 : 160,
          lineHeight: 1.0, color: '#fff', textShadow: OMBRA, letterSpacing: '-0.02em' }}>{s.testo}</div>
      </div>
    </AbsoluteFill>
  );
};

const Chiusura: React.FC<{ t: number; testo: string; immagine?: string | null; cartella: string; sopra: string }> = ({ t, testo, immagine, cartella, sopra }) => {
  const { fps } = useVideoConfig();
  const k = spring({ frame: Math.max(0, t * fps), fps, config: { damping: 16, stiffness: 120 } });
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: `rgba(0,0,0,${0.35 * k})` }} />
      <div style={{ position: 'absolute', top: immagine ? 560 : 1300, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center',
        opacity: Math.min(1, k * 1.5), transform: `translateY(${(1 - k) * 90}px) scale(${0.9 + 0.1 * k})`, filter: `blur(${(1 - Math.min(1, k * 1.3)) * 14}px)` }}>
        {immagine ? (
          <div style={{ width: 1640, height: 922, borderRadius: 64, overflow: 'hidden', boxShadow: '0 40px 90px rgba(0,0,0,0.5)', border: '6px solid rgba(255,255,255,0.9)', marginBottom: 90 }}>
            <Img src={staticFile(`${cartella}/${immagine}`)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        ) : null}
        <div style={{ fontFamily: FONT.bricolage, fontWeight: 700, fontSize: 60, letterSpacing: '0.5em', marginRight: '-0.5em', color: 'rgba(255,255,255,0.85)', textShadow: OMBRA }}>{sopra}</div>
        <div style={{ marginTop: 24, padding: '0 140px', textAlign: 'center', fontFamily: FONT.bricolage, fontWeight: 800, fontSize: 190, lineHeight: 0.98, color: '#fff',
          textShadow: OMBRA, letterSpacing: '-0.02em' }}>{testo}</div>
      </div>
    </AbsoluteFill>
  );
};

export const Unboxing: React.FC<PropsUnboxing> = ({ cartella, titolo, sopratitolo = 'UNBOXING', schede, chiusura }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const DUR_TITOLO = 2.4;
  const s = schede.find((x) => t >= x.t && t < x.t + x.dur);
  return (
    <AbsoluteFill>
      {t < DUR_TITOLO ? <Titolo t={t} sopra={sopratitolo} titolo={titolo} dur={DUR_TITOLO} /> : null}
      {s ? <SchedaVista key={s.testo} s={s} t={t - s.t} cartella={cartella} /> : null}
      {chiusura && t >= chiusura.t ? <Chiusura t={t - chiusura.t} testo={chiusura.testo} immagine={chiusura.immagine} cartella={cartella} sopra={sopratitolo} /> : null}
    </AbsoluteFill>
  );
};
