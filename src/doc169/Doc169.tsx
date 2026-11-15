import React from 'react';
import { AbsoluteFill, interpolate, OffthreadVideo, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { loadFont as rajdhani } from '@remotion/google-fonts/Rajdhani';
import { loadFont as anton } from '@remotion/google-fonts/Anton';

// Documentario 16:9 (15/11, Denis): girato col look D2 (freddo, opaco, pelle naturale: scripts/look/pelle.py),
// bande cinema 2,39:1 e titoli come il riferimento: riga piccola sopra, riga grande sottile in maiuscolo con
// le lettere larghe che entrano una alla volta; ogni tanto una parola forte in rosso, spessa (tipo Impact).

const { fontFamily: SOTTILE } = rajdhani('normal', { weights: ['300', '500'], subsets: ['latin', 'latin-ext'] });
const { fontFamily: FORTE } = anton('normal', { weights: ['400'], subsets: ['latin', 'latin-ext'] });

export const ROSSO = '#E50914';
export const BANDA = 138; // 1080 − 1920/2,39 ≈ 276 → 138 sopra e 138 sotto

export type Titolo = { at: number; dur: number; piccolo?: string; grande: string; rosso?: string | null; lato?: 'destra' | 'sinistra' };
export type Parola = { at: number; dur: number; parola: string };
export type PropsDoc169 = { video: string; durata: number; fps: number; bande?: boolean; titoli: Titolo[]; parole?: Parola[] };

// la parola rossa da sola (Denis, 15/11: «almeno una ogni 4–5 secondi»): entra col colpo, resta, sfuma
const ParolaRossa: React.FC<{ p: Parola }> = ({ p }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const colpo = spring({ frame, fps, config: { damping: 13, stiffness: 240, mass: 0.6 } });
  const esce = interpolate(frame / fps, [p.dur - 0.3, p.dur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ justifyContent: 'center', paddingLeft: '52%' }}>
      <div style={{ fontFamily: FORTE, fontSize: 168, lineHeight: 1, color: ROSSO, textTransform: 'uppercase', marginTop: 40,
        opacity: Math.min(1, colpo * 1.6) * esce, transform: `scale(${1.3 - 0.3 * colpo})`, transformOrigin: 'left center',
        textShadow: '0 6px 30px rgba(0,0,0,0.45)' }}>{p.parola}</div>
    </AbsoluteFill>
  );
};

const TitoloDoc: React.FC<{ t: Titolo }> = ({ t }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = frame / fps;
  const lettere = [...t.grande.toUpperCase()];
  const passo = 0.045; // una lettera ogni 45 ms
  const fineGrande = 0.35 + lettere.length * passo + 0.25;
  const esce = interpolate(s, [t.dur - 0.6, t.dur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const piccolo = interpolate(s, [0, 0.5], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const colpo = spring({ frame: frame - Math.round(fineGrande * fps), fps, config: { damping: 14, stiffness: 220, mass: 0.6 } });
  const destra = (t.lato || 'destra') === 'destra';
  return (
    <AbsoluteFill style={{ justifyContent: 'center', paddingLeft: destra ? '52%' : '6%', opacity: esce }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: -40 }}>
        {t.piccolo ? (
          <div style={{ fontFamily: SOTTILE, fontWeight: 500, fontSize: 44, letterSpacing: '0.16em', color: '#fff',
            opacity: piccolo, transform: `translateY(${(1 - piccolo) * 8}px)`, textShadow: '0 2px 14px rgba(0,0,0,0.6)' }}>{t.piccolo}</div>
        ) : null}
        <div style={{ fontFamily: SOTTILE, fontWeight: 500, fontSize: Math.min(88, Math.round(900 / (lettere.length * 0.88))), letterSpacing: '0.3em', color: '#fff', whiteSpace: 'nowrap',
          textShadow: '0 2px 18px rgba(0,0,0,0.6), 0 0 2px rgba(0,0,0,0.4)' }}>
          {lettere.map((c, i) => {
            const a = interpolate(s, [0.35 + i * passo, 0.35 + i * passo + 0.3], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
            return <span key={i} style={{ opacity: a, filter: `blur(${(1 - a) * 6}px)` }}>{c}</span>;
          })}
        </div>
        {t.rosso ? (
          <div style={{ fontFamily: FORTE, fontSize: 150, lineHeight: 1, color: ROSSO, letterSpacing: '0.01em', textTransform: 'uppercase',
            opacity: Math.min(1, colpo * 1.6), transform: `scale(${1.25 - 0.25 * colpo})`, transformOrigin: 'left center',
            textShadow: '0 4px 24px rgba(0,0,0,0.35)' }}>{t.rosso}</div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

export const Doc169: React.FC<PropsDoc169> = ({ video, bande = true, titoli, parole = [] }) => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      {video ? <OffthreadVideo src={staticFile(video)} /> : null}
      {/* ombra morbida a destra: i testi si leggono anche sull'armadio bianco */}
      {titoli.length || parole.length ? <AbsoluteFill style={{ background: 'linear-gradient(90deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.38) 100%)' }} /> : null}
      {parole.map((p) => (
        <Sequence key={`p${p.at}`} from={Math.round(p.at * fps)} durationInFrames={Math.max(1, Math.round(p.dur * fps))}>
          <ParolaRossa p={p} />
        </Sequence>
      ))}
      {titoli.map((t) => (
        <Sequence key={`${t.at}`} from={Math.round(t.at * fps)} durationInFrames={Math.max(1, Math.round(t.dur * fps))}>
          <TitoloDoc t={t} />
        </Sequence>
      ))}
      {bande ? (
        <>
          <AbsoluteFill style={{ height: BANDA, backgroundColor: 'black' }} />
          <AbsoluteFill style={{ top: 1080 - BANDA, height: BANDA, backgroundColor: 'black' }} />
        </>
      ) : null}
    </AbsoluteFill>
  );
};
