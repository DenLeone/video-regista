// Stile Presentazione per il flusso locale: livello grafico trasparente sopra il video vero in DaVinci.
// Il pannello Tiffany sta in alto (metà schermo quando il presentatore è a metà, sparisce quando è a tutto schermo);
// sotto è trasparente e lì DaVinci mette il video del presentatore (stessa geometria: lastra() di src/rotolo/impagina.ts).
// Props da pc/locale/presentazione.mjs (presentazione.json): scene con le parole del parlato e una grafica ciascuna.
//   npx remotion render src/index.ts Presentazione grafica.mov --props=presentazione.json --codec=prores --prores-profile=4444 --pixel-format=yuva444p10le --image-format=png --scale=0.5
import React from 'react';
import { AbsoluteFill, Audio, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { geometriaLastra, lastra, trattiLastra, type Documento, type Presentatore } from '../rotolo/impagina';
import { COLORI, FONT } from './tema';
import { Acronimo, altezzaRighe, Barre, Barriera, Curva, Foto, Griglia, IconaGrande, Numero, Onda, Parola, Percorso, Prompt, Righe } from './scene';

export type Grafica =
  | { tipo: 'barre'; gruppi: { etichetta: string; t: number }[] }
  | { tipo: 'curva'; lineare: number; esplode: number }
  | { tipo: 'onda'; t0: number }
  | { tipo: 'percorso'; icona: string; t0: number }
  | { tipo: 'prompt'; testo: string; t0: number }
  | { tipo: 'acronimo'; parole: { w: string; t: number }[] }
  | { tipo: 'numero'; valore: number; suffisso?: string; t0: number }
  | { tipo: 'icona'; icona: string; t0: number; etichetta?: string }
  | { tipo: 'foto'; file: string; t0: number; etichetta?: string };
// modo: lui (a tutto schermo: niente pannello, solo la parola singola), diviso (immagine sopra, lui sotto),
// tiffany (grafica a tutto schermo, lui nascosto)
export type Scena = { da: number; a: number; modo?: 'lui' | 'diviso' | 'tiffany'; parole: Parola[]; grafica?: Grafica; barriera?: boolean };
export type PropsPresentazione = {
  durata: number; fps?: number; cartella: string; scene: Scena[];
  parole?: { w: string; s: number; e: number }[]; // la parola singola quando si vede lui
  // anteprima senza DaVinci: il video vero sotto la grafica (stessa geometria di lastra.mjs), pezzi di tagli.json
  anteprima?: { video: string; voce?: string; tieni: { da: number; a: number }[] };
  lastra?: Pick<Documento, 'presentatore' | 'beats' | 'durata'>; // modi del presentatore (beats.json)
};

const PH = 1920;          // altezza del pannello con il presentatore a metà: le scene sono impaginate per questa
const TESTO_Y = 110;
const SCALA_TESTO = 0.82;
const MAX_TESTO = 760;
// altezza naturale di ogni grafica (px a 2160 di larghezza): si rimpicciolisce se lo spazio sotto il testo è meno
const NATURALE: Record<Grafica['tipo'], number> = { barre: 1260, curva: 1250, onda: 700, percorso: 1100, prompt: 560, acronimo: 1290, numero: 620, icona: 900, foto: 0 };

const Grafico: React.FC<{ g: Grafica; cartella: string; spazio: number }> = ({ g, cartella, spazio }) => {
  switch (g.tipo) {
    case 'barre': return <Barre y={0} gruppi={g.gruppi} />;
    case 'curva': return <Curva y={0} lineare={g.lineare} esplode={g.esplode} />;
    case 'onda': return <Onda y={0} t0={g.t0} />;
    case 'percorso': return <Percorso y={-150} icona={g.icona} t0={g.t0} decolla={g.icona === 'IconPlane' || g.icona === 'IconRocket'} />;
    case 'prompt': return <Prompt y={0} testo={g.testo} t0={g.t0} />;
    case 'acronimo': return <Acronimo y={0} parole={g.parole} />;
    case 'numero': return <Numero y={0} valore={g.valore} suffisso={g.suffisso} t0={g.t0} />;
    case 'icona': return <IconaGrande y={0} icona={g.icona} t0={g.t0} etichetta={g.etichetta} />;
    case 'foto': return <Foto y={0} h={spazio} file={`${cartella}/${g.file}`} t0={g.t0} etichetta={g.etichetta} />;
  }
};

// impaginazione per modo: la grafica piena usa tutto lo schermo, il diviso la metà alta
const layout = (s: Scena) => (s.modo === 'tiffany' ? { ph: 3840, testoY: 300, scalaTesto: 1, maxTesto: 1500 } : { ph: PH, testoY: TESTO_Y, scalaTesto: SCALA_TESTO, maxTesto: MAX_TESTO });

const Contenuto: React.FC<{ s: Scena; cartella: string }> = ({ s, cartella }) => {
  const { ph, testoY, scalaTesto, maxTesto } = layout(s);
  if (s.modo === 'diviso' && s.grafica?.tipo === 'foto') {
    // immagine grande nella metà alta, senza testo (le parole le dice lui, sotto)
    return <div style={{ position: 'absolute', left: 0, top: 110, width: 2160 }}><Foto y={0} h={ph - 220} file={`${cartella}/${s.grafica.file}`} t0={s.grafica.t0} etichetta={s.grafica.etichetta} /></div>;
  }
  // il testo occupa al massimo una parte del pannello: con tante righe si rimpicciolisce e la grafica resta grande
  const h0 = s.parole.length ? altezzaRighe(s.parole, scalaTesto) : 0;
  // solo testo: più grande e al centro (il testo è la grafica)
  const scala = s.grafica ? (h0 > maxTesto ? scalaTesto * maxTesto / h0 : scalaTesto) : scalaTesto * Math.min(1.35, (ph - 400) / Math.max(1, h0));
  const hT = s.parole.length ? altezzaRighe(s.parole, scala) : 0;
  const yT = s.grafica ? testoY : Math.max(testoY, (ph - hT) / 2 - 40);
  const y0 = yT + hT + (hT ? 90 : 0);
  const spazio = ph - (s.modo === 'tiffany' ? 300 : 90) - y0;
  const g = s.grafica;
  const nat = g ? NATURALE[g.tipo] : 0;
  const k = nat ? Math.min(s.modo === 'tiffany' ? 1.25 : 1, spazio / nat) : 1;
  return (
    <>
      {s.parole.length > 0 && <Righe y={yT} parole={s.parole} scala={scala} />}
      {g && (g.tipo === 'foto'
        ? <div style={{ position: 'absolute', left: 0, top: y0, width: 2160 }}><Grafico g={g} cartella={cartella} spazio={spazio} /></div>
        : <div style={{ position: 'absolute', left: (2160 - 2160 * k) / 2, top: y0 + (spazio - nat * k) / 2, width: 2160, height: nat, transform: `scale(${k})`, transformOrigin: '0 0' }}>
          <Grafico g={g} cartella={cartella} spazio={spazio} />
        </div>)}
    </>
  );
};

// grandezza del viso (frazione dell'altezza del video) al secondo t: il punto più vicino di viso.py
const visoS = (pres: Presentatore, t: number) => {
  const v = pres.viso as { t: number; s?: number }[] | undefined;
  if (!v?.length) return 0.22;
  let b = v[0];
  for (const x of v) if (Math.abs(x.t - t) < Math.abs(b.t - t)) b = x; else if (x.t > t) break;
  return b.s ?? 0.22;
};

// una parola alla volta, bianca, sotto il mento (come il reel): solo quando si vede lui
const ParolaSingola: React.FC<{ parole: { w: string; s: number; e: number }[]; t: number; pres: Presentatore; pl: number; hP: number }> = ({ parole, t, pres, pl, hP }) => {
  let i = -1;
  for (let k = 0; k < parole.length && parole[k].s <= t; k++) i = k;
  if (i < 0) return null;
  const w = parole[i], dopo = parole[i + 1];
  const fine = dopo && dopo.s - w.e < 0.5 ? dopo.s : w.e + 0.25;
  if (t >= fine) return null;
  const H = 3840;
  const { alta, top, vh } = geometriaLastra(pres, pl, t, 2160, H);
  const v = pres.viso?.length ? pres.viso : [{ t: 0, x: 0.5, y: 0.42 }];
  let j = 0;
  while (j + 1 < v.length && v[j + 1].t <= t) j++;
  const fy = (H - alta) + top + v[j].y * vh;          // centro del viso sullo schermo
  const mezzo = (visoS(pres, t) * vh) / 2;
  let y = fy + mezzo + 230;                            // sotto il mento
  // troppo in basso (sotto c'è l'interfaccia di TikTok/Reels): sopra la testa. Nel diviso il viso sta già in basso e
  // sopra la testa la parola finiva sul cappello (Test 3): lì si scende fino all'88%
  if (y > H * (pl < 0.9 ? 0.88 : 0.78)) y = Math.max(hP + 160, fy - mezzo - 200);
  const pop = Math.min(1, (t - w.s) / 0.08);
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: y - 70, textAlign: 'center', fontFamily: FONT.bricolage, fontWeight: 700, fontSize: 118, lineHeight: 1, color: '#fff',
      textShadow: '0 6px 28px rgba(0,0,0,0.55)', transform: `scale(${0.92 + 0.08 * pop})`, whiteSpace: 'nowrap' }}>{w.w.replace(/[.,;:!?]+$/, '')}</div>
  );
};

export const Presentazione: React.FC<PropsPresentazione> = (p) => {
  const { fps, width } = useVideoConfig();
  const t = useCurrentFrame() / fps;
  const k = width / 2160; // render a metà risoluzione: tutto si disegna a 2160 e si scala
  const doc = p.lastra as Documento | undefined;
  const tratti = React.useMemo(() => (doc?.presentatore ? trattiLastra(doc) : null), [doc]);
  const pl = doc?.presentatore && tratti ? lastra(doc, t, tratti) : 0;
  const H = 3840;
  const hP = H * (1 - pl); // altezza del pannello Tiffany (in px a 2160)
  const n = p.scene.findIndex((x) => t >= x.da && t < x.a);
  // tornando a lui, il pannello che si chiude mostra ancora la scena di prima
  const s = n >= 0 && p.scene[n].modo === 'lui' && n > 0 && t < p.scene[n].da + 0.6 ? p.scene[n - 1] : p.scene[n];
  const ph = s ? layout(s).ph : PH;
  const pres = doc?.presentatore;
  return (
    <AbsoluteFill style={{ background: 'transparent', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: 2160, height: H, transform: `scale(${k})`, transformOrigin: '0 0' }}>
        {p.anteprima && pres && <VideoVero a={p.anteprima} pres={pres} pl={pl} t={t} />}
        {hP >= 1 && <div style={{ position: 'absolute', left: 0, top: 0, width: 2160, height: hP, overflow: 'hidden' }}>
          <Griglia />
          {/* il contenuto scorre col bordo del pannello mentre si apre */}
          <div style={{ position: 'absolute', left: 0, top: Math.min(0, hP - ph), width: 2160, height: ph }}>
            {s && s.modo !== 'lui' && <Contenuto key={s.da} s={s} cartella={p.cartella} />}
            {p.scene.filter((x) => x.barriera).map((x) => <Barriera key={x.da} t0={x.da - 0.27} />)}
          </div>
        </div>}
        {/* bordo del pannello sopra il video vero */}
        {pl > 0.001 && hP >= 1 && <>
          <div style={{ position: 'absolute', left: 0, right: 0, top: hP, height: 120, background: 'linear-gradient(rgba(11,31,36,0.45), rgba(11,31,36,0))' }} />
          <div style={{ position: 'absolute', left: 0, right: 0, top: hP - 5, height: 10, background: COLORI.testo }} />
        </>}
        {pres && p.parole && pl > 0.45 && <ParolaSingola parole={p.parole} t={t} pres={pres} pl={pl} hP={hP} />}
      </div>
      {p.anteprima?.voce && <Audio src={staticFile(p.anteprima.voce)} />}
    </AbsoluteFill>
  );
};

const VideoVero: React.FC<{ a: NonNullable<PropsPresentazione['anteprima']>; pres: Presentatore; pl: number; t: number }> = ({ a, pres, pl, t }) => {
  const { fps } = useVideoConfig();
  const H = 3840;
  const { alta, left, top, vw, vh } = geometriaLastra(pres, Math.max(0.001, pl), t, 2160, H);
  let cum = 0;
  return (
    <div style={{ position: 'absolute', left: 0, top: H - alta, width: 2160, height: Math.max(alta, 1), overflow: 'hidden' }}>
      {a.tieni.map((x, i) => {
        const da = cum; cum += x.a - x.da;
        return (
          <Sequence key={i} from={Math.round(da * fps)} durationInFrames={Math.max(1, Math.round((x.a - x.da) * fps))} layout="none">
            <OffthreadVideo src={staticFile(a.video)} startFrom={Math.round(x.da * fps)} muted style={{ position: 'absolute', left, top, width: vw, height: vh }} />
          </Sequence>
        );
      })}
    </div>
  );
};
