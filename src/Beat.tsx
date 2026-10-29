import React from 'react';
import { AbsoluteFill, interpolate, OffthreadVideo, random, Sequence, staticFile, useCurrentFrame, Easing } from 'remotion';
import { f, MusicaSotto } from './comune';
import { durataClip, Piano } from './piano';
import { clamp } from './testo';

// Stile Beat (scripts/beat.mjs decide inquadrature, rampe e transizioni sulla griglia del brano).
// Qui solo come si vedono i tagli, tutti SUL colpo (l'inizio della clip è la battuta):
// - frustata: l'inquadratura che finisce scappa di lato mossa, la nuova arriva mossa dall'altro lato
// - zoom: la nuova entra ingrandita e sfocata e si assesta in 6 fotogrammi
// - griglia: la nuova arriva spezzata in 3×3 tessere sfalsate con linee bianche, che si ricompongono
// - carta: la vecchia ruota via come una carta, la nuova ruota dentro
// - scintille: una pioggia di scintille calde dal centro su un colpo forte (una volta)
// Effetti riusabili: TransizioneEntrata / TransizioneUscita / Scintille.

export type TipoTransizione = 'nessuna' | 'frustata' | 'zoom' | 'griglia' | 'carta';

const ENTRA = 6; // fotogrammi d'entrata
const ESCE = 4;  // fotogrammi d'uscita

const Video: React.FC<{ file: string; style?: React.CSSProperties }> = ({ file, style }) => (
  <OffthreadVideo src={staticFile(`media/${file}`)} muted style={{ width: '100%', height: '100%', objectFit: 'cover', ...style }} />
);

// la griglia 3×3: ogni tessera mostra il suo pezzo dell'immagine, spostata e ingrandita a caso, poi torna
const Griglia: React.FC<{ file: string; p: number; seme: string }> = ({ file, p, seme }) => (
  <AbsoluteFill style={{ backgroundColor: '#FFF' }}>
    {Array.from({ length: 9 }, (_, i) => {
      const x = i % 3, y = Math.floor(i / 3);
      const dx = (random(`${seme}x${i}`) - 0.5) * 220 * (1 - p), dy = (random(`${seme}y${i}`) - 0.5) * 320 * (1 - p);
      const s = 1 + (random(`${seme}s${i}`) * 0.35) * (1 - p);
      return (
        <div key={i} style={{ position: 'absolute', left: `${(x * 100) / 3}%`, top: `${(y * 100) / 3}%`, width: `${100 / 3}%`, height: `${100 / 3}%`, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', width: '300%', height: '300%', left: `${-x * 100}%`, top: `${-y * 100}%`, transform: `translate(${dx}px, ${dy}px) scale(${s})` }}>
            <Video file={file} />
          </div>
        </div>
      );
    })}
    {/* linee bianche tra le tessere, con un lampo */}
    {[1, 2].map((k) => <div key={`v${k}`} style={{ position: 'absolute', left: `${(k * 100) / 3}%`, top: 0, bottom: 0, width: 6, marginLeft: -3, backgroundColor: '#FFF', opacity: 1 - p, boxShadow: '0 0 30px #FFF' }} />)}
    {[1, 2].map((k) => <div key={`h${k}`} style={{ position: 'absolute', top: `${(k * 100) / 3}%`, left: 0, right: 0, height: 6, marginTop: -3, backgroundColor: '#FFF', opacity: 1 - p, boxShadow: '0 0 30px #FFF' }} />)}
  </AbsoluteFill>
);

const ClipBeat: React.FC<{ file: string; len: number; entrata: TipoTransizione; uscita: TipoTransizione; seme: string }> = ({ file, len, entrata, uscita, seme }) => {
  const fr = useCurrentFrame();
  const pe = interpolate(fr, [0, ENTRA], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) }); // 0 → 1 all'entrata
  const pu = interpolate(fr, [len - ESCE, len], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) }); // 0 → 1 all'uscita
  if (entrata === 'griglia' && fr < ENTRA + 2) return <Griglia file={file} p={interpolate(fr, [0, ENTRA + 2], [0, 1], clamp)} seme={seme} />;
  let transform = '', blur = 0, lampo = 0;
  if (entrata === 'frustata' && pe < 1) { transform += ` translateX(${(1 - pe) * 260}px) skewX(${(1 - pe) * -8}deg)`; blur += (1 - pe) * 18; }
  if (entrata === 'zoom' && pe < 1) { transform += ` scale(${1 + (1 - pe) * 0.35})`; blur += (1 - pe) * 10; lampo = (1 - pe) * 0.25; }
  if (entrata === 'carta' && pe < 1) transform += ` perspective(1600px) rotateY(${(1 - pe) * -88}deg)`;
  if (uscita === 'frustata' && pu > 0) { transform += ` translateX(${-pu * 300}px) skewX(${pu * 8}deg)`; blur += pu * 20; }
  if (uscita === 'carta' && pu > 0) transform += ` perspective(1600px) rotateY(${pu * 88}deg)`;
  if (uscita === 'zoom' && pu > 0) { transform += ` scale(${1 + pu * 0.12})`; blur += pu * 6; }
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <AbsoluteFill style={{ transform: transform.trim() || undefined, filter: blur > 0.3 ? `blur(${blur.toFixed(1)}px)` : undefined }}>
        <Video file={file} />
      </AbsoluteFill>
      {lampo > 0 ? <AbsoluteFill style={{ backgroundColor: `rgba(255,255,255,${lampo.toFixed(3)})` }} /> : null}
    </AbsoluteFill>
  );
};

// scintille calde che esplodono dal centro e cadono, con un lampo caldo (18 fotogrammi)
export const Scintille: React.FC<{ len?: number; seme?: string }> = ({ len = 22, seme = 's' }) => {
  const fr = useCurrentFrame();
  const p = fr / len;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', mixBlendMode: 'screen' }}>
      <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 45%, rgba(255,150,40,${(0.45 * Math.max(0, 1 - p * 3)).toFixed(3)}) 0%, rgba(0,0,0,0) 55%)` }} />
      {Array.from({ length: 70 }, (_, i) => {
        const ang = random(`${seme}a${i}`) * Math.PI * 2;
        const vel = 500 + random(`${seme}v${i}`) * 900;
        const x = 540 + Math.cos(ang) * vel * p, y = 860 + Math.sin(ang) * vel * p + 900 * p * p;
        const vita = 0.6 + random(`${seme}l${i}`) * 0.4;
        const o = Math.max(0, 1 - p / vita);
        const lungo = 10 + 30 * (1 - p);
        return <div key={i} style={{ position: 'absolute', left: x, top: y, width: lungo, height: 4, borderRadius: 2, opacity: o,
          transform: `rotate(${(ang * 180) / Math.PI}deg)`, background: 'linear-gradient(90deg, rgba(255,255,255,0), #FFE2A0, #FF8A1E)', boxShadow: '0 0 12px #FF8A1E' }} />;
      })}
    </AbsoluteFill>
  );
};

export const Beat: React.FC<{ piano: Piano }> = ({ piano }) => {
  let t = 0;
  const tratti = piano.clips.map((c) => { const da = t; const len = Math.max(1, f(durataClip(c))); t += len; return { c, da, len }; });
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {tratti.map(({ c, da, len }, i) => (
        <Sequence key={i} from={da} durationInFrames={len}>
          <ClipBeat file={c.file} len={len} entrata={(c.transizione as TipoTransizione) || 'nessuna'}
            uscita={(tratti[i + 1]?.c.transizione as TipoTransizione) || 'nessuna'} seme={`c${i}`} />
        </Sequence>
      ))}
      {piano.beat?.scintille != null ? (
        <Sequence from={f(piano.beat.scintille)} durationInFrames={22}><Scintille /></Sequence>
      ) : null}
      <MusicaSotto piano={piano} />
    </AbsoluteFill>
  );
};
