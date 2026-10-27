// Testo dello stile, prompt e controlli. Nessuna chiamata di rete: si prova da solo.
import REGOLE from '../../scripts/regole-stile.json';
import { chiaveStileR2, nomeStilePulito, slugStile } from '../../scripts/stile-app.mjs';

export { chiaveStileR2, nomeStilePulito, slugStile };

export const MAX_FOTO = 6;
export const MAX_FOTO_B64 = 180_000;

export type StileSalvato = { id: string; nome: string; testo: string; quando: number; desc: string };
export type MessaggioStile = { ruolo: 'denis' | 'ai'; testo: string };
export type BozzaStile = {
  id: string;
  nome: string;
  testo: string;
  riassunto: string;
  messaggi: MessaggioStile[];
  salvatoId?: string;
  durata?: number;
  tagli?: number;
  taglioMedio?: number;
  voce?: boolean;
  quando: number;
  // effetti visti nel riferimento che le opzioni di stile.txt non sanno rifare (studio sul video intero)
  daCreare?: string[];
};

const CAMPI = [
  'Nome', 'Quando usarlo', 'Tono',
  'Apertura', 'Font apertura', 'Colore apertura',
  'Sottotitoli', 'Font sottotitoli', 'Colore sottotitoli', 'Maiuscolo sottotitoli', 'Posizione sottotitoli', 'Dimensione sottotitoli',
  'Titoli', 'Font titoli', 'Colore titoli', 'Colore accento', 'Colori parole grandi', 'Posizione titoli',
  'Look', 'Soggetto in risalto', 'Sfondo sfocato', 'Inizio', 'Tagli dentro le frasi', 'Chiusura', 'Firma',
  'Transizioni', 'Inserti', 'B-roll stock', 'Effetti sonori', 'Musica', 'Volume musica',
  'Ritmo dei tagli', 'Inquadrature', 'Apertura e chiusura', 'Cose da evitare', 'Altro',
].join(', ');

export function ritmoSicuro(durata: unknown, tagli: unknown): { durata: number; tagli: number; taglioMedio: number } | { errore: string } {
  const d = Number(durata);
  const n = Number(tagli);
  if (!Number.isFinite(d) || d < 0.4 || d > 3600) return { errore: 'Durata del video non valida.' };
  const tagliOk = Number.isFinite(n) ? Math.max(0, Math.min(400, Math.round(n))) : 0;
  return { durata: Math.round(d * 10) / 10, tagli: tagliOk, taglioMedio: Math.round((d / (tagliOk + 1)) * 10) / 10 };
}

export function fotogrammiPuliti(lista: unknown): { foto: string[] } | { errore: string } {
  if (!Array.isArray(lista) || lista.length < 1) return { errore: 'Mancano i fotogrammi. Scegli un video e riprova.' };
  if (lista.length > MAX_FOTO) return { errore: 'Troppi fotogrammi. Ne bastano sei.' };
  const foto: string[] = [];
  for (const raw of lista) {
    const b64 = String(raw || '').replace(/^data:image\/jpeg;base64,/i, '').replace(/\s/g, '');
    if (!/^[A-Za-z0-9+/=]+$/.test(b64) || b64.length < 80 || b64.length > MAX_FOTO_B64) {
      return { errore: 'Un fotogramma è troppo grande o non è un JPEG.' };
    }
    foto.push(b64);
  }
  return { foto };
}

/** Wav corto, oppure niente: non è un errore, l'analisi va avanti coi fotogrammi. */
export function audioPulito(raw: unknown): Uint8Array | undefined {
  if (!raw) return undefined;
  const s = String(raw).replace(/^data:audio\/wav;base64,/i, '').replace(/\s/g, '');
  if (s.length < 80 || s.length > 2_000_000 || !/^[A-Za-z0-9+/=]+$/.test(s)) return undefined;
  try {
    const bin = atob(s);
    if (bin.length > 1_500_000) return undefined;
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xff;
    return out;
  } catch {
    return undefined;
  }
}

// Regole di Denis per gli stili (scripts/regole-stile.json): nei prompt di analisi e chat, e i campi
// "forza" imposti su ogni stile nuovo (analisi veloce e studio sul video intero; la chat no)
export const REGOLE_STILE: string[] = REGOLE.regole;
const righeRegole = () => ['REGOLE DI DENIS (vincolanti):', ...REGOLE_STILE.map((r) => `- ${r}`)].join('\n');

// cambia (o con null toglie) righe "Chiave: valore"; una chiave nuova va prima della regia; `note`
// diventano righe "# …" in fondo
export function applicaCorrezioni(testo: string, campi: Record<string, string | null>, note: string[] = []): string {
  let righe = testo.replace(/\r\n/g, '\n').split('\n');
  for (const [chiave, valore] of Object.entries(campi)) {
    const re = new RegExp(`^\\s*${chiave.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`, 'i');
    const i = righe.findIndex((r) => re.test(r));
    if (valore === null) { if (i >= 0) righe.splice(i, 1); continue; }
    const riga = `${chiave}: ${String(valore).replace(/\s+/g, ' ').trim()}`;
    if (i >= 0) { righe[i] = riga; continue; }
    // chiave nuova: prima del primo gruppo "# --- REGIA" se c'è, altrimenti in fondo
    const regia = righe.findIndex((r) => /^#\s*---\s*REGIA/i.test(r));
    if (regia > 0) righe.splice(regia, 0, riga, ''); else righe.push(riga);
  }
  righe = righe.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd().split('\n');
  const nuove = note.map((n) => `# ${String(n).replace(/^#\s*/, '').replace(/\s+/g, ' ').trim()}`).filter((n) => n.length > 2 && !righe.includes(n));
  return `${righe.join('\n')}${nuove.length ? `\n${nuove.join('\n')}` : ''}\n`;
}


export function conRegole(testo: string): string {
  return applicaCorrezioni(testo, REGOLE.forza as Record<string, string | null>);
}

export function promptAnalisi(d: { durata: number; tagli: number; taglioMedio: number; trascrizione?: string }): string {
  const voce = d.trascrizione
    ? `Trascrizione parziale (può essere incompleta; non ricopiarla nella risposta): ${d.trascrizione.slice(0, 1500)}`
    : 'Nessuna trascrizione: non inventare il parlato.';
  return [
    'Sei il regista di Denis. Guardi pochi fotogrammi di un video di riferimento, suo o di un creator, e descrivi lo STILE di montaggio.',
    'Non descrivere il soggetto, non citare titoli, nomi di file o marchi letti a schermo se non servono al look.',
    `Misure sul telefono, grezze: durata ${d.durata} s, cambi di inquadratura stimati ${d.tagli}, inquadratura media ${d.taglioMedio} s.`,
    voce,
    'Rispondi SOLO con JSON {"risposta":"due frasi in italiano su ritmo, scritte, colori e zoom","stile":"testo stile.txt"}.',
    'Lo stile.txt sono righe "Chiave: valore", senza markdown, con queste chiavi:',
    CAMPI,
    'Valori: Sottotitoli è frase, parola, blocchi, strati (parole sottili e parole chiave enormi e grassissime in minuscolo, una sopra l\'altra, a colori a giro) o nessuno. Transizioni è no, fumo o sfocata. Posizione è alto, centro o basso. Look è naturale, chiaro caldo, caldo, freddo, bianco e nero, oppure teal e arancio.',
    'Colori #RRGGBB. Font: un nome di Google Fonts col peso, es. Montserrat 700.',
    'Ritmo dei tagli e Inquadrature dicono durata dei tagli, transizioni, zoom e punch-in. Musica ed effetti solo se si capiscono.',
    'Se non vedi una cosa, il valore sobrio (Look: naturale, Transizioni: no, Musica: no), non inventare. Nome: un nome breve in italiano.',
    righeRegole(),
  ].join('\n');
}

export function promptChat(stile: string, storia: MessaggioStile[], detto: string): string {
  const filo = storia.slice(-8).map((m) => `${m.ruolo === 'denis' ? 'Denis' : 'Regista'}: ${m.testo.slice(0, 400)}`).join('\n');
  return [
    'Aggiorni lo stile.txt di Denis. Cambia solo quello che chiede. Il resto resta uguale, comprese le chiavi.',
    'Stile attuale:',
    stile.slice(0, 12000),
    filo ? `Conversazione:\n${filo}` : '',
    `Denis: ${detto.slice(0, 500)}`,
    `${righeRegole()}\nQueste regole valgono salvo che Denis, qui sopra, chieda esplicitamente il contrario.`,
    'Rispondi SOLO con JSON {"risposta":"una frase, cosa hai cambiato","stile":"stile.txt intero"}.',
  ].filter(Boolean).join('\n\n');
}

function righeChiave(testo: string): { chiave: string; valore: string }[] {
  const out: { chiave: string; valore: string }[] = [];
  for (const riga of String(testo || '').split(/\r?\n/)) {
    if (/^\s*#/.test(riga)) continue;
    const m = /^\s*([^:]{1,40}):\s*(.*)$/.exec(riga);
    if (!m) continue;
    out.push({ chiave: m[1].trim().toLowerCase(), valore: m[2].replace(/\s+#.*$/, '').trim() });
  }
  return out;
}

export function stileUsabile(testo: string): boolean {
  const t = String(testo || '').trim();
  if (t.length < 80 || t.length > 12000) return false;
  const righe = righeChiave(t);
  if (righe.length < 6) return false;
  const ha = (k: string) => righe.some((r) => r.chiave === k && r.valore);
  return ha('sottotitoli') && ha('look') && ha('ritmo dei tagli');
}

export function conNome(testo: string, nome: string): string {
  if (/^\s*Nome:/m.test(testo)) return testo.replace(/^\s*Nome:.*$/m, `Nome: ${nome}`);
  return `Nome: ${nome}\n${testo}`;
}

export function descrizioneStile(testo: string): string {
  const r = righeChiave(testo).find((x) => x.chiave === 'quando usarlo');
  return (r?.valore || 'studiato nell’app').slice(0, 140);
}

export function riassuntoStile(testo: string): string {
  const m = new Map(righeChiave(testo).map((r) => [r.chiave, r.valore]));
  const prendi = (k: string) => m.get(k) || '';
  const sotto = [prendi('sottotitoli'), prendi('font sottotitoli'), prendi('colore sottotitoli'), prendi('posizione sottotitoli')].filter(Boolean).join(' · ');
  const righe = [
    prendi('quando usarlo') && `Quando usarlo: ${prendi('quando usarlo')}`,
    prendi('ritmo dei tagli') && `Ritmo: ${prendi('ritmo dei tagli')}`,
    sotto && `Sottotitoli: ${sotto}`,
    prendi('look') && `Colori: ${prendi('look')}`,
    prendi('transizioni') && `Transizioni: ${prendi('transizioni')}`,
    prendi('inquadrature') && `Inquadrature: ${prendi('inquadrature')}`,
    prendi('musica') && `Musica: ${prendi('musica')}`,
    prendi('altro') && `Copertina: ${prendi('altro')}`,
  ].filter(Boolean) as string[];
  return righe.join('\n').slice(0, 700);
}

function testoStile(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return Object.entries(v as Record<string, unknown>)
      .filter(([, x]) => x != null && String(x).trim())
      .map(([k, x]) => `${k}: ${String(x).trim()}`)
      .join('\n');
  }
  return '';
}

/** JSON del modello, anche con recinzione markdown. Non rimanda indietro il testo grezzo. */
export function leggiJsonModello(raw: string): { risposta: string; stile: string } | null {
  let t = String(raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const i = t.indexOf('{');
  const j = t.lastIndexOf('}');
  if (i < 0 || j <= i) return null;
  let o: unknown;
  try { o = JSON.parse(t.slice(i, j + 1)); } catch { return null; }
  if (!o || typeof o !== 'object') return null;
  const rec = o as { risposta?: unknown; stile?: unknown };
  const risposta = String(rec.risposta || '').trim().slice(0, 600);
  const stile = testoStile(rec.stile).slice(0, 12000);
  if (!risposta || !stileUsabile(stile)) return null;
  return { risposta, stile };
}

const FASI_DIARIO = ['analizza', 'chat', 'gemini', 'claude', 'voce', 'video'] as const;
export type FaseDiario = (typeof FASI_DIARIO)[number];

/** Una riga sola, fase ed esito. Non accetta testo libero: niente titoli, nomi o trascrizioni. */
export function rigaDiario(fase: FaseDiario, esito: number | 'avvio'): string {
  const f = FASI_DIARIO.includes(fase) ? fase : 'analizza';
  const e = esito === 'avvio' ? 'avvio' : String(Math.max(0, Math.min(999, esito | 0)));
  return `stile fase=${f} esito=${e}`;
}

export function diarioStile(fase: FaseDiario, esito: number | 'avvio'): void {
  console.log(rigaDiario(fase, esito));
}

export type VoceStile = { nome: string; tasto: string; cosa: string };

/** Base, poi Drive, poi quelli studiati nell'app. Un nome già preso non si ripete. */
export function unisciNomi(
  base: VoceStile[],
  drive: { nome: string; cosa?: string }[],
  app: { nome: string; desc?: string }[],
): VoceStile[] {
  const out = base.map((s) => ({ ...s }));
  const ha = (n: string) => out.some((x) => x.nome.toLowerCase() === n.toLowerCase());
  for (const d of drive) {
    if (!d?.nome || ha(d.nome)) continue;
    out.push({ nome: d.nome, tasto: `✨ ${d.nome}`, cosa: d.cosa || 'su misura, da Drive' });
  }
  for (const a of app) {
    if (!a?.nome || ha(a.nome)) continue;
    out.push({ nome: a.nome, tasto: `✦ ${a.nome}`, cosa: a.desc || 'studiato nell’app' });
  }
  return out;
}
