import React from 'react';
import { AbsoluteFill, Img, interpolate, OffthreadVideo, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { loadFont as rajdhani } from '@remotion/google-fonts/Rajdhani';
import { loadFont as anton } from '@remotion/google-fonts/Anton';

// Documentario 16:9 (15/11, Denis): girato col look D2 (freddo, opaco, pelle naturale: scripts/look/pelle.py),
// bande cinema 2,39:1 e titoli come il riferimento: riga piccola sopra, riga grande sottile in maiuscolo con
// le lettere larghe che entrano una alla volta; ogni tanto una parola forte in rosso, spessa (tipo Impact).

const { fontFamily: SOTTILE } = rajdhani('normal', { weights: ['300', '500', '700'], subsets: ['latin', 'latin-ext'] });
const { fontFamily: FORTE } = anton('normal', { weights: ['400'], subsets: ['latin', 'latin-ext'] });

export const ROSSO = '#E50914';
export const BANDA = 138; // 1080 − 1920/2,39 ≈ 276 → 138 sopra e 138 sotto

export type Titolo = { at: number; dur: number; piccolo?: string; grande: string; rosso?: string | null; lato?: 'destra' | 'sinistra' };
export type Parola = { at: number; dur: number; parola: string };
export type Capitolo = { at: number; titolo: string };
export type Immagine = { file: string; at: number; dur: number; didascalia?: string; credito?: string; verticale?: boolean };
export type Data = { at: number; dur: number; anno: string; cosa?: string };
export type PropsDoc169 = { video: string; durata: number; fps: number; bande?: boolean; titoli: Titolo[]; parole?: Parola[]; capitoli?: Capitolo[]; immagini?: Immagine[]; date?: Data[] };

// 📅 linea del tempo (video lunghi, 16/11): il video si scurisce, l'anno grande e sottile entra lettera per
// lettera come i titoli, una riga rossa si allunga e sotto l'evento in piccolo. Denis continua a parlare sotto.
const DataStorica: React.FC<{ d: Data }> = ({ d }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = frame / fps;
  const buio = interpolate(s, [0, 0.35, d.dur - 0.4, d.dur], [0, 0.8, 0.8, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const esce = interpolate(s, [d.dur - 0.4, d.dur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const cifre = [...d.anno.toUpperCase()];
  const linea = interpolate(s, [0.5, 1.3], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const sotto = interpolate(s, [0.9, 1.4], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const grande = cifre.length <= 4 ? 230 : Math.max(90, Math.round(1500 / (cifre.length * 0.95)));
  return (
    <AbsoluteFill style={{ backgroundColor: `rgba(0,0,0,${buio})`, justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ opacity: esce, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ fontFamily: SOTTILE, fontWeight: 300, fontSize: grande, lineHeight: 1, letterSpacing: '0.14em', color: '#fff', whiteSpace: 'nowrap', marginRight: '-0.14em' }}>
          {cifre.map((c, i) => {
            const a = interpolate(s, [0.15 + i * 0.07, 0.45 + i * 0.07], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
            return <span key={i} style={{ opacity: a, filter: `blur(${(1 - a) * 8}px)` }}>{c}</span>;
          })}
        </div>
        <div style={{ width: 520 * linea, height: 3, background: ROSSO, margin: '26px 0 22px' }} />
        {d.cosa ? <div style={{ fontFamily: SOTTILE, fontWeight: 500, fontSize: 40, letterSpacing: '0.22em', color: '#ddd', textTransform: 'uppercase', opacity: sotto }}>{d.cosa}</div> : null}
      </div>
    </AbsoluteFill>
  );
};

// 🏛️ immagine d'archivio a tutto schermo (prototipo Redazione, 16/11): entra con un lampo nero, si muove piano
// (Ken Burns), un po' fredda come il look D2; didascalia in basso a sinistra e credito piccolo (licenza libera)
const Archivio: React.FC<{ im: Immagine; n: number }> = ({ im, n }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = frame / fps;
  const vis = interpolate(s, [0, 0.25, im.dur - 0.3, im.dur], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const k = s / im.dur;
  const verso = n % 2 ? -1 : 1;
  const testo = interpolate(s, [0.4, 0.9], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ backgroundColor: `rgba(0,0,0,${vis})` }}>
      <AbsoluteFill style={{ opacity: vis, overflow: 'hidden' }}>
        {im.verticale ? (
          <>
            {/* ritratto: intero al centro, la stessa foto sfocata e scura come sfondo */}
            <Img src={staticFile(im.file)} style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'cover', transform: 'scale(1.15)',
              filter: 'blur(40px) saturate(0.5) brightness(0.45)' }} />
            <Img src={staticFile(im.file)} style={{ position: 'absolute', left: 0, right: 0, margin: '0 auto', top: BANDA, height: 1080 - 2 * BANDA, width: '100%', objectFit: 'contain',
              transform: `scale(${1.0 + 0.06 * k})`, filter: 'saturate(0.72) contrast(1.06) brightness(0.92) sepia(0.08) hue-rotate(-6deg)', boxShadow: '0 0 60px rgba(0,0,0,0.6)' }} />
          </>
        ) : (
          <Img src={staticFile(im.file)} style={{ width: '100%', height: '100%', objectFit: 'cover',
            transform: `scale(${1.06 + 0.08 * k}) translateX(${verso * (k - 0.5) * 2.5}%)`,
            filter: 'saturate(0.72) contrast(1.06) brightness(0.92) sepia(0.08) hue-rotate(-6deg)' }} />
        )}
        <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)' }} />
        <AbsoluteFill style={{ background: 'linear-gradient(0deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 32%)' }} />
      </AbsoluteFill>
      {im.didascalia ? (
        <div style={{ position: 'absolute', left: 96, bottom: BANDA + 46, opacity: testo * vis, transform: `translateY(${(1 - testo) * 10}px)`,
          fontFamily: SOTTILE, fontWeight: 500, fontSize: 40, letterSpacing: '0.2em', color: '#fff', textTransform: 'uppercase',
          borderLeft: `5px solid ${ROSSO}`, paddingLeft: 18, textShadow: '0 2px 14px rgba(0,0,0,0.7)' }}>{im.didascalia}</div>
      ) : null}
      {im.credito ? (
        <div style={{ position: 'absolute', right: 40, bottom: BANDA + 14, opacity: 0.75 * vis, fontFamily: SOTTILE, fontWeight: 500,
          fontSize: 17, letterSpacing: '0.04em', color: '#ddd', textShadow: '0 1px 6px rgba(0,0,0,0.8)' }}>{im.credito}</div>
      ) : null}
    </AbsoluteFill>
  );
};

// 📖 cartello di capitolo, come nei documentari YouTube: «CAPITOLO 2» piccolo e rosso, titolo grande largo, a sinistra
const CartelloCapitolo: React.FC<{ c: Capitolo; n: number; dur: number }> = ({ c, n, dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = frame / fps;
  const entra = spring({ frame, fps, config: { damping: 18, stiffness: 140 } });
  const esce = interpolate(s, [dur - 0.5, dur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const linea = interpolate(s, [0.15, 0.8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', paddingLeft: 96, paddingBottom: BANDA + 70, opacity: esce }}>
      <div style={{ background: 'radial-gradient(ellipse 100% 100% at 0% 100%, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.35) 45%, rgba(0,0,0,0) 100%)', position: 'absolute', left: 0, bottom: BANDA, width: 1300, height: 420 }} />
      <div style={{ position: 'relative', opacity: entra, transform: `translateX(${(1 - entra) * -30}px)` }}>
        <div style={{ fontFamily: SOTTILE, fontWeight: 700, fontSize: 34, letterSpacing: '0.35em', color: '#ff2a35', textShadow: '0 2px 12px rgba(0,0,0,0.85), 0 0 2px rgba(0,0,0,0.9)' }}>CAPITOLO {n}</div>
        <div style={{ width: 340 * linea, height: 3, background: ROSSO, margin: '12px 0 14px' }} />
        <div style={{ fontFamily: SOTTILE, fontWeight: 500, fontSize: 64, letterSpacing: '0.22em', color: '#fff', textTransform: 'uppercase', whiteSpace: 'nowrap',
          textShadow: '0 2px 18px rgba(0,0,0,0.6)' }}>{c.titolo}</div>
      </div>
    </AbsoluteFill>
  );
};

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

export const Doc169: React.FC<PropsDoc169> = ({ video, bande = true, titoli, parole = [], capitoli = [], immagini = [], date = [] }) => {
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
      {capitoli.map((c, i) => (
        <Sequence key={`c${c.at}`} from={Math.round(c.at * fps)} durationInFrames={Math.round(3.2 * fps)}>
          <CartelloCapitolo c={c} n={i + 1} dur={3.2} />
        </Sequence>
      ))}
      {date.map((d) => (
        <Sequence key={`d${d.at}`} from={Math.round(d.at * fps)} durationInFrames={Math.max(1, Math.round(d.dur * fps))}>
          <DataStorica d={d} />
        </Sequence>
      ))}
      {immagini.map((im, i) => (
        <Sequence key={`a${im.at}`} from={Math.round(im.at * fps)} durationInFrames={Math.max(1, Math.round(im.dur * fps))}>
          <Archivio im={im} n={i} />
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
