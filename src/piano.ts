// Il "piano di montaggio" che Claude scrive e Remotion esegue.
// Tutti i tempi sono in secondi.

export type Clip = {
  file: string;   // nome del proxy in public/media
  start: number;  // in-point nella clip sorgente
  end: number;    // out-point nella clip sorgente
  punch?: boolean; // punch-in ~1,18x sul jump cut
  orient?: 'v' | 'h'; // verticale (riempie) o orizzontale (contenuta su fondo sfocato)
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
};

export const FPS = 30;
export const W = 1080;
export const H = 1920;

export const durataClip = (c: Clip) => Math.max(0, c.end - c.start);
export const durataTotale = (p: Piano) => p.clips.reduce((s, c) => s + durataClip(c), 0);
