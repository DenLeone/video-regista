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

// toglie le grafiche che cadrebbero insieme a una scena (at…at+dur); ritorna quante ne ha tolte
function liberaSpazio(piano, at, dur) {
  const fuori = (x) => x.at < at + dur + 0.2 && x.at + (x.dur || 0) > at - 0.2;
  const prima = (piano.schermate || []).length + (piano.icone || []).length;
  piano.schermate = (piano.schermate || []).filter((x) => !fuori(x));
  if (piano.icone) piano.icone = piano.icone.filter((x) => !fuori(x));
  return prima - piano.schermate.length - (piano.icone || []).length;
}

// 🏆 Classifica nel brief (19/11, dal reel «Top 10 skill» che Denis ha salvato):
//   Classifica: Top 5 skill per Claude Code
//   5. Ponytail | 95,7k stelle | Scrive codice come il senior più pigro | DietrichGebert/ponytail
//   4. …
// campi dopo il nome (tutti facoltativi): numero (+ etichetta), frase, sottotitolo. Le voci vanno nell'ordine in cui
// Denis le dice; ognuna diventa una scena «classifica» che parte quando lui ne pronuncia il nome.
export function leggiClassifica(brief = '') {
  const righe = String(brief).split('\n');
  const i = righe.findIndex((r) => /^\s*classifica\s*:/i.test(r));
  if (i < 0) return null;
  const titolo = righe[i].replace(/^\s*classifica\s*:\s*/i, '').trim().slice(0, 48);
  const voci = [];
  for (const r of righe.slice(i + 1)) {
    const m = /^\s*(\d{1,2})\s*[.)°]\s*(.+)$/.exec(r);
    if (!m) { if (!r.trim() || !voci.length) continue; break; }
    const [nome, numero = '', frase = '', sotto = ''] = m[2].split('|').map((x) => x.trim());
    const mn = /^(\S*\d\S*)\s*(.*)$/.exec(numero);
    voci.push({ n: +m[1], nome: nome.slice(0, 30), numero: mn ? mn[1] : numero, etichetta: mn ? mn[2].slice(0, 30) : '', frase: frase.slice(0, 90), ...(sotto ? { sotto: sotto.slice(0, 44) } : {}) });
  }
  return voci.length ? { titolo, voci: voci.slice(0, 10) } : null;
}

const GENERICHE = new Set(['skill', 'skills', 'app', 'pro', 'max', 'plus', 'the', 'per', 'con', 'top', 'mini', 'ultra']);
export function classificaNelPiano(piano, brief) {
  const c = leggiClassifica(brief);
  if (!c) return null;
  if (!codiceScena('classifica')) return 'scena «classifica» non trovata in motion/scene';
  const parole = piano.parole || [];
  const durataVideo = Math.max(0, ...parole.map((p) => p.at + p.dur));
  const totale = Math.max(...c.voci.map((v) => v.n));
  // ogni voce: la prima volta che Denis ne dice il nome DOPO la voce di prima
  let dopo = -1;
  const trovate = [], mancano = [];
  for (const v of c.voci) {
    // una qualsiasi parola del nome («Matt Pocock» → anche solo «Pocock»), tranne quelle generiche
    const chiavi = v.nome.split(/\s+/).map(norm).filter((x) => x.length >= 3 && !GENERICHE.has(x));
    if (!chiavi.length && norm(v.nome)) chiavi.push(norm(v.nome));
    const w = parole.find((p) => p.at > dopo && chiavi.some((k) => norm(p.w).includes(k)));
    if (!w) { mancano.push(v.nome); continue; }
    trovate.push({ v, at: +Math.max(0, w.at - 0.3).toFixed(2) });
    dopo = w.at;
  }
  let tolte = 0;
  trovate.forEach((x, k) => {
    const prossima = trovate[k + 1]?.at ?? durataVideo;
    const dur = +Math.min(4.5, Math.max(1.5, prossima - x.at - 0.3), durataVideo - x.at - 0.2).toFixed(2);
    if (dur < 1.5) return;
    tolte += liberaSpazio(piano, x.at, dur);
    piano.schermate.push({ at: x.at, dur, tipo: 'animazione', scena: 'classifica', prompt: `classifica: ${x.v.nome}`, testo: '', dati: { titolo: c.titolo, totale, voce: x.v } });
  });
  piano.schermate.sort((a, b) => a.at - b.at);
  return `classifica: ${trovate.length} voci su ${c.voci.length}${mancano.length ? ` (non sento: ${mancano.join(', ')})` : ''}${tolte ? `, tolte ${tolte} grafiche nello stesso momento` : ''}`;
}

// mette la scena nel piano; ritorna un avviso per il log (o null se il brief non chiede scene)
export function scenaNelPiano(piano, brief) {
  const cl = classificaNelPiano(piano, brief);
  const nome = nomeScena(brief);
  if (!nome) return cl;
  const codice = codiceScena(nome);
  if (!codice) return (cl ? `${cl}; ` : '') + `scena «${nome}» non trovata in motion/scene`;
  const { parola, anticipo, durata } = intestazione(codice);
  const durataVideo = Math.max(0, ...(piano.parole || []).map((p) => p.at + p.dur));
  // «parola: {prodotto}» = la prima volta che Denis dice il nome del prodotto (prima parola del soggetto del video)
  const titolo = String(piano.soggetto || piano.titolo || '').trim();
  const cerca = parola === '{prodotto}' ? (titolo.split(/\s+/).find((x) => norm(x).length >= 3) || '') : parola;
  const w = cerca ? (piano.parole || []).find((p) => norm(p.w).includes(norm(cerca))) : null;
  if (parola === '{prodotto}' && !w) return (cl ? `${cl}; ` : '') + `scena «${nome}»: il nome del prodotto («${cerca}») non si sente nel montaggio`;
  if (parola && !w) return (cl ? `${cl}; ` : '') + `scena «${nome}»: la parola «${parola}» non c'è nel montaggio`;
  const at = +Math.max(0, (w ? w.at : 0) - anticipo).toFixed(2);
  const dur = +Math.min(durata, Math.max(1.5, durataVideo - at - 0.2)).toFixed(2);
  // escono solo le grafiche nello stesso momento: l'animazione speciale della regia, se è altrove, resta
  const tolte = liberaSpazio(piano, at, dur);
  piano.schermate.push({ at, dur, tipo: 'animazione', scena: nome, prompt: `scena fatta a mano: ${nome}`, testo: '', dati: { titolo } });
  piano.schermate.sort((a, b) => a.at - b.at);
  return `${cl ? `${cl}; ` : ''}scena «${nome}» a ${at} s per ${dur} s${tolte ? ` (tolte ${tolte} grafiche nello stesso momento)` : ''}`;
}
