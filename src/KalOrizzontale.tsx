import React from 'react';
import { AbsoluteFill, Easing, Img, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { loadFont as loadAnton } from '@remotion/google-fonts/Anton';
import { loadFont as loadMarker } from '@remotion/google-fonts/PermanentMarker';
import { loadFont as loadMontserrat } from '@remotion/google-fonts/Montserrat';
import { Clips, f, MusicaSotto, Sfx, usaFps, volumeSfx } from './comune';
import { Clip, durataClip, Keyword, Piano } from './piano';
import { dentro } from './testo';
import { gruppiKal, Tappetino } from './Kal';

// Stile "Kal Orizzontale" (Denis, 23/11: il primo video orizzontale per TikTok): Kal in 16:9, 1920x1080.
// Stessa grafica di Kal: parola grande Tiffany in alto con la scritta blu a mano, sottotitoli bianchi piccoli in basso,
// B-roll in un riquadro FISSO sul tappetino verde. Il riquadro prende la forma del B-roll: stretto per i verticali
// (Insta360), largo per gli orizzontali (Sony). Le zone di zone.json sono del verticale: qui un margine del 5%.

const { fontFamily: ANTON } = loadAnton('normal', { weights: ['400'], subsets: ['latin'] });
const { fontFamily: MARKER } = loadMarker('normal', { weights: ['400'], subsets: ['latin'] });
const { fontFamily: MONTSERRAT } = loadMontserrat('normal', { weights: ['600', '700'], subsets: ['latin'] });
const TIFFANY = '#81D8D0';
const BLU = '#1F4FE0';
const OMBRA = '0 4px 18px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.6)';
const OMBRA_SOTTO = '0 0 2px rgba(0,0,0,0.75), 0 2px 8px rgba(0,0,0,0.55)';
const L = 1920;
const MARGINE = 96; // 5% del lato lungo
const LARGO_TESTO = L - 2 * 160;
const Y_SOTTOTITOLI = 950;
const TOP_PAROLA = 50;
// riquadro dei B-roll: sotto la parola grande, fino al margine basso
const R_TOP = 215;
const R_H = 1080 - MARGINE / 2 - R_TOP;
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

const Sottotitolo: React.FC<{ testo: string; len: number }> = ({ testo, len }) => {
  const fr = useCurrentFrame();
  const v = Math.min(interpolate(fr, [0, 3], [0, 1], clamp), interpolate(fr, [len - 2, len], [1, 0], clamp));
  const fs = dentro(testo, { famiglia: MONTSERRAT, peso: 600 }, 50, 1300);
  return (
    <div style={{ position: 'absolute', top: Y_SOTTOTITOLI - fs * 0.6, left: MARGINE, right: MARGINE, textAlign: 'center',
      fontFamily: MONTSERRAT, fontWeight: 600, fontSize: fs, lineHeight: 1.2, color: '#FFFFFF', textShadow: OMBRA_SOTTO, opacity: v }}>
      {testo}
    </div>
  );
};

// una riga sola: nel 16:9 c'è spazio in larghezza, non in altezza (sopra un B-roll più piccola, deve stare sopra il riquadro)
const Parola: React.FC<{ k: Keyword; len: number; sopraRiquadro: boolean }> = ({ k, len, sopraRiquadro }) => {
  const fr = useCurrentFrame();
  const entra = interpolate(fr, [0, 6], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.6)) });
  const esce = interpolate(fr, [len - 5, len], [1, 0], clamp);
  const parola = k.word.toUpperCase();
  const massimo = sopraRiquadro ? (k.tag ? 105 : 140) : 190;
  const fs = Math.min(massimo, dentro(parola, { famiglia: ANTON, peso: 400 }, massimo, LARGO_TESTO));
  const mano = (k.note || '').replace(/^\/\/\s*/, '').trim();
  const scrive = interpolate(fr, [4, 14], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  return (
    <AbsoluteFill style={{ opacity: esce }}>
      <div style={{ position: 'absolute', top: TOP_PAROLA, left: MARGINE, right: MARGINE, textAlign: 'center' }}>
        {k.tag ? <div style={{ fontFamily: ANTON, fontSize: 44, color: '#FFFFFF', letterSpacing: '0.02em', textShadow: OMBRA, opacity: entra }}>{k.tag.toUpperCase()}</div> : null}
        <div style={{ fontFamily: ANTON, fontSize: fs, lineHeight: 0.95, color: TIFFANY, letterSpacing: '0.01em', textShadow: OMBRA,
          transform: `scale(${0.7 + 0.3 * entra})`, opacity: Math.min(1, entra * 1.5) }}>{parola}</div>
        {mano ? (
          <div style={{ position: 'relative', marginTop: -fs * 0.42, fontFamily: MARKER, fontSize: Math.min(96, fs * 0.62), color: BLU, lineHeight: 1,
            transform: 'rotate(-6deg)', textShadow: '0 3px 10px rgba(0,0,0,0.45)', clipPath: `inset(0 ${(1 - scrive) * 100}% 0 0)` }}>{mano}</div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

// forma del riquadro: quella del B-roll (ar dell'immagine, o 16:9 / 9:16 dall'orientamento), sempre alto R_H e centrato
export function riquadroOrizzontale(clip: Clip): { left: number; top: number; width: number; height: number } {
  const ins = clip.inserto;
  const ar = ins?.ar ?? ((ins?.orient ?? clip.orient) === 'h' ? 16 / 9 : 9 / 16);
  const width = Math.round(Math.min(L - 2 * MARGINE, R_H * ar));
  const height = Math.round(Math.min(R_H, width / ar));
  return { left: Math.round((L - width) / 2), top: R_TOP + Math.round((R_H - height) / 2), width, height };
}

const Riquadro: React.FC<{ clip: Clip; len: number }> = ({ clip, len }) => {
  const fr = useCurrentFrame();
  const entra = interpolate(fr, [0, 8], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const ins = clip.inserto;
  const r = riquadroOrizzontale(clip);
  return (
    <AbsoluteFill>
      <Tappetino larghezza={L} />
      <div style={{ position: 'absolute', ...r, borderRadius: 30, overflow: 'hidden',
        backgroundColor: '#0d0d0d', boxShadow: '0 30px 70px rgba(0,0,0,0.55), 0 6px 18px rgba(0,0,0,0.4)',
        transform: `translateY(${(1 - entra) * 50}px) scale(${0.94 + 0.06 * entra})`, opacity: entra }}>
        {ins?.tipo === 'immagine'
          ? <Img src={staticFile(`media/${ins.file}`)} style={{ width: '100%', height: '100%', objectFit: 'contain', backgroundColor: '#111' }} />
          : ins
          ? <OffthreadVideo src={staticFile(`media/${ins.file}`)} startFrom={f(ins.start || 0)} endAt={f(ins.start || 0) + len} muted
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <OffthreadVideo src={staticFile(`media/${clip.file}`)} startFrom={f(clip.start)} endAt={f(clip.start) + len} muted
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
      </div>
    </AbsoluteFill>
  );
};

export const KalOrizzontale: React.FC<Piano> = (piano) => {
  usaFps(piano);
  const sfx = volumeSfx(piano);
  const titoli = piano.keywords;
  const gruppi = gruppiKal(piano.parole, titoli);
  let t = 0;
  const riquadri = piano.clips.map((c) => { const da = t; const len = Math.max(1, f(durataClip(c))); t += f(durataClip(c)); return { c, da, len }; })
    .filter(({ c }) => c.broll || c.inserto);

  return (
    <AbsoluteFill style={{ backgroundColor: '#0A0A0A' }}>
      {/* il girato (la voce passa sempre da qui); i B-roll e le immagini ci vanno sopra nel riquadro.
          Niente icone sopra la testa: le loro coordinate sono del verticale */}
      <Clips piano={{ ...piano, clips: piano.clips.map((c) => (c.inserto ? { ...c, inserto: undefined } : c)) }} fondo="#0A0A0A" />
      {riquadri.map(({ c, da, len }, i) => (
        <Sequence key={`r${i}`} from={da} durationInFrames={len}>
          <Riquadro clip={c} len={len} />
        </Sequence>
      ))}
      <MusicaSotto piano={piano} />
      {gruppi.map((g, i) => (
        <Sequence key={`s${i}`} from={f(g.at)} durationInFrames={Math.max(2, f(g.fine) - f(g.at))}>
          <Sottotitolo testo={g.testo} len={Math.max(2, f(g.fine) - f(g.at))} />
        </Sequence>
      ))}
      {titoli.map((k, i) => (
        <Sequence key={`k${i}`} from={f(k.at)} durationInFrames={Math.max(1, f(k.dur))}>
          <Parola k={k} len={Math.max(1, f(k.dur))} sopraRiquadro={riquadri.some(({ da, len }) => f(k.at) < da + len && f(k.at + k.dur) > da)} />
        </Sequence>
      ))}
      {sfx > 0 ? titoli.map((k, i) => <Sfx key={`w${i}`} nome="whoosh" da={f(k.at) - 5} volume={0.45 * sfx} />) : null}
    </AbsoluteFill>
  );
};
