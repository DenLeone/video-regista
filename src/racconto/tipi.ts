// Racconto: video "cinematografico" disegnato tutto col codice (03/11, prova 21:9 sul video Ai).
// Un solo mondo grande (una scrivania vista dall'alto) e una camera che ci scorre sopra senza tagli.
// Tutte le misure del mondo sono in px del mondo; i tempi in secondi dall'inizio della voce.

export type Chiave = { t: number; x: number; y: number; zoom: number; rot?: number }; // centro inquadrato e zoom (1 = larghezza del video = VISTA px del mondo)

export type Oggetto = {
  id: string;
  tipo: 'foto' | 'documento' | 'parola' | 'cartellino' | 'pc' | 'scheda' | 'linea' | 'badge';
  x: number; y: number; w: number; h: number; rot?: number;
  entra: number;                 // quando cade sulla scrivania
  eroe?: [number, number][];     // quando è il protagonista (gli altri si attenuano)
  titolo?: string;               // testo grande (sempre leggibile)
  sotto?: string;                // etichetta più piccola, comunque grande
  foto?: string;                 // file in public/ (staticFile)
  righe?: number;                // righe grigie finte da carta (documento)
  colore?: string;
  scrivi?: [number, number];     // titolo che si scrive tra questi due tempi
  tacche?: { etichetta: string; frazione: number }[]; // linea del tempo
};

export type Evento =
  | { tipo: 'cerchio'; t: number; oggetto: string; dx?: number; dy?: number; rx?: number; ry?: number }
  | { tipo: 'timbro'; t: number; oggetto: string; testo: string; dx?: number; dy?: number; colore?: string; size?: number }
  | { tipo: 'barra'; t: number; oggetto: string; dy?: number }; // riga che barra il titolo

export type Racconto = {
  durata: number;
  audio?: string;                // file in public/
  mondo: { w: number; h: number };
  camera: Chiave[];
  oggetti: Oggetto[];
  eventi: Evento[];
};

export const VISTA = 2400; // px del mondo che entrano in larghezza a zoom 1
