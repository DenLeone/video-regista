// Stili studiati nell'app: il nome diventa una chiave R2 stabile, senza path.
// Il runner legge stili/<slug>/stile.txt se la cartella non c'è su Drive.
import { LOOK_FFMPEG, leggiStile } from './stile-su-misura.mjs';

export function slugStile(nome) {
  const s = String(nome || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s) ? s : '';
}

/** Chiave oggetto. Vuota se il nome non diventa uno slug sicuro. */
export function chiaveStileR2(nome) {
  const slug = slugStile(nome);
  return slug ? `stili/${slug}/stile.txt` : '';
}

export function nomeStilePulito(nome) {
  const n = String(nome || '').replace(/[\\/:*?"<>|\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (n.length < 2 || n.length > 40) return '';
  if (n.startsWith('_')) return '';
  return n;
}

/** Quanti salti di luminosità: stessa soglia del campionamento sul telefono. */
export function contaSalti(valori, soglia = 0.18) {
  let n = 0;
  for (let i = 1; i < (valori || []).length; i++) {
    const a = Number(valori[i - 1]) || 0;
    const b = Number(valori[i]) || 0;
    if (Math.abs(b - a) / Math.max(1, Math.abs(a)) >= soglia) n += 1;
  }
  return n;
}

/** stile.txt dell'app → grafica SuMisura, senza font né musica (non ci sono asset). */
export function preparaStileApp(nome, testo) {
  const { grafica, testoAI, musica } = leggiStile(testo, nome);
  const avvisi = [];
  if (musica) avvisi.push('musica indicata nello stile: senza un file in asset non parte');
  return {
    nome: grafica.nome || nome,
    grafica,
    testoAI,
    look12k: grafica.look === 'teal',
    lookFfmpeg: LOOK_FFMPEG[grafica.look] || null,
    avvisi,
  };
}
