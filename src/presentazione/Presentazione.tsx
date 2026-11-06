// Stile Presentazione per il flusso locale: livello grafico trasparente sopra il video vero in DaVinci.
// Il pannello Tiffany sta in alto (metà schermo quando il presentatore è a metà, sparisce quando è a tutto schermo);
// sotto è trasparente e lì DaVinci mette il video del presentatore (stessa geometria: lastra() di src/rotolo/impagina.ts).
// Props da pc/locale/presentazione.mjs (presentazione.json): scene con le parole del parlato e una grafica ciascuna.
//   npx remotion render src/index.ts Presentazione grafica.mov --props=presentazione.json --codec=prores --prores-profile=4444 --pixel-format=yuva444p10le --image-format=png --scale=0.5
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { lastra, trattiLastra, type Documento } from '../rotolo/impagina';
import { COLORI } from './tema';
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
export type Scena = { da: number; a: number; parole: Parola[]; grafica?: Grafica; barriera?: boolean };
export type PropsPresentazione = {
  durata: number; fps?: number; cartella: string; scene: Scena[];
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

const Contenuto: React.FC<{ s: Scena; cartella: string }> = ({ s, cartella }) => {
  // il testo occupa al massimo ~42% del pannello: con tante righe si rimpicciolisce e la grafica resta grande
  const h0 = s.parole.length ? altezzaRighe(s.parole, SCALA_TESTO) : 0;
  // solo testo: più grande e al centro del pannello (il testo è la grafica)
  const scala = s.grafica ? (h0 > MAX_TESTO ? SCALA_TESTO * MAX_TESTO / h0 : SCALA_TESTO) : SCALA_TESTO * Math.min(1.35, (PH - 400) / Math.max(1, h0));
  const hT = s.parole.length ? altezzaRighe(s.parole, scala) : 0;
  const yT = s.grafica ? TESTO_Y : Math.max(TESTO_Y, (PH - hT) / 2 - 40);
  const y0 = yT + hT + (hT ? 70 : 0);
  const spazio = PH - 90 - y0;
  const g = s.grafica;
  const nat = g ? NATURALE[g.tipo] : 0;
  const k = nat ? Math.min(1, spazio / nat) : 1;
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

export const Presentazione: React.FC<PropsPresentazione> = (p) => {
  const { fps, width, height } = useVideoConfig();
  const t = useCurrentFrame() / fps;
  const k = width / 2160; // render a metà risoluzione: tutto si disegna a 2160 e si scala
  const doc = p.lastra as Documento | undefined;
  const tratti = React.useMemo(() => (doc?.presentatore ? trattiLastra(doc) : null), [doc]);
  const pl = doc?.presentatore && tratti ? lastra(doc, t, tratti) : 0;
  const H = 3840;
  const hP = H * (1 - pl); // altezza del pannello Tiffany (in px a 2160)
  if (hP < 1) return <AbsoluteFill style={{ background: 'transparent' }} />;
  const s = p.scene.find((x) => t >= x.da && t < x.a);
  return (
    <AbsoluteFill style={{ background: 'transparent', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: 2160, height: H, transform: `scale(${k})`, transformOrigin: '0 0' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, width: 2160, height: hP, overflow: 'hidden' }}>
          <Griglia />
          {/* il contenuto è impaginato per metà schermo e scorre col bordo del pannello */}
          <div style={{ position: 'absolute', left: 0, top: Math.min(0, hP - PH), width: 2160, height: PH }}>
            {s && <Contenuto key={s.da} s={s} cartella={p.cartella} />}
            {p.scene.filter((x) => x.barriera).map((x) => <Barriera key={x.da} t0={x.da - 0.27} />)}
          </div>
        </div>
        {/* bordo del pannello sopra il video vero */}
        {pl > 0.001 && <>
          <div style={{ position: 'absolute', left: 0, right: 0, top: hP, height: 120, background: 'linear-gradient(rgba(11,31,36,0.45), rgba(11,31,36,0))' }} />
          <div style={{ position: 'absolute', left: 0, right: 0, top: hP - 5, height: 10, background: COLORI.testo }} />
        </>}
      </div>
    </AbsoluteFill>
  );
};
