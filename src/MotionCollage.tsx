import React from 'react';
import { AbsoluteFill, Easing, interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { loadFont } from '@remotion/google-fonts/Montserrat';
import { Clips, f, Icone, Inserti, MusicaSotto, Sfx, usaFps, volumeSfx } from './comune';
import { durataClip, durataTotale, Keyword, Piano } from './piano';

// Motion-Collage: il video è una foto incollata su carta (nastro adesivo, inclinazione che cambia a
// ogni taglio) e la voce c'è sempre. Le parole chiave della regia escono come ritagli: i numeri in box
// giallo, le altre parole su una striscia di carta, ogni tanto una freccia verso il video.
// La prima versione (02/11) aveva i testi fissi del video sulla Sharia e la voce solo in 3 finestre.

const { fontFamily: MONTSERRAT } = loadFont('normal', { weights: ['700', '900'], subsets: ['latin'] });

const CARTA = '#F2E8D4';
const INCHIOSTRO = '#151515';
const GIALLO = '#FFE62E';
const VERDE = '#2FBF71';
const INCLINAZIONI = [-2.2, 1.6, -1.1, 2.4, -1.7, 0.9];
const SFX = { riser: 0.6, ui_in: 0.45, ui_conferma: 0.55, strappo: 0.35 } as const;
// riquadro del video: lascia carta sopra e sotto per i ritagli
const CARD = { left: 70, top: 300, width: 940, height: 1320 };
const DURATA_TITOLO = 2.2;

// i ritagli si alternano sopra e sotto il video, spostati a destra e sinistra
// sotto = forzato sotto il video (in apertura la zona alta è del titolo)
function posto(i: number, sotto = false) {
  const sopra = !sotto && i % 2 === 0;
  return {
    top: sopra ? 110 + (i % 4 === 0 ? 0 : 40) : 1640 + (i % 4 === 1 ? 0 : 40),
    left: i % 3 === 0 ? 60 : i % 3 === 1 ? 300 : 160,
    rotate: INCLINAZIONI[(i + 2) % INCLINAZIONI.length],
    sopra,
  };
}

const Carta: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: CARTA }}>
    <AbsoluteFill style={{ background: 'linear-gradient(135deg, #f9f3e8 0%, #e8d9c0 45%, #f4ead8 100%)' }} />
    {/* righe di quaderno appena visibili */}
    <AbsoluteFill style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent 0 58px, rgba(60,40,10,0.06) 58px 60px)' }} />
    {/* due pezzi di carta dietro al video */}
    <div style={{ position: 'absolute', left: -40, top: 220, width: 420, height: 300, background: '#E3D6BC', transform: 'rotate(-8deg)', boxShadow: '0 2px 6px rgba(0,0,0,0.12)' }} />
    <div style={{ position: 'absolute', right: -60, bottom: 260, width: 460, height: 340, background: '#D9CBAE', transform: 'rotate(6deg)', boxShadow: '0 2px 6px rgba(0,0,0,0.12)' }} />
  </AbsoluteFill>
);

const Nastro: React.FC<{ left: number; top: number; rotate: number }> = ({ left, top, rotate }) => (
  <div style={{ position: 'absolute', left, top, width: 190, height: 52, background: 'rgba(245,235,200,0.78)', transform: `rotate(${rotate}deg)`, boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }} />
);

// il video in una cornice bianca, che cambia inclinazione e fa un piccolo "pop" a ogni taglio
const Foto: React.FC<{ piano: Piano }> = ({ piano }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  let inizio = 0;
  let indice = 0;
  for (const [i, c] of piano.clips.entries()) {
    indice = i;
    const len = f(durataClip(c));
    if (frame < inizio + len) break;
    inizio += len;
  }
  const pop = spring({ frame: frame - inizio, fps, config: { damping: 14, stiffness: 180 }, durationInFrames: 8 });
  const rotate = INCLINAZIONI[indice % INCLINAZIONI.length];
  return (
    <div style={{
      position: 'absolute', left: CARD.left, top: CARD.top, width: CARD.width, height: CARD.height,
      transform: `rotate(${rotate}deg) scale(${0.97 + 0.03 * pop})`, boxSizing: 'border-box',
      background: '#fff', padding: 18, boxShadow: '6px 10px 0 rgba(0,0,0,0.18), 0 4px 18px rgba(0,0,0,0.2)',
    }}>
      <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
        <Clips piano={piano} />
      </div>
      <Nastro left={-50} top={-22} rotate={-28} />
      <Nastro left={CARD.width - 140} top={-22} rotate={26} />
    </div>
  );
};

// ritaglio di una parola chiave: numeri in box giallo grande, parole su striscia di carta
const Ritaglio: React.FC<{ k: Keyword; i: number; len: number; sotto: boolean }> = ({ k, i, len, sotto }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = posto(i, sotto);
  const entra = spring({ frame, fps, config: { damping: 11, stiffness: 160 } });
  const opacita = interpolate(frame, [0, 3, Math.max(4, len - 5), Math.max(5, len)], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const parola = k.word.toUpperCase();
  const numero = /\d/.test(parola);
  const size = numero ? 120 : parola.length > 14 ? 58 : parola.length > 9 ? 72 : 88;
  const fondo = k.filled ? VERDE : numero ? GIALLO : '#FFFFFF';
  return (
    <div style={{
      position: 'absolute', top: p.top, left: p.left, maxWidth: 1080 - p.left - 50, opacity: opacita,
      transform: `scale(${0.6 + 0.4 * entra}) rotate(${p.rotate + (1 - entra) * 6}deg)`, transformOrigin: 'left center',
    }}>
      {k.tag ? (
        <div style={{ display: 'inline-block', marginBottom: 6, padding: '2px 10px', background: INCHIOSTRO, color: '#fff', fontFamily: MONTSERRAT, fontWeight: 700, fontSize: 26 }}>{k.tag}</div>
      ) : null}
      <div style={{
        background: fondo, color: INCHIOSTRO, fontFamily: MONTSERRAT, fontWeight: 900, fontSize: size, lineHeight: 1.05,
        padding: numero ? '6px 22px' : '8px 20px', border: `3px solid ${INCHIOSTRO}`, boxShadow: `5px 6px 0 ${INCHIOSTRO}`,
        wordBreak: 'break-word',
      }}>{parola}</div>
      {k.note ? (
        <div style={{ marginTop: 10, fontFamily: MONTSERRAT, fontWeight: 700, fontSize: 32, color: INCHIOSTRO, background: 'rgba(255,255,255,0.75)', display: 'inline-block', padding: '2px 10px' }}>{k.note}</div>
      ) : null}
    </div>
  );
};

// freccia disegnata dal ritaglio verso il video
const Freccia: React.FC<{ i: number; sotto: boolean }> = ({ i, sotto }) => {
  const frame = useCurrentFrame();
  const p = posto(i, sotto);
  const t = interpolate(frame, [4, 16], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const x1 = p.left + 260;
  const y1 = p.sopra ? p.top + 140 : p.top - 10;
  const x2 = 540 + (i % 2 === 0 ? 80 : -80);
  const y2 = p.sopra ? CARD.top + 220 : CARD.top + CARD.height - 220;
  const lunghezza = Math.hypot(x2 - x1, y2 - y1);
  const angolo = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  return (
    <div style={{ position: 'absolute', left: x1, top: y1 - 4, width: lunghezza * t, height: 8, background: INCHIOSTRO, transform: `rotate(${angolo}deg)`, transformOrigin: '0 50%', opacity: t }}>
      <div style={{ position: 'absolute', right: -4, top: -8, width: 0, height: 0, borderLeft: `22px solid ${INCHIOSTRO}`, borderTop: '12px solid transparent', borderBottom: '12px solid transparent' }} />
    </div>
  );
};

// titolo del video in apertura, come un'etichetta gialla
const Titolo: React.FC<{ testo: string; len: number }> = ({ testo, len }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entra = spring({ frame, fps, config: { damping: 12, stiffness: 150 } });
  const opacita = interpolate(frame, [len - 6, len], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div style={{ position: 'absolute', top: 120, left: 60, right: 60, opacity: opacita, transform: `scale(${0.7 + 0.3 * entra}) rotate(-2deg)` }}>
      <div style={{ display: 'inline-block', background: GIALLO, color: INCHIOSTRO, fontFamily: MONTSERRAT, fontWeight: 900, fontSize: 70, lineHeight: 1.05, padding: '10px 24px', border: `3px solid ${INCHIOSTRO}`, boxShadow: `6px 7px 0 ${INCHIOSTRO}` }}>
        {testo.toUpperCase()}
      </div>
    </div>
  );
};

export const MotionCollage: React.FC<Piano> = (piano) => {
  usaFps(piano);
  const totale = Math.max(1, f(durataTotale(piano)));
  const sfx = volumeSfx(piano);
  const titolo = (piano.titolo || '').trim();
  const lenTitolo = f(DURATA_TITOLO);
  // il titolo occupa la zona alta: le parole chiave dei primi 2 s vanno sotto il video
  const ritagli = piano.keywords.map((k, i) => ({ k, i, sotto: Boolean(titolo) && k.at < DURATA_TITOLO }));

  return (
    <AbsoluteFill style={{ backgroundColor: CARTA }}>
      <Carta />
      <Sequence from={0} durationInFrames={totale}>
        <Foto piano={piano} />
      </Sequence>

      <Inserti piano={piano} sfx={sfx} />
      <Icone piano={piano} sfx={sfx} />
      <MusicaSotto piano={piano} />

      {titolo ? (
        <Sequence from={0} durationInFrames={lenTitolo}>
          <Titolo testo={titolo} len={lenTitolo} />
        </Sequence>
      ) : null}

      {ritagli.map(({ k, i, sotto }) => {
        const len = Math.max(1, f(k.dur));
        return (
          <Sequence key={`k${i}`} from={f(k.at)} durationInFrames={len}>
            {i % 3 === 1 ? <Freccia i={i} sotto={sotto} /> : null}
            <Ritaglio k={k} i={i} len={len} sotto={sotto} />
          </Sequence>
        );
      })}

      {sfx > 0 ? (
        <>
          <Sfx nome="riser" da={0} volume={SFX.riser * sfx} />
          {ritagli.map(({ k, i }) => {
            const nome = k.filled ? 'ui_conferma' : i % 3 === 1 ? 'strappo' : 'ui_in';
            return <Sfx key={`s${i}`} nome={nome} da={f(k.at)} volume={SFX[nome] * sfx} />;
          })}
        </>
      ) : null}
    </AbsoluteFill>
  );
};
