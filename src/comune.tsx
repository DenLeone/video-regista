import React from 'react';
import { AbsoluteFill, Audio, OffthreadVideo, Sequence, staticFile } from 'remotion';
import { Clip, durataClip, FPS, Piano } from './piano';

// Pezzi comuni a tutti gli stili: le clip con la voce, gli effetti sonori.

export const f = (s: number) => Math.round(s * FPS);

// micro dissolvenza (2 fotogrammi) a inizio e fine: niente "click" sui tagli
export const sfuma = (len: number, base = 1) => (fr: number) => base * Math.max(0, Math.min(1, (fr + 1) / 2, (len - fr) / 2));

// Una clip a tutto schermo. Le clip orizzontali vanno "contenute" sopra
// una copia sfocata di sé stesse, così non si perde metà inquadratura.
// `filtro`: correzione colore CSS dello stile (es. look caldo del Cinematico).
export const ClipView: React.FC<{ clip: Clip; len: number; fondo?: string; filtro?: string }> = ({ clip, len, fondo = '#0B1014', filtro }) => {
  const src = staticFile(`media/${clip.file}`);
  const startFrom = f(clip.start);
  const endAt = startFrom + len;
  const scale = clip.punch ? 1.18 : 1;
  // clip in bianco e nero (stili su misura): si aggiunge al filtro dello stile
  if (clip.bn) filtro = `${filtro ?? ''} grayscale(1) contrast(1.06)`.trim();
  const mutaImmagine = Boolean(clip.audio || clip.muto);
  const voce = clip.audio ? (
    <Audio src={staticFile(`media/${clip.audio.file}`)} startFrom={f(clip.audio.start)} endAt={f(clip.audio.start) + len} volume={sfuma(len)} />
  ) : null;
  const volume = sfuma(len, clip.volume ?? 1);
  if (clip.orient === 'h') {
    return (
      <AbsoluteFill style={{ backgroundColor: fondo }}>
        <OffthreadVideo src={src} startFrom={startFrom} endAt={endAt} muted
          style={{ width: '100%', height: '100%', objectFit: 'cover', filter: `blur(40px) brightness(0.55)${filtro ? ` ${filtro}` : ''}`, transform: 'scale(1.15)' }} />
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
          <OffthreadVideo src={src} startFrom={startFrom} endAt={endAt} muted={mutaImmagine} volume={volume}
            style={{ width: '100%', objectFit: 'contain', transform: `scale(${scale})`, filter: filtro }} />
        </AbsoluteFill>
        {voce}
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{ backgroundColor: fondo }}>
      <OffthreadVideo src={src} startFrom={startFrom} endAt={endAt} muted={mutaImmagine} volume={volume}
        style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${scale})`, filter: filtro }} />
      {voce}
    </AbsoluteFill>
  );
};

// tutte le clip una dopo l'altra sulla timeline
export const Clips: React.FC<{ piano: Piano; fondo?: string; filtro?: string }> = ({ piano, fondo, filtro }) => {
  let cursor = 0;
  return (
    <>
      {piano.clips.map((c, i) => {
        const from = cursor;
        const len = Math.max(1, f(durataClip(c)));
        cursor += f(durataClip(c));
        return (
          <Sequence key={`c${i}`} from={from} durationInFrames={len}>
            <ClipView clip={c} len={len} fondo={fondo} filtro={filtro} />
          </Sequence>
        );
      })}
    </>
  );
};

// volume base degli effetti, calcolato dal montaggio in base al livello della voce
export const volumeSfx = (piano: Piano) => (piano.sfx === false ? 0 : Math.max(0, Math.min(1, piano.sfx?.volume ?? 0.25)));

// un effetto sonoro (public/sfx, generati da scripts/genera-sfx.mjs) a partire dal fotogramma `da`
export const Sfx: React.FC<{ nome: string; da: number; volume: number }> = ({ nome, da, volume }) => (
  <Sequence from={Math.max(0, da)} durationInFrames={FPS * 2} layout="none">
    <Audio src={staticFile(`sfx/${nome}.wav`)} volume={volume} />
  </Sequence>
);
