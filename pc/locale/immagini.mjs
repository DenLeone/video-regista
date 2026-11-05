// Passo 4 del flusso locale: quali immagini vanno su quali parole, sul video già pulito.
//   node pc/locale/immagini.mjs <cartella -pulizia> <cartella immagini> [--modello qwen3.8:27b] [--pensa no|low] [--rifai-ai] [--max 3.5]
// 1. codice: per ogni immagine le parole del nome (tipo-nome.ext, passo 1) e dove il parlato le dice
// 2. AI locale (Ollama), un tratto di ~10 s alla volta: sceglie quali immagini usare e su quale parola, anche per
//    sinonimi e descrizioni; risponde con indici di parola che il codice controlla (file vero, una volta sola, distanze)
// Scrive <cartella -pulizia>/immagini.json: { cartella, elementi: [{ file, i, parola, inizio, durata, motivo }] }
// con i tempi sul video tagliato (parole-pulite.json), pronti per la timeline.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { chiediLocale } from './ollama.mjs';

const args = process.argv.slice(2);
const opz = (k, d = '') => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const ha = (k) => args.includes(k);
const [dirPulizia, dirImmagini] = args.map((a) => path.resolve(a || ''));
if (!args[1] || !fs.existsSync(dirPulizia) || !fs.existsSync(dirImmagini)) {
  console.error('uso: node pc/locale/immagini.mjs <cartella -pulizia> <cartella immagini>'); process.exit(1);
}
const OLLAMA = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const MODELLO = opz('--modello', process.env.MODELLO_IMMAGINI || 'qwen3.8:27b');
const MAX = Number(opz('--max', '3.5')); // secondi al massimo per immagine
const MIN = 1.2;                          // secondi minimi: meno non si legge
const log = (...a) => console.log('[immagini]', ...a);

const parole = JSON.parse(fs.readFileSync(path.join(dirPulizia, 'parole-pulite.json'), 'utf8'));
const tagli = JSON.parse(fs.readFileSync(path.join(dirPulizia, 'tagli.json'), 'utf8'));
const FINE = tagli.durataPulita;
// immagini, GIF e clip brevi (fino a 20 s: il video principale e le registrazioni lunghe restano fuori)
const durata = (f) => Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).stdout.trim()) || 0;
const immagini = fs.readdirSync(dirImmagini).filter((n) => /\.(jpe?g|png|webp|gif)$/i.test(n) || (/\.(mp4|mov|m4v|webm)$/i.test(n) && durata(path.join(dirImmagini, n)) <= 20)).sort();
if (!immagini.length) { log('nessuna immagine nella cartella'); process.exit(1); }

// ---------- 1. corrispondenze dal nome (senza AI)
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const radice = (w) => (w.length > 4 ? w.replace(/[aeio]$/, '') : w); // vienna/vienn, edifici/edific
const TIPI = new Set(['persona', 'luogo', 'documento', 'prodotto', 'ritaglio', 'logo', 'schermata', 'icona', 'grafica', 'overlay']);
const VUOTE = new Set('di a da in con su per tra fra il lo la i gli le un uno una e ed o del della dei nel nella sul che jpg png webp'.split(' '));
const chiavi = (n) => norm(n.replace(/\.[^.]+$/, '').replace(/^\d+[_-]/, '')).split(' ').filter((w) => w.length > 2 && !TIPI.has(w) && !VUOTE.has(w) && !/^\d+$/.test(w));
const pr = parole.map((w) => radice(norm(w.w)));
const indizi = immagini.map((f) => {
  const k = chiavi(f).map(radice);
  const dove = pr.map((w, i) => (w && k.includes(w) ? i : -1)).filter((i) => i >= 0);
  return { file: f, chiavi: chiavi(f), dove };
});
if (immagini.length <= 30) for (const x of indizi) log(`${x.file}: ${x.dove.length ? `detto in ${x.dove.map((i) => `${i}:${parole[i].w}`).join(', ')}` : 'mai nominato per nome'}`);

// ---------- 2. scelta dell'AI, a tratti di ~10 s
// Una richiesta per tratto con poche parole e le immagini non ancora usate: risposte brevi, niente contesto pieno.
// (Una richiesta unica con 115 immagini faceva ragionare il modello per 20+ minuti e riempiva il contesto.)
const TRATTO = 10;
const tratti = [];
{
  let cur = [];
  parole.forEach((w, i) => {
    cur.push(i);
    const lungo = w.e - parole[cur[0]].s;
    const finale = /[.!?]$/.test(w.w.trim());
    if ((lungo >= TRATTO && finale) || lungo >= TRATTO * 1.6) { tratti.push(cur); cur = []; }
  });
  if (cur.length) tratti.push(cur);
}
const ORDINE = immagini.filter((n) => /^\d+[_-]/.test(n)).length > immagini.length / 2
  ? '\nIl numero all\'inizio del nome (01_, 02_…) è l\'ordine in cui Denis parla degli argomenti: preferisci immagini con numeri vicini a quelli già usati prima.' : '';
const domanda = (tr, libere, prima) => `Sei il montatore di un video parlato di Denis. Metti immagini sopra il video, ognuna nel momento in cui il parlato nomina o descrive quello che mostra.
Questo è un TRATTO del parlato (${parole[tr[0]].s.toFixed(1)}–${parole[tr.at(-1)].e.toFixed(1)} s), parola per parola con il numero:
${tr.map((i) => `${i}:${parole[i].w}`).join(' ')}
${prima ? `\nNel tratto prima avevi messo: ${prima}.` : ''}${ORDINE}

Scegli ${Math.max(1, Math.round((parole[tr.at(-1)].e - parole[tr[0]].s) / 3.5))} immagini (circa una ogni 3–4 s) tra quelle sotto, ognuna su una parola diversa, lontane almeno 1,5 s (tranne negli elenchi di nomi, dove ognuno ha la sua). Solo immagini che mostrano davvero quello che si dice (anche sinonimi o descrizioni; i nomi dei file possono essere in inglese). Se nessuna c'entra, non metterne. I file .mp4/.gif sono clip in movimento.
"i" = numero della parola su cui compare (quella che la nomina o l'inizio della frase che la descrive).

Rispondi SOLO con JSON: {"immagini": [{"file": "<nome esatto>", "i": <numero>, "motivo": "<cosa dice>"}]}

IMMAGINI:
${libere.join('\n')}`;

const CACHE = path.join(dirPulizia, 'immagini-ai.json');
const cache = (() => { try { const c = JSON.parse(fs.readFileSync(CACHE, 'utf8')); return c && !c.chiave ? c : {}; } catch { return {}; } })();
const PENSA_TRATTI = opz('--pensa', 'no');
const d = { immagini: [] };
const usate = new Set();
const t0 = Date.now();
let prima = '';
for (const [k, tr] of tratti.entries()) {
  const libere = immagini.filter((n) => !usate.has(n));
  if (!libere.length) break;
  const prompt = domanda(tr, libere, prima);
  const chiave = `${MODELLO}|${PENSA_TRATTI}\n${prompt}`;
  let t = !ha('--rifai-ai') && cache[chiave];
  if (!t) {
    t = await chiediLocale(prompt, { modello: MODELLO, temperatura: 0.1, pensa: PENSA_TRATTI });
    try { JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); cache[chiave] = t; fs.writeFileSync(CACHE, JSON.stringify(cache)); } catch { log(`tratto ${k}: risposta non valida`); continue; }
  }
  const r = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
  const messe = [];
  for (const x of [].concat(r.immagini || [])) {
    const i = Math.round(x.i);
    if (!tr.includes(i)) continue; // parola fuori dal tratto
    d.immagini.push(x);
    const f = immagini.find((n) => n.toLowerCase() === String(x.file || '').toLowerCase());
    if (f) { usate.add(f); messe.push(f); }
  }
  prima = messe.join(', ');
  log(`tratto ${k + 1}/${tratti.length} (${parole[tr[0]].s.toFixed(0)}–${parole[tr.at(-1)].e.toFixed(0)} s): ${messe.length ? messe.join(', ') : 'nessuna'}`);
}
log(`AI (${MODELLO}, ragionamento ${PENSA_TRATTI}) in ${((Date.now() - t0) / 1000).toFixed(0)} s per ${tratti.length} tratti`);

// ---------- 3. controllo e tempi
const scelte = [];
for (const x of [].concat(d.immagini || [])) {
  const file = immagini.find((n) => n.toLowerCase() === String(x.file || '').toLowerCase());
  const i = Math.round(x.i);
  if (!file) { log(`scartata: "${x.file}" non esiste`); continue; }
  if (!(i >= 0 && i < parole.length)) { log(`scartata: ${file}, parola ${x.i} fuori dal testo`); continue; }
  if (scelte.some((s) => s.file === file)) { log(`scartata: ${file} usata due volte`); continue; }
  scelte.push({ file, i, motivo: String(x.motivo || '') });
}
scelte.sort((a, b) => a.i - b.i);
const elementi = [];
for (const s of scelte) {
  const inizio = parole[s.i].s;
  const prima = elementi.at(-1);
  // almeno MIN secondi dall'immagine prima: sotto non si legge
  if (prima && inizio - prima.inizio < MIN) { log(`scartata: ${s.file} troppo vicina a ${prima.file}`); continue; }
  elementi.push({ ...s, parola: parole[s.i].w, inizio: +inizio.toFixed(3) });
}
// durata: fino all'immagine dopo (con 0,2 s di stacco, attaccate se sono un elenco), al massimo MAX, mai oltre la fine
elementi.forEach((e, k) => {
  const succ = elementi[k + 1];
  const dopo = succ ? succ.inizio - (succ.inizio - e.inizio < 1.5 ? 0 : 0.2) : FINE;
  e.durata = +Math.min(MAX, dopo - e.inizio, FINE - e.inizio).toFixed(3);
});
// l'ultima, se cade a ridosso della fine, si anticipa per durare almeno MIN (senza sovrapporsi alla precedente)
const ultima = elementi.at(-1);
if (ultima && ultima.durata < MIN) {
  const prec = elementi.at(-2);
  const inizio = Math.max(prec ? prec.inizio + prec.durata + 0.2 : 0, FINE - MIN);
  if (FINE - inizio >= MIN * 0.8) { ultima.inizio = +inizio.toFixed(3); ultima.durata = +(FINE - inizio).toFixed(3); }
  else { log(`tolta: ${ultima.file}, solo ${ultima.durata} s prima della fine`); elementi.pop(); }
}
fs.writeFileSync(path.join(dirPulizia, 'immagini.json'), JSON.stringify({ cartella: dirImmagini, elementi }, null, 2));
log(`${elementi.length} immagini su ${immagini.length}:`);
for (const e of elementi) log(`  ${e.inizio.toFixed(2).padStart(6)} s  ${e.durata.toFixed(1)} s  "${e.parola}"  ${e.file}  (${e.motivo})`);
const nonUsate = immagini.filter((n) => !elementi.some((e) => e.file === n));
if (nonUsate.length) log(`non usate: ${nonUsate.join(', ')}`);
