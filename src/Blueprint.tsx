import React from 'react';
import { AbsoluteFill, Audio, OffthreadVideo, Sequence, staticFile } from 'remotion';
import { BlueprintFlicker } from './components/BlueprintFlicker';
import { BlueprintFrame } from './components/BlueprintFrame';
import { BlueprintIntroSheet } from './components/BlueprintIntroSheet';
import { BlueprintKeyword } from './components/BlueprintKeyword';
import { BlueprintTitleBlock } from './components/BlueprintTitleBlock';
import { Clip, durataClip, durataTotale, FPS, Piano } from './piano';

const f = (s: number) => Math.round(s * FPS);

// Una clip a tutto schermo. Le clip orizzontali vanno "contenute" sopra
// una copia sfocata di sé stesse, così non si perde metà inquadratura.
// micro dissolvenza (2 fotogrammi) a inizio e fine: niente "click" sui tagli
const sfuma = (len: number, base = 1) => (fr: number) => base * Math.max(0, Math.min(1, (fr + 1) / 2, (len - fr) / 2));

const ClipView: React.FC<{ clip: Clip; len: number }> = ({ clip, len }) => {
  const src = staticFile(`media/${clip.file}`);
  const startFrom = f(clip.start);
  const endAt = startFrom + len;
  const scale = clip.punch ? 1.18 : 1;
  const mutaImmagine = Boolean(clip.audio || clip.muto);
  const voce = clip.audio ? (
    <Audio src={staticFile(`media/${clip.audio.file}`)} startFrom={f(clip.audio.start)} endAt={f(clip.audio.start) + len} volume={sfuma(len)} />
  ) : null;
  const volume = sfuma(len, clip.volume ?? 1);
  if (clip.orient === 'h') {
    return (
      <AbsoluteFill style={{ backgroundColor: '#0B1014' }}>
        <OffthreadVideo src={src} startFrom={startFrom} endAt={endAt} muted
          style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(40px) brightness(0.55)', transform: 'scale(1.15)' }} />
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
          <OffthreadVideo src={src} startFrom={startFrom} endAt={endAt} muted={mutaImmagine} volume={volume}
            style={{ width: '100%', objectFit: 'contain', transform: `scale(${scale})` }} />
        </AbsoluteFill>
        {voce}
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{ backgroundColor: '#0B1014' }}>
      <OffthreadVideo src={src} startFrom={startFrom} endAt={endAt} muted={mutaImmagine} volume={volume}
        style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${scale})` }} />
      {voce}
    </AbsoluteFill>
  );
};

export const Blueprint: React.FC<Piano> = (piano) => {
  const totale = f(durataTotale(piano));
  let cursor = 0;
  const clips = piano.clips.map((c, i) => {
    const from = cursor;
    const len = f(durataClip(c));
    cursor += len;
    return (
      <Sequence key={`c${i}`} from={from} durationInFrames={Math.max(1, len)}>
        <ClipView clip={c} len={Math.max(1, len)} />
      </Sequence>
    );
  });

  return (
    <AbsoluteFill style={{ backgroundColor: '#0B1014' }}>
      {clips}

      <Sequence from={0} durationInFrames={15}>
        <BlueprintIntroSheet label={`${piano.tavola} — ${piano.soggetto}`} />
      </Sequence>

      {piano.flickers.map((fl, i) => (
        <Sequence key={`f${i}`} from={Math.max(0, f(fl.at))} durationInFrames={11}>
          <BlueprintFlicker seed={fl.seed} tear={fl.tear} />
        </Sequence>
      ))}

      {piano.sponsor ? (
        <Sequence from={f(piano.sponsorAt ?? 0)} durationInFrames={Math.max(1, totale - f(piano.sponsorAt ?? 0))}>
          <BlueprintTitleBlock material={piano.sponsor.material} test={piano.sponsor.test} />
        </Sequence>
      ) : null}

      <Sequence from={0} durationInFrames={Math.max(1, totale)}>
        <BlueprintFrame sheet={`${piano.tavola} · SCALA 1:1`} />
      </Sequence>

      {piano.keywords.map((k, i) => (
        <Sequence key={`k${i}`} from={f(k.at)} durationInFrames={Math.max(1, f(k.dur))}>
          <BlueprintKeyword word={k.word} note={k.note} tag={k.tag} filled={k.filled} top={k.top} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
