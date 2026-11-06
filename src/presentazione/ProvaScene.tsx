// Prova dello stile Presentazione su 13 s di Test 2 ("…aumentando i dati… ma esplodono. OpenAI… GPT… Generative
// Pre-trained Transformer") più 3 s di "aereo su pista" senza voce, per vedere l'oggetto su percorso.
//   npx remotion render PresentazioneProva out/presentazione-prova.mp4 --scale=0.5
// Voce: public/presentazione-prova/voce.wav (ffmpeg da work/locale/test-2/pulizia/voce-tagliata.wav, 79,6–92,6 s).
import React from 'react';
import { AbsoluteFill, Audio, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { Acronimo, Barre, Barriera, Curva, Griglia, Parola, Percorso, Prompt, Righe } from './scene';

const SCENE: { da: number; a: number; contenuto: React.ReactNode }[] = [
  {
    da: 0, a: 3.1, contenuto: (<>
      <Righe y={300} parole={[
        { w: 'AUMENTANDO', t: 0.63, riga: 0, taglia: 'piccolo' },
        { w: 'I', t: 1.23, riga: 1 }, { w: 'DATI', t: 1.29, riga: 1 },
        { w: 'E', t: 1.59, riga: 2, taglia: 'piccolo' }, { w: 'LE', t: 1.64, riga: 2, taglia: 'piccolo' }, { w: 'DIMENSIONI', t: 1.72, riga: 2, taglia: 'piccolo' },
        { w: 'DEI', t: 2.2, riga: 3 }, { w: 'MODELLI', t: 2.32, riga: 3 },
      ] as Parola[]} />
      <Barre y={1700} gruppi={[{ etichetta: 'DATI', t: 1.29 }, { etichetta: 'MODELLI', t: 2.32 }]} />
    </>),
  },
  {
    da: 3.1, a: 6.55, contenuto: (<>
      <Righe y={300} parole={[
        { w: 'LE', t: 3.04, riga: 0, taglia: 'piccolo' }, { w: 'CAPACITÀ', t: 3.14, riga: 0, taglia: 'piccolo' },
        { w: 'NON', t: 3.68, riga: 1 }, { w: 'CRESCONO', t: 3.84, riga: 1 },
        { w: 'IN', t: 4.24, riga: 2, taglia: 'piccolo' }, { w: 'MODO', t: 4.3, riga: 2, taglia: 'piccolo' }, { w: 'LINEARE,', t: 4.52, riga: 2, taglia: 'piccolo' },
        { w: 'ESPLODONO.', t: 5.7, riga: 3, taglia: 'enorme', accento: true },
      ] as Parola[]} />
      <Curva y={1750} lineare={4.24} esplode={5.7} />
    </>),
  },
  {
    da: 6.55, a: 9.4, contenuto: (<>
      <Righe y={300} parole={[
        { w: 'OPENAI', t: 6.54, riga: 0, taglia: 'enorme' },
        { w: 'INIZIA', t: 7.14, riga: 1, taglia: 'piccolo' }, { w: 'A', t: 7.42, riga: 1, taglia: 'piccolo' }, { w: 'SVILUPPARE', t: 7.46, riga: 1, taglia: 'piccolo' },
        { w: 'LA', t: 8.04, riga: 2, taglia: 'piccolo' }, { w: 'FAMIGLIA', t: 8.14, riga: 2, taglia: 'piccolo' },
      ] as Parola[]} />
      <Prompt y={1750} testo="GPT" t0={8.6} />
    </>),
  },
  {
    da: 9.4, a: 13.15, contenuto: (<>
      <Righe y={300} parole={[{ w: 'ACRONIMO', t: 9.3, riga: 0, taglia: 'piccolo' }, { w: 'DI', t: 9.92, riga: 0, taglia: 'piccolo' }] as Parola[]} />
      <Acronimo y={750} parole={[{ w: 'GENERATIVE', t: 10.12 }, { w: 'PRE-TRAINED', t: 10.96 }, { w: 'TRANSFORMER', t: 11.74 }]} />
    </>),
  },
  {
    da: 13.15, a: 16, contenuto: (<>
      <Righe y={300} parole={[{ w: 'PRONTI', t: 13.3, riga: 0, taglia: 'piccolo' }, { w: 'AL', t: 13.5, riga: 0, taglia: 'piccolo' }, { w: 'DECOLLO.', t: 13.75, riga: 1, taglia: 'enorme' }] as Parola[]} />
      <Percorso y={1200} icona="IconPlane" t0={14.0} />
    </>),
  },
];

export const ProvaScene: React.FC = () => {
  const { fps } = useVideoConfig();
  const t = useCurrentFrame() / fps;
  return (
    <AbsoluteFill>
      <Griglia />
      {SCENE.filter((s) => t >= s.da && t < s.a).map((s, i) => <AbsoluteFill key={i}>{s.contenuto}</AbsoluteFill>)}
      {/* le barre coprono a metà del passaggio da una scena all'altra */}
      {SCENE.slice(1).map((s, i) => <Barriera key={i} t0={s.da - 0.27} />)}
      <Audio src={staticFile('presentazione-prova/voce.wav')} />
    </AbsoluteFill>
  );
};
