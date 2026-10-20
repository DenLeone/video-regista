// Il "piano di montaggio" che Claude scrive e Remotion esegue.
// Tutti i tempi sono in secondi.

export type Clip = {
  file: string;   // nome del proxy in public/media
  start: number;  // in-point nella clip sorgente
  end: number;    // out-point nella clip sorgente
  punch?: boolean; // punch-in ~1,18x sul jump cut
  orient?: 'v' | 'h'; // verticale (riempie) o orizzontale (contenuta su fondo sfocato)
  // voce da un'altra sorgente (iPhone, Insta360, mic esterno): l'immagine resta muta
  audio?: { file: string; start: number };
  muto?: boolean;   // nessun audio
  volume?: number;  // volume dell'audio della clip stessa (default 1)
  bn?: boolean;     // in bianco e nero (stili su misura con "Bianco e nero: momenti")
  // scheda arrotondata sopra l'inquadratura (registrazione dello schermo, screenshot, foto, B-roll
  // del prodotto) mentre Denis ne parla; video: start/end nella sorgente
  inserto?: { file: string; tipo: 'video' | 'immagine'; orient?: 'v' | 'h'; start?: number; end?: number; continua?: boolean };
  // la persona ritagliata (video con trasparenza) per far passare le scritte grandi dietro di lei;
  // da = secondi dall'inizio della clip
  ritaglio?: { file: string; da: number; dur: number };
  // rallentatore (B-roll a 50/60 fps): prima del taglio start = inizio nella sorgente e end - start =
  // durata sul video; la sorgente usata è (end - start) / lento secondi. Dopo il taglio il pezzo è già lento
  lento?: number;
};

export type Keyword = {
  at: number;      // inizio sulla timeline finale
  dur: number;
  word: string;
  note?: string;   // "// nota ironica"
  tag?: string;    // A-01, N°1, MAT., ESITO
  filled?: boolean; // box pieno verde (sponsor, verdetto)
  top?: number;    // y del box, default 1330
};

export type Flicker = {
  at: number;      // inizio sulla timeline (~0,12 s prima del taglio)
  seed: number;
  tear?: boolean;  // variante carta millimetrata strappata
};

export type Piano = {
  titolo: string;
  tavola: string;           // "TAV. 05" oppure "TAV. TEST"
  soggetto: string;         // label dell'intro: "TAV. 05 — SOGGETTO"
  clips: Clip[];
  keywords: Keyword[];
  flickers: Flicker[];
  sponsor?: { material: string; test: string } | null;
  sponsorAt?: number;       // da quando mostrare il cartiglio
  note?: string;            // dubbi/scelte di Claude, finiscono in NOTE.txt
  testo?: string;           // il parlato del montaggio, di fila (per NOTE.txt)
  // effetti sonori (public/sfx): volume in base al livello della voce; false = nessuno
  sfx?: { volume: number } | false;
  // ogni parola detta, sulla timeline finale (sottotitoli parola per parola degli stili che li usano)
  parole?: { at: number; dur: number; w: string }[];
  // stile su misura: la grafica letta da Drive (Stili/<nome>/stile.txt, vedi scripts/stile-su-misura.mjs)
  grafica?: GraficaStile;
  enfasi?: string[];        // parole dell'apertura da fare enormi (scelte dall'AI negli stili su misura)
  // fotogrammi al secondo del video: quelli della camera principale (24 con la Sony a 23,98, 30
  // con l'iPhone). Senza, 30. A 30 fps il girato a 24p ripeteva un fotogramma ogni quattro (scatti)
  fps?: number;
};

// font di uno stile su misura: file in public/stili/<stile>/ oppure Google Fonts per nome
export type FontStile = { famiglia: string; peso: number; corsivo?: boolean; file?: string };
export type Posizione = 'alto' | 'centro' | 'basso';
export type GraficaStile = {
  nome: string;
  apertura: 'normale' | 'grande';           // grande = prima frase a lettere enormi, parola per parola
  fontApertura: FontStile; coloreApertura: string;
  sottotitoli: 'parola' | 'frase' | 'nessuno';
  // minuscolo: tutto in minuscolo, punteggiatura compresa (reel tech americani, stile Esplicativo)
  fontSottotitoli: FontStile; coloreSottotitoli: string; maiuscolo: boolean; minuscolo?: boolean; posizione: Posizione; dimensione: number;
  titoli: boolean; fontTitoli: FontStile; coloreTitoli: string; accento: string; posTitoli: Posizione;
  // titoli = nome prodotto e dati (come il Cinematico); frasi = scritte forti a due livelli,
  // frase piccola in corsivo + parole chiave enormi (come l'apertura); parole = le frasi forti
  // dette, una parola alla volta enormi al centro, mentre il resto va piccolo in basso (Esplicativo)
  tipoTitoli: 'titoli' | 'frasi' | 'parole';
  fontCorsivo: FontStile;                    // la frase piccola delle scritte a due livelli
  dietro: boolean;                           // le scritte grandi passano dietro alla persona
  look: 'naturale' | 'caldo' | 'freddo' | 'bianco e nero' | 'teal' | 'chiaro caldo';  // teal e chiaro caldo: in ffmpeg, non CSS
  risalto?: boolean;                         // soggetto in risalto: tu luminoso, sfondo buio e petrolio (scripts/look/risalto.py)
  sfoca?: boolean;                           // con il risalto, anche lo sfondo sfocato
  rivela?: boolean;                          // inizio "prima e dopo": l'immagine piatta che si colora
  stacchi?: boolean;                         // ritmo veloce: la regia può cambiare inquadratura a metà frase
  chiusura?: string;                         // chiusura con logo Instagram e questo nome (es. @_black_den)
  biancoNero: 'no' | 'momenti' | 'sempre';
  vignetta: number;                          // 0–1
  sfx: boolean;
  musica?: { file: string; volume: number } | null;
};

export const FPS = 30; // predefinito: il video vero usa piano.fps (vedi fpsDi)
export const fpsDi = (p: Pick<Piano, 'fps'>) => (p.fps && p.fps >= 10 && p.fps <= 60 ? p.fps : FPS);
export const W = 1080;
export const H = 1920;

export const durataClip = (c: Clip) => Math.max(0, c.end - c.start);
export const durataTotale = (p: Piano) => p.clips.reduce((s, c) => s + durataClip(c), 0);
