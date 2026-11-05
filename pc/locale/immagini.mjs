// Passo 4 del flusso locale: quali immagini vanno su quali parole, sul video già pulito.
//   node pc/locale/immagini.mjs <cartella -pulizia> <cartella immagini> [--modello qwen3.8:27b] [--pensa low] [--rifai-ai] [--max 3.5]
// 1. codice: per ogni immagine le parole del nome (tipo-nome.ext, passo 1) e dove il parlato le dice
// 2. AI locale (Ollama): sceglie quali immagini usare e su quale parola, anche per sinonimi e descrizioni;
//    risponde con indici di parola che il codice controlla (file vero, una volta sola, distanze minime)
// Scrive <cartella -pulizia>/immagini.json: { cartella, elementi: [{ file, i, parola, inizio, durata, motivo }] }
// con i tempi sul video tagliato (parole-pulite.json), pronti per la timeline.
import fs from 'node:fs';
import path from 'node:path';

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
// ragionamento del modello (qwen3.8: low|medium|xhigh, no = spento): low basta per questo compito ed è molto più veloce
const PENSA = opz('--pensa', 'low');
const log = (...a) => console.log('[immagini]', ...a);

const parole = JSON.parse(fs.readFileSync(path.join(dirPulizia, 'parole-pulite.json'), 'utf8'));
const tagli = JSON.parse(fs.readFileSync(path.join(dirPulizia, 'tagli.json'), 'utf8'));
const FINE = tagli.durataPulita;
const immagini = fs.readdirSync(dirImmagini).filter((n) => /\.(jpe?g|png|webp)$/i.test(n)).sort();
if (!immagini.length) { log('nessuna immagine nella cartella'); process.exit(1); }

// ---------- 1. corrispondenze dal nome (senza AI)
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const radice = (w) => (w.length > 4 ? w.replace(/[aeio]$/, '') : w); // vienna/vienn, edifici/edific
const TIPI = new Set(['persona', 'luogo', 'documento', 'prodotto', 'ritaglio', 'logo', 'schermata', 'icona', 'grafica', 'overlay']);
const VUOTE = new Set('di a da in con su per tra fra il lo la i gli le un uno una e ed o del della dei nel nella sul che jpg png webp'.split(' '));
const chiavi = (n) => norm(n.replace(/\.[^.]+$/, '')).split(' ').filter((w) => w.length > 2 && !TIPI.has(w) && !VUOTE.has(w) && !/^\d+$/.test(w));
const pr = parole.map((w) => radice(norm(w.w)));
const indizi = immagini.map((f) => {
  const k = chiavi(f).map(radice);
  const dove = pr.map((w, i) => (w && k.includes(w) ? i : -1)).filter((i) => i >= 0);
  return { file: f, chiavi: chiavi(f), dove };
});
for (const x of indizi) log(`${x.file}: ${x.dove.length ? `detto in ${x.dove.map((i) => `${i}:${parole[i].w}`).join(', ')}` : 'mai nominato per nome'}`);

// ---------- 2. scelta dell'AI
const PROMPT = `Sei il montatore di un video parlato di Denis. Devi mettere delle immagini sopra il video, ognuna nel momento in cui il parlato nomina o descrive quello che mostra.
Ti do la trascrizione parola per parola (ogni parola col suo numero) e le immagini disponibili, con le parole del parlato che corrispondono al loro nome (se ci sono).

Regole:
- metti un'immagine SOLO dove il parlato parla davvero di quello che mostra (la persona, il luogo, l'oggetto); va bene anche un sinonimo o una descrizione ("edifici antichi" → foto di palazzi storici)
- "i" = il numero della parola su cui l'immagine compare (la parola che la nomina, o l'inizio della frase che la descrive)
- ogni immagine al massimo una volta; immagini che non c'entrano con niente di detto: non usarle
- di norma almeno 1,5 secondi tra un'immagine e la successiva (guarda i tempi delle parole); ECCEZIONE: quando il parlato elenca più persone, luoghi o cose di fila ("sia Lenin che Hitler"), ognuno ha la sua immagine sulla sua parola anche se sono vicine

Rispondi SOLO con JSON: {"immagini": [{"file": "<nome esatto del file>", "i": <numero parola>, "motivo": "<cosa dice il parlato>"}]}

IMMAGINI:
${indizi.map((x) => `- ${x.file}${x.dove.length ? `  (nominata alle parole ${x.dove.join(', ')})` : ''}`).join('\n')}

TRASCRIZIONE (numero:parola@secondo):
${parole.map((w, i) => `${i}:${w.w}@${w.s.toFixed(1)}`).join(' ')}`;

async function chiedi(prompt) {
  const r = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    // in streaming: senza, fetch di Node smette di aspettare dopo 300 s
    body: JSON.stringify({ model: MODELLO, stream: true, format: 'json', ...(PENSA ? { think: PENSA === 'no' ? false : PENSA } : {}), messages: [{ role: 'user', content: prompt }], options: { temperature: 0.1, num_ctx: 16384 } }),
    signal: AbortSignal.timeout(30 * 60 * 1000),
  });
  if (!r.ok) throw new Error(`Ollama ${r.status}: ${(await r.text()).slice(0, 200)}`);
  let testo = '', resto = '';
  const dec = new TextDecoder();
  for await (const pezzo of r.body) {
    resto += dec.decode(pezzo, { stream: true });
    const righe = resto.split('\n');
    resto = righe.pop();
    for (const riga of righe) if (riga.trim()) testo += JSON.parse(riga).message?.content || '';
  }
  if (resto.trim()) testo += JSON.parse(resto).message?.content || '';
  return testo;
}
const CACHE = path.join(dirPulizia, 'immagini-ai.json');
const chiave = `${MODELLO}\n${PROMPT}`;
const vecchia = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : null;
let t;
if (vecchia?.chiave === chiave && !ha('--rifai-ai')) { t = vecchia.risposta; log('AI: risposta già pronta'); }
else {
  const t0 = Date.now();
  t = await chiedi(PROMPT);
  log(`AI (${MODELLO}) in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  fs.writeFileSync(CACHE, JSON.stringify({ chiave, risposta: t }));
}
const d = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));

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
  if (prima && inizio - prima.inizio < 0.6) { log(`scartata: ${s.file} troppo vicina a ${prima.file}`); continue; }
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
