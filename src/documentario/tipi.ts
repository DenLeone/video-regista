// Stile Documentario (flusso locale): un solo piano sequenza verticale su un mondo (scrivania d'archivio, bacheca…)
// e Denis in camera DENTRO il mondo: una stampa sulla scrivania con il suo video, in cui la camera entra finché è a
// tutto schermo. Niente tagli dall'inizio alla fine. Misure del mondo in px del mondo, tempi in secondi del video.
// Props scritte da pc/locale/doc-mondo.mjs a partire dalle scene (beat) della regia.

export type Chiave = { t: number; x: number; y: number; zoom: number; rot?: number };

export type ParolaFrase = { w: string; t: number };

export type Oggetto = {
  id: string;
  tipo: 'foto' | 'documento' | 'parola' | 'cartellino' | 'tu' | 'frase' | 'curva' | 'acronimo' | 'contatore';
  x: number; y: number; w: number; h: number; rot?: number;
  entra: number;                       // quando cade sulla scrivania
  eroe?: [number, number][];           // quando è il protagonista (il resto si attenua)
  titolo?: string;
  sotto?: string;
  foto?: string;                       // file in public/
  righe?: number;
  scrivi?: [number, number];           // titolo che si scrive tra questi due tempi
  // tu: la stampa col video di Denis (proxy verticale già tagliato); vivo = quando il video scorre, fermo altrove
  video?: string; fermo?: string; vivo?: [number, number][];
  // frase su foglio a macchina: evidenziatore che avanza (sequenza) o fili tra parole (fili)
  parole?: ParolaFrase[]; modo?: 'sequenza' | 'fili'; fili?: [number, number, number][]; sbiadisci?: { t: number; fino: number };
  // curva che esplode, acronimo che si apre, contatore
  t0?: number; lettere?: { l: string; resto: string; t: number }[]; valore?: number; t1?: number;
};

export type Evento =
  | { tipo: 'cerchio'; t: number; oggetto: string; dx?: number; dy?: number; rx?: number; ry?: number }
  | { tipo: 'timbro'; t: number; oggetto: string; testo: string; dx?: number; dy?: number; size?: number }
  | { tipo: 'barra'; t: number; oggetto: string; dy?: number }
  | { tipo: 'fili'; t: number; oggetto: string; verso: string[]; passo?: number };   // fili rossi da un oggetto ad altri

export type PropsDocumentario = {
  durata: number; fps?: number;
  voce?: string;                       // file in public/
  vista: number;                       // px del mondo che entrano in larghezza a zoom 1
  mondo: { w: number; h: number; tema: 'archivio' | 'bacheca' | 'mappa' };
  camera: Chiave[];
  oggetti: Oggetto[];
  eventi: Evento[];
};
