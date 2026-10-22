import React from 'react';
import { Composition, Still } from 'remotion';
import { Blueprint } from './Blueprint';
import { Cinematico } from './Cinematico';
import { Copertina, PropsCopertina } from './Copertina';
import { SuMisura } from './SuMisura';
import { durataTotale, FPS, fpsDi, H, Piano, W } from './piano';

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
// fps del piano (camera principale): il girato a 24p resta fluido invece di ripetere fotogrammi
const metadati = ({ props }: { props: Piano }) => ({
  fps: fpsDi(props),
  durationInFrames: Math.max(30, Math.round(durataTotale(props) * fpsDi(props))),
});

export const Root: React.FC = () => (
  <>
    <Composition id="Blueprint" component={Blueprint} fps={FPS} width={W} height={H}
      durationInFrames={90} defaultProps={esempio} calculateMetadata={metadati} />
    <Composition id="Cinematico" component={Cinematico} fps={FPS} width={W} height={H}
      durationInFrames={90} calculateMetadata={metadati}
      defaultProps={{ ...esempio, keywords: [{ at: 0.4, dur: 2.5, word: 'ROG ALLY X', tag: 'ASUS', note: '20 anniversario' }] }} />
    {/* stili creati da Drive: la grafica arriva in props.grafica (scripts/stile-su-misura.mjs) */}
    <Composition id="SuMisura" component={SuMisura} fps={FPS} width={W} height={H}
      durationInFrames={90} calculateMetadata={metadati} defaultProps={esempio} />
    {/* copertina per Reel e TikTok: props da scripts/regista.mjs (copertina) */}
    <Still id="Copertina" component={Copertina} width={W} height={H}
      defaultProps={{ sfondo: 'media/copertina-sfondo.jpg', testo: 'Titolo di prova', evidenzia: ['prova'], grafica: null } as PropsCopertina} />
  </>
);
