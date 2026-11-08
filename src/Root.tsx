import React from 'react';
import { Composition, Still } from 'remotion';
import { Blueprint } from './Blueprint';
import { Cinematico } from './Cinematico';
import { Collage, durataCollage, PropsCollage } from './Collage';
import { Copertina, PropsCopertina } from './Copertina';
import { DocNintendo, DURATA_DOC } from './DocNintendo';
import { PropsRotolo, Rotolo } from './Rotolo';
import { MotionCollage } from './MotionCollage';
import { ListaUI, Pezzo } from './ListaUI';
import { SuMisura } from './SuMisura';
import { ProvaFont } from './presentazione/ProvaFont';
import { ProvaScene } from './presentazione/ProvaScene';
import { Presentazione, PropsPresentazione } from './presentazione/Presentazione';
import { Unboxing, PropsUnboxing } from './unboxing/Unboxing';
import { Documentario } from './documentario/Documentario';
import { Redazione, type PropsRedazione } from './redazione/Redazione';
import type { PropsDocumentario } from './documentario/tipi';
import { Racconto } from './racconto/Racconto';
import { Racconto as PropsRacconto } from './racconto/tipi';
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
    <Still id="PresentazioneFont" component={ProvaFont} width={2160} height={3840} />
    <Composition id="PresentazioneProva" component={ProvaScene} fps={30} width={2160} height={3840} durationInFrames={480} />
    {/* stile Presentazione del flusso locale: livello trasparente sopra il video vero (pc/locale/presentazione.mjs) */}
    <Composition id="Presentazione" component={Presentazione} fps={30} width={2160} height={3840} durationInFrames={300}
      defaultProps={{ durata: 10, cartella: "presentazione/esempio", scene: [] } as PropsPresentazione}
      calculateMetadata={({ props }) => ({ fps: props.fps ?? 30, durationInFrames: Math.max(1, Math.round(props.durata * (props.fps ?? 30))) })} />
    {/* stile Redazione: grafica trasparente sopra un video di opinione su un fatto di cronaca (pc/locale/redazione.mjs) */}
    <Composition id="Redazione" component={Redazione} fps={30} width={2160} height={3840} durationInFrames={300}
      defaultProps={{ durata: 10, cartella: 'redazione/esempio', elementi: [] } as PropsRedazione}
      calculateMetadata={({ props }) => ({ fps: props.fps ?? 30, durationInFrames: Math.max(1, Math.round(props.durata * (props.fps ?? 30))) })} />
    {/* stile Documentario del flusso locale: piano sequenza verticale con Denis dentro il mondo (pc/locale/doc-mondo.mjs) */}
    <Composition id="Documentario" component={Documentario} fps={30} width={1080} height={1920} durationInFrames={300}
      defaultProps={{ durata: 10, vista: 1600, mondo: { w: 4000, h: 4000, tema: 'archivio' }, camera: [{ t: 0, x: 2000, y: 2000, zoom: 1 }], oggetti: [], eventi: [] } as PropsDocumentario}
      calculateMetadata={({ props }) => ({ fps: props.fps ?? 30, durationInFrames: Math.max(1, Math.round(props.durata * (props.fps ?? 30))) })} />
    {/* stile Unboxing del flusso locale: titolo, schede e chiusura sopra le riprese del prodotto (pc/locale/unboxing.mjs) */}
    <Composition id="Unboxing" component={Unboxing} fps={30} width={2160} height={3840} durationInFrames={300}
      defaultProps={{ durata: 10, cartella: "unboxing/esempio", titolo: "Prodotto", schede: [] } as PropsUnboxing}
      calculateMetadata={({ props }) => ({ fps: props.fps ?? 30, durationInFrames: Math.max(1, Math.round(props.durata * (props.fps ?? 30))) })} />
    <Composition id="Blueprint" component={Blueprint} fps={FPS} width={W} height={H}
      durationInFrames={90} defaultProps={esempio} calculateMetadata={metadati} />
    <Composition id="Cinematico" component={Cinematico} fps={FPS} width={W} height={H}
      durationInFrames={90} calculateMetadata={metadati}
      defaultProps={{ ...esempio, keywords: [{ at: 0.4, dur: 2.5, word: 'ROG ALLY X', tag: 'ASUS', note: '20 anniversario' }] }} />
    <Composition id="MotionCollage" component={MotionCollage} fps={FPS} width={W} height={H}
      durationInFrames={90} calculateMetadata={metadati} defaultProps={esempio} />
    <Composition id="ListaUI" component={ListaUI} fps={FPS} width={W} height={H}
      durationInFrames={90} calculateMetadata={metadati} defaultProps={esempio} />
    {/* Racconto: piano sequenza cinematografico 21:9 disegnato col codice (src/racconto, props in work/racconto) */}
    <Composition id="Racconto" component={Racconto} fps={30} width={3840} height={1646} durationInFrames={300}
      calculateMetadata={({ props }: { props: PropsRacconto }) => ({ durationInFrames: Math.max(30, Math.round(props.durata * 30)) })}
      defaultProps={{ durata: 10, mondo: { w: 4000, h: 3000 }, camera: [{ t: 0, x: 2000, y: 1500, zoom: 1 }, { t: 10, x: 2100, y: 1500, zoom: 1.1 }], oggetti: [], eventi: [] } as PropsRacconto} />
    {/* un contenitore di Lista UI da solo (campionario per DaVinci, pc/campionario.mjs) */}
    <Composition id="Pezzo" component={Pezzo} fps={30} width={W} height={H} durationInFrames={90}
      calculateMetadata={({ props }) => ({ durationInFrames: Math.max(15, Math.round(props.durata * 30)) })}
      defaultProps={{ s: { at: 0, dur: 3, tipo: 'capitolo' as const, numero: 1, titolo: 'Contesto' }, durata: 3 }} />
    {/* stili creati da Drive: la grafica arriva in props.grafica (scripts/stile-su-misura.mjs) */}
    <Composition id="SuMisura" component={SuMisura} fps={FPS} width={W} height={H}
      durationInFrames={90} calculateMetadata={metadati} defaultProps={esempio} />
    {/* motion graphic a ritagli in 4K verticale: tutto in scena.json (pc/collage.mjs) */}
    <Composition id="Collage" component={Collage} fps={30} width={2160} height={3840} durationInFrames={300}
      defaultProps={{ cartella: 'collage/esempio', scene: [] } as PropsCollage}
      calculateMetadata={({ props }) => ({ fps: props.fps ?? 30, durationInFrames: Math.max(1, Math.round(durataCollage(props) * (props.fps ?? 30))) })} />
    {/* documentario a piano sequenza (prova Nintendo): tutto in src/DocNintendo.tsx */}
    <Composition id="DocNintendo" component={DocNintendo} fps={30} width={2160} height={3840} durationInFrames={Math.round(DURATA_DOC * 30)} />
    {/* Rotolo: documentario a piano sequenza descritto da beats.json (pc/rotolo/LEGGIMI.md) */}
    <Composition id="Rotolo" component={Rotolo} fps={30} width={2160} height={3840} durationInFrames={300}
      defaultProps={{ titolo: 'Esempio', cartella: 'collage/doc-nintendo', voce: 'vo.wav', durata: 10, beats: [{ t: 0.5, elementi: [{ tipo: 'anno', testo: '1889' }] }] } as PropsRotolo}
      calculateMetadata={({ props }) => ({ fps: props.fps ?? 30, durationInFrames: Math.max(1, Math.round(props.durata * (props.fps ?? 30))) })} />
    {/* copertina per Reel e TikTok: props da scripts/regista.mjs (copertina) */}
    <Still id="Copertina" component={Copertina} width={W} height={H}
      defaultProps={{ sfondo: 'media/copertina-sfondo.jpg', testo: 'Titolo di prova', evidenzia: ['prova'], grafica: null } as PropsCopertina} />
  </>
);
