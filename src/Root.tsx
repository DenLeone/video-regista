import React from 'react';
import { Composition } from 'remotion';
import { Blueprint } from './Blueprint';
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

export const Root: React.FC = () => (
  <Composition
    id="Blueprint"
    component={Blueprint}
    fps={FPS}
    width={W}
    height={H}
    durationInFrames={90}
    defaultProps={esempio}
    calculateMetadata={({ props }) => ({
      durationInFrames: Math.max(30, Math.round(durataTotale(props) * FPS)),
    })}
  />
);
