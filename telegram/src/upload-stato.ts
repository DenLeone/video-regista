// Contabilità dei pezzi: un pezzo confermato non si rimanda.
// R2 rifiuta i pezzi sotto i 5 MiB tranne l'ultimo; 8 MiB sta sopra e tiene poca RAM sul telefono.

export const PARTE = 8 * 1024 * 1024;
export const PARTE_MIN = 5 * 1024 * 1024;
export const MAX_PARTI = 10_000;
export const PARALLELO = 4;
export const MAX_FILE = 40;
export const MAX_BYTE_FILE = 200 * 1024 * 1024 * 1024;
export type ModalitaUpload = 'originali' | 'scelti' | 'proxy';

export type ParteFatta = { n: number; etag: string };

export function dimensioneParte(size: number): number {
  const minima = Math.ceil(size / MAX_PARTI);
  const allineata = Math.ceil(minima / (1024 * 1024)) * 1024 * 1024;
  return Math.max(PARTE, allineata);
}

export function numeroParti(size: number, parte = dimensioneParte(size)): number {
  if (size <= 0) return 0;
  return Math.ceil(size / parte);
}

export function registraEtag(parti: ParteFatta[], n: number, etag: string): ParteFatta[] {
  return [...parti.filter((p) => p.n !== n), { n, etag }].sort((a, b) => a.n - b.n);
}

export function partiMancanti(totale: number, fatte: { n: number }[]): number[] {
  const set = new Set(fatte.map((p) => p.n));
  const out: number[] = [];
  for (let i = 1; i <= totale; i++) if (!set.has(i)) out.push(i);
  return out;
}

export function byteFatti(size: number, parte: number, fatte: { n: number }[]): number {
  const totale = numeroParti(size, parte);
  let n = 0;
  for (const p of fatte) {
    if (p.n < 1 || p.n > totale) continue;
    const start = (p.n - 1) * parte;
    n += Math.min(parte, size - start);
  }
  return n;
}

/** Secondi rimasti. `byteAlSecondo` è la media recente, non una promessa. */
export function etaSecondi(fatti: number, totale: number, byteAlSecondo: number): number | null {
  if (!(byteAlSecondo > 0) || fatti >= totale) return fatti >= totale ? 0 : null;
  return (totale - fatti) / byteAlSecondo;
}

export function etagValido(etag: string): boolean {
  return /^"?[A-Za-z0-9._:+/=-]{1,128}"?$/.test(etag) && !etag.includes('<');
}

const EST = /\.(mov|mp4|m4v|mkv|webm|insv|wav|mp3|m4a|aac|flac|aiff?|ogg|jpe?g|png|heic|webp|txt)$/i;

export function nomeSicuro(nome: string, usati: Set<string>): string {
  const base = (nome.split(/[/\\]/).pop() || 'file').replace(/[\u0000-\u001f]/g, '').replace(/\.\./g, '.').trim().slice(0, 140);
  let pulito = base && base !== '.' ? base : 'file.bin';
  if (!EST.test(pulito)) pulito += '.bin';
  let scelto = pulito;
  let n = 2;
  while (usati.has(scelto.toLowerCase())) {
    scelto = pulito.replace(/(\.[^.]+)$/, `_${n}$1`);
    n++;
  }
  usati.add(scelto.toLowerCase());
  return scelto;
}

export function limiteFile(size: number): string | null {
  if (!(size > 0)) return 'Il file è vuoto.';
  if (size > MAX_BYTE_FILE) return `Il file è troppo grande per il telefono (${Math.round(size / 1e9)} GB). Il limite è 200 GB.`;
  return null;
}
