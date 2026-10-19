import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { BlueprintFlicker } from './components/BlueprintFlicker';
import { BlueprintFrame } from './components/BlueprintFrame';
import { BlueprintIntroSheet } from './components/BlueprintIntroSheet';
import { BlueprintKeyword } from './components/BlueprintKeyword';
import { BlueprintTitleBlock } from './components/BlueprintTitleBlock';
import { Clips, f, Inserti, Sfx, usaFps, volumeSfx } from './comune';
import { durataTotale, Piano } from './piano';

// Effetti sonori sincronizzati con la grafica, volumi relativi tra loro
const SFX = { riser: 0.75, ui_in: 0.45, ui_conferma: 0.55, glitch: 0.5, strappo: 0.6 } as const;

export const Blueprint: React.FC<Piano> = (piano) => {
  usaFps(piano);
  const totale = f(durataTotale(piano));
  const sfx = volumeSfx(piano);

  return (
    <AbsoluteFill style={{ backgroundColor: '#0B1014' }}>
      <Clips piano={piano} />

      <Inserti piano={piano} sfx={sfx} />

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
          <BlueprintKeyword word={k.word.toUpperCase()} note={k.note} tag={k.tag} filled={k.filled} top={k.top} />
        </Sequence>
      ))}

      {sfx > 0 ? (
        <>
          <Sfx nome="riser" da={0} volume={SFX.riser * sfx} />
          {piano.flickers.map((fl, i) => <Sfx key={`sf${i}`} nome={fl.tear ? 'strappo' : 'glitch'} da={f(fl.at)} volume={SFX[fl.tear ? 'strappo' : 'glitch'] * sfx} />)}
          {piano.keywords.map((k, i) => <Sfx key={`sk${i}`} nome={k.filled ? 'ui_conferma' : 'ui_in'} da={f(k.at)} volume={SFX[k.filled ? 'ui_conferma' : 'ui_in'] * sfx} />)}
        </>
      ) : null}
    </AbsoluteFill>
  );
};
