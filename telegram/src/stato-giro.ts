// Cosa mostra la card «In corso» dell'app. I minuti sono una stima fissa per fase,
// non un conto alla rovescia: servono a dire «quanto manca» senza promettere l'ora.

export const FASI_APP = [
  { id: 'installazione', nome: 'Installazione', minuti: 2 },
  { id: 'scarico', nome: 'Scarico', minuti: 3 },
  { id: 'prepara', nome: 'Analisi', minuti: 5 },
  { id: 'regia', nome: 'Regia', minuti: 4 },
  { id: 'tagli', nome: 'Tagli', minuti: 3 },
  { id: 'render', nome: 'Render', minuti: 8 },
  { id: 'carico', nome: 'Upload', minuti: 2 },
] as const;

export type IdFaseApp = (typeof FASI_APP)[number]['id'];

const DAL_GIRO: Record<string, IdFaseApp> = {
  scarico: 'scarico', prepara: 'prepara', regia: 'regia', tagli: 'tagli', render: 'render', carico: 'carico',
};

/** Prima del primo messaggio del giro il server sta ancora installando. */
export function faseAttuale(corrente: string | undefined, inCoda?: boolean): IdFaseApp {
  if (inCoda || !corrente) return 'installazione';
  return DAL_GIRO[corrente] || 'installazione';
}

export function schedaFasi(input: {
  corrente?: string;
  inCoda?: boolean;
  fasi?: Partial<Record<string, string>>;
  fine?: 'ok' | 'ko';
}) {
  const id = input.fine === 'ok' ? 'carico' : faseAttuale(input.corrente, input.inCoda);
  const idx = FASI_APP.findIndex((f) => f.id === id);
  return FASI_APP.map((f, i) => ({
    id: f.id,
    nome: f.nome,
    dettaglio: input.fasi?.[f.id] || '',
    fatta: input.fine === 'ok' || i < idx,
    ora: input.fine !== 'ok' && input.fine !== 'ko' && i === idx,
    ko: input.fine === 'ko' && i === idx,
  }));
}

export function minutiMancanti(corrente: string | undefined, inCoda?: boolean): number {
  const id = faseAttuale(corrente, inCoda);
  const idx = FASI_APP.findIndex((f) => f.id === id);
  let tot = 0;
  for (let i = idx; i < FASI_APP.length; i++) tot += FASI_APP[i].minuti;
  tot -= Math.floor(FASI_APP[idx].minuti / 2);
  return Math.max(1, tot);
}

export function testoMancano(minuti: number): string {
  if (minuti <= 1) return 'Manca circa un minuto';
  if (minuti >= 50) return 'Manca circa un’ora';
  return `Mancano circa ${minuti} min`;
}

export function motivoChiaro(testo: string | undefined, conclusion?: string | null): string {
  const riga = String(testo || '')
    .replace(/^Errore:\s*/i, '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)[0] || '';
  const pulita = riga.replace(/\s+/g, ' ').slice(0, 280);
  if (pulita) return pulita;
  if (conclusion === 'cancelled') return 'Il giro è stato annullato.';
  return 'Si è fermato sul server prima di scrivere il motivo. Di solito è l’installazione dei programmi o Drive.';
}

export function nomeRiprovabile(nome: string | undefined): boolean {
  const n = (nome || '').trim();
  if (!n || n === '—' || n === '-' || n.startsWith('⚡')) return false;
  return true;
}
