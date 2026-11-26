// 📱 Stato della Squadra per la Mini App (26/11, passo 3). La Squadra (repo privato) lo spinge qui con una chiave che serve
// solo a scrivere; l'app lo legge dopo il login. Il codice qui è pubblico: il Worker non si fida nemmeno del mittente e
// rifà il taglio dei campi, quindi anche un invio sbagliato non fa uscire altro che nomi, passi, stati e testi corti.
export const LIMITE_BYTE = 24_000;
export const K_STATO_SQUADRA = 'squadra:stato';
export const VECCHIO_DOPO_MS = 45 * 60_000; // la Squadra manda un battito ogni 30 minuti

const t = (x: unknown, n = 90) => { const v = String(x ?? '').slice(0, n); return /^\s*[{[]/.test(v) ? '' : v; };
const num = (x: unknown) => Math.max(0, Math.min(10_000, Math.round(Number(x) || 0)));
const lista = <T>(x: unknown, max: number, f: (v: any) => T): T[] => (Array.isArray(x) ? x.slice(0, max).map(f) : []);

export type StatoSquadra = {
  agenti: Record<string, { stato: string }>;
  lavori: { id: string; stile: string; passo: number; stato: string; testo: string; prodotti: { nome: string; passo: number; stato: string; testo: string }[] }[];
  adesso: { testo: string; coda: boolean; min: number }[];
  passi: string[];
};

/** qualunque cosa arrivi → solo i campi ammessi, tagliati; null se non è nemmeno un oggetto */
export function pulisciStato(x: unknown): StatoSquadra | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const s = x as Record<string, any>;
  const agenti: StatoSquadra['agenti'] = {};
  if (s.agenti && typeof s.agenti === 'object') for (const [id, a] of Object.entries(s.agenti).slice(0, 40)) agenti[t(id, 30)] = { stato: t((a as any)?.stato, 10) };
  return {
    agenti,
    lavori: lista(s.lavori, 6, (l) => ({
      id: t(l?.id, 60), stile: t(l?.stile, 30), passo: num(l?.passo), stato: t(l?.stato, 10), testo: t(l?.testo),
      prodotti: lista(l?.prodotti, 8, (p) => ({ nome: t(p?.nome, 60), passo: num(p?.passo), stato: t(p?.stato, 10), testo: t(p?.testo) })),
    })),
    adesso: lista(s.adesso, 12, (a) => ({ testo: t(a?.testo), coda: Boolean(a?.coda), min: num(a?.min) })),
    passi: lista(s.passi, 8, (p) => t(p, 30)),
  };
}

export type StatoSalvato = { quando: string; ricevuto: number; stato: StatoSquadra };

/** corpo della POST → stato da salvare, o l'errore da dare */
export function leggiInvio(corpo: unknown, adesso = Date.now()): { ok: true; salvato: StatoSalvato } | { ok: false; stato: number; messaggio: string } {
  const c = corpo as { quando?: unknown; stato?: unknown } | null;
  const stato = pulisciStato(c?.stato);
  if (!stato) return { ok: false, stato: 400, messaggio: 'stato mancante o non valido' };
  const quando = new Date(String(c?.quando ?? ''));
  return { ok: true, salvato: { quando: Number.isNaN(quando.getTime()) ? new Date(adesso).toISOString() : quando.toISOString(), ricevuto: adesso, stato } };
}

export function perLApp(salvato: StatoSalvato | undefined, adesso = Date.now()) {
  if (!salvato) return { presente: false as const };
  return { presente: true as const, quando: salvato.quando, ricevuto: salvato.ricevuto, vecchio: adesso - salvato.ricevuto > VECCHIO_DOPO_MS, stato: salvato.stato };
}
