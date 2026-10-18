import React from 'react';
import { Composition } from 'remotion';
import { Blueprint } from './Blueprint';
import { Cinematico } from './Cinematico';
import { durataTotale, FPS, H, Piano, W } from './piano';

// Piano di esempio per lo Studio: il render vero riceve --props=work/piano.json
const esempio: Piano = {
  titolo: 'Esempio',
  tavola: 'TAV. TEST',
  soggetto: 'SOGGETTO',
  clips: [],
  keywords: [{ at: 0.6, dur: 2, word: 'BLUEPRINT', note: '// stile firma', tag: 'A-01' }],
  flickers: [],
  sponsor: null,
};

// ogni stile è una composizione con lo stesso piano (vedi STILI in scripts/regista.mjs)
const metadati = ({ props }: { props: Piano }) => ({
  durationInFrames: Math.max(30, Math.round(durataTotale(props) * FPS)),
});

export const Root: React.FC = () => (
  <>
    <Composition id="Blueprint" component={Blueprint} fps={FPS} width={W} height={H}
      durationInFrames={90} defaultProps={esempio} calculateMetadata={metadati} />
    <Composition id="Cinematico" component={Cinematico} fps={FPS} width={W} height={H}
      durationInFrames={90} calculateMetadata={metadati}
      defaultProps={{ ...esempio, keywords: [{ at: 0.4, dur: 2.5, word: 'ROG ALLY X', tag: 'ASUS', note: '20 anniversario' }] }} />
  </>
);
