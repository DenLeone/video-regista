// 🎬 Scene fatte a mano (19/11, Denis: «fai tu quello che dico del vinile di Spotify»). Quando un'animazione deve essere
// di altissimo livello (es. il video che mostra la skill), Claude la scrive e la prova in motion/scene/<nome>.js e nel
// brief si mette «Animazione: <nome>». Le righe in testa al file dicono dove va:
//   // parola: vinile      → parte quando Denis dice questa parola (la prima volta)
//   // anticipo: 0.5       → secondi prima della parola (il logo entra un attimo prima)
//   // durata: 6           → secondi
//   // serve: foto         → (facoltativo) senza una foto vera del prodotto la scena si salta
// Prima del render: le schermate e i loghi che cadrebbero nello stesso momento escono (niente due grafiche insieme),
// al loro posto uno spazio «animazione» con la scena; dopo il render Ultron la renderizza con i suoi suoni.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCENE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'motion', 'scene');
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');

export const nomeScena = (brief = '') => (/\banimazione\s*:\s*([a-z0-9][\w-]*)/i.exec(brief) || [])[1]?.toLowerCase() || null;
export function codiceScena(nome) {
  const f = path.join(SCENE, `${nome}.js`);
  return /^[\w-]+$/.test(nome) && fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
}
export function intestazione(codice) {
  const v = (k) => (new RegExp(`^//\\s*${k}\\s*:\\s*(.+)$`, 'mi').exec(codice) || [])[1]?.trim();
  return { parola: v('parola') || null, anticipo: Number(v('anticipo')) || 0, durata: Math.min(8, Math.max(2, Number(v('durata')) || 4)), ...(v('serve') ? { serve: v('serve') } : {}) };
}

// mette la scena nel piano; ritorna un avviso per il log (o null se il brief non chiede scene)
export function scenaNelPiano(piano, brief) {
  const nome = nomeScena(brief);
  if (!nome) return null;
  const codice = codiceScena(nome);
  if (!codice) return `scena «${nome}» non trovata in motion/scene`;
  const { parola, anticipo, durata } = intestazione(codice);
  const durataVideo = Math.max(0, ...(piano.parole || []).map((p) => p.at + p.dur));
  // «parola: {prodotto}» = la prima volta che Denis dice il nome del prodotto (prima parola del soggetto del video)
  const titolo = String(piano.soggetto || piano.titolo || '').trim();
  const cerca = parola === '{prodotto}' ? (titolo.split(/\s+/).find((x) => norm(x).length >= 3) || '') : parola;
  const w = cerca ? (piano.parole || []).find((p) => norm(p.w).includes(norm(cerca))) : null;
  if (parola === '{prodotto}' && !w) return `scena «${nome}»: il nome del prodotto («${cerca}») non si sente nel montaggio`;
  if (parola && !w) return `scena «${nome}»: la parola «${parola}» non c'è nel montaggio`;
  const at = +Math.max(0, (w ? w.at : 0) - anticipo).toFixed(2);
  const dur = +Math.min(durata, Math.max(1.5, durataVideo - at - 0.2)).toFixed(2);
  const fuori = (x) => x.at < at + dur + 0.2 && x.at + (x.dur || 0) > at - 0.2;
  const prima = (piano.schermate || []).length + (piano.icone || []).length;
  // escono solo le grafiche nello stesso momento: l'animazione speciale della regia, se è altrove, resta
  piano.schermate = (piano.schermate || []).filter((x) => !fuori(x));
  if (piano.icone) piano.icone = piano.icone.filter((x) => !fuori(x));
  const tolte = prima - piano.schermate.length - (piano.icone || []).length;
  piano.schermate.push({ at, dur, tipo: 'animazione', scena: nome, prompt: `scena fatta a mano: ${nome}`, testo: '', dati: { titolo } });
  piano.schermate.sort((a, b) => a.at - b.at);
  return `scena «${nome}» a ${at} s per ${dur} s${tolte ? ` (tolte ${tolte} grafiche nello stesso momento)` : ''}`;
}
