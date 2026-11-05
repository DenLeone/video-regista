// Passo 1 del flusso locale: dà alle immagini di una cartella il nome che il motore capisce
// (tipo-nome-anno.ext, vedi pc/rotolo/LEGGIMI.md), guardandole con un'AI locale che vede (Ollama).
//   node pc/locale/rinomina.mjs <cartella> [--applica] [--tutte] [--modello gemma4:12b]
// Senza --applica propone e basta: scrive <cartella>/rinomina.json e stampa vecchio → nuovo.
// Con --applica rinomina e tiene in rinomina.json l'elenco per tornare indietro (--annulla).
// Salta le immagini che hanno già un prefisso giusto (persona-, luogo-…), a meno di --tutte.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const opz = (k, d = '') => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const ha = (k) => args.includes(k);
const DIR = path.resolve(args[0] || '');
if (!args[0] || !fs.existsSync(DIR)) { console.error('uso: node pc/locale/rinomina.mjs <cartella> [--applica] [--tutte] [--annulla]'); process.exit(1); }
const OLLAMA = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const MODELLO = opz('--modello', process.env.MODELLO_VISTA || 'gemma4:12b');
const ELENCO = path.join(DIR, 'rinomina.json');
const log = (...a) => console.log('[rinomina]', ...a);

// ---------- annulla: rimette i nomi di prima
if (ha('--annulla')) {
  const fatte = JSON.parse(fs.readFileSync(ELENCO, 'utf8')).filter((x) => x.applicato);
  for (const x of fatte.reverse()) {
    if (fs.existsSync(path.join(DIR, x.nuovo)) && !fs.existsSync(path.join(DIR, x.vecchio))) { fs.renameSync(path.join(DIR, x.nuovo), path.join(DIR, x.vecchio)); log(`${x.nuovo} → ${x.vecchio}`); }
  }
  fs.rmSync(ELENCO);
  process.exit(0);
}

const TIPI = ['persona', 'luogo', 'documento', 'prodotto', 'ritaglio', 'logo', 'schermata', 'icona', 'grafica'];
const giaBuono = (n) => new RegExp(`^(${TIPI.join('|')}|overlay)-`, 'i').test(n);
const immagini = fs.readdirSync(DIR).filter((n) => /\.(jpe?g|png|webp)$/i.test(n) && (ha('--tutte') || !giaBuono(n))).sort();
if (!immagini.length) { log('niente da rinominare'); process.exit(0); }

const PROMPT = `Guarda l'immagine e classificala per un video documentario. Il nome attuale del file è "{{NOME}}": usalo come indizio (spesso dice già cosa è), ma fidati di quello che vedi.
Rispondi SOLO con JSON: {"tipo": "...", "nome": "...", "anno": "..."}
- tipo, uno di: persona (foto di una o più persone vere), luogo (edifici, città, paesaggi, interni), documento (giornali, lettere, contratti, pagine stampate), prodotto (un oggetto, un dispositivo, una confezione), logo (marchio o logo di un'azienda o app), schermata (screenshot di un sito, un'app, un programma), icona (simbolo grafico semplice), grafica (illustrazione, disegno, meme, immagine generata)
- nome: 1–4 parole in minuscolo separate da trattini, il più specifiche possibile: il nome proprio se lo riconosci con certezza (persona, prodotto, marchio, luogo), altrimenti cosa mostra (es. "donna-stressata-computer"). Niente parole inventate.
- anno: l'anno a 4 cifre solo se è scritto nell'immagine o nel nome del file o se è certo; altrimenti "".`;

// immagine ridotta (lato lungo 1024) in jpg per l'AI; trasparenza: PNG con canale alfa davvero usato
function ridotta(file) {
  const out = path.join(os.tmpdir(), `rinomina-${process.pid}.jpg`);
  spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-vf', "scale='min(1024,iw)':'min(1024,ih)':force_original_aspect_ratio=decrease,format=rgb24", '-frames:v', '1', out]);
  return fs.readFileSync(out).toString('base64');
}
function trasparente(file) {
  if (!/\.(png|webp)$/i.test(file)) return false;
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', 'alphaextract,scale=64:64,format=gray', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 20 });
  if (r.status !== 0 || !r.stdout?.length) return false;
  const px = [...r.stdout];
  return px.filter((v) => v < 128).length / px.length > 0.08; // almeno l'8% dell'immagine trasparente
}
async function chiedi(file, nome) {
  const r = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODELLO, stream: false, format: 'json', options: { temperature: 0.2 },
      messages: [{ role: 'user', content: PROMPT.replace('{{NOME}}', nome), images: [ridotta(file)] }] }),
    signal: AbortSignal.timeout(4 * 60 * 1000),
  });
  if (!r.ok) throw new Error(`Ollama ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const t = (await r.json()).message?.content || '';
  return JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
}
const pulito = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// parole vuote fuori ("telefono-all-interno-di-un" → "telefono-interno"), al massimo 4 parole piene
const VUOTE = new Set('di a da in con su per tra fra il lo la i gli le un uno una e ed o al allo alla ai agli alle del dello della dei degli delle nel nella sul sulla all che of the and with on in at a an to'.split(' '));

const proposte = [];
const usati = new Set(fs.readdirSync(DIR).map((n) => n.toLowerCase()));
for (const n of immagini) {
  const file = path.join(DIR, n);
  try {
    const t0 = Date.now();
    // il primo giro carica il modello in memoria: se scade, si riprova una volta
    const d = await chiedi(file, n).catch(() => chiedi(file, n));
    let tipo = TIPI.includes(d.tipo) ? d.tipo : 'grafica';
    if (trasparente(file)) tipo = 'ritaglio'; // PNG scontornato: cade senza cornice, qualunque cosa sia
    // anno solo se c'è già nel nome del file: quelli "riconosciuti" dall'AI spesso sono inventati
    const anno = /^(1[89]|20)\d\d$/.test(String(d.anno)) && n.includes(String(d.anno)) ? String(d.anno) : '';
    // niente parole doppie ("icona-icona-upload", "logo-claude-logo") né l'anno ripetuto nel nome
    const parole = pulito(d.nome).split('-').filter((w, i, a) => w && !VUOTE.has(w) && w !== tipo && w !== anno && a.indexOf(w) === i).slice(0, 4);
    const base = `${tipo}-${parole.join('-') || 'immagine'}${anno ? `-${anno}` : ''}`;
    const ext = path.extname(n).toLowerCase().replace('.jpeg', '.jpg');
    let nuovo = `${base}${ext}`;
    for (let i = 2; usati.has(nuovo.toLowerCase()) && nuovo.toLowerCase() !== n.toLowerCase(); i++) nuovo = `${base}-${i}${ext}`;
    usati.add(nuovo.toLowerCase());
    proposte.push({ vecchio: n, nuovo, applicato: false });
    log(`${n}  →  ${nuovo}   (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  } catch (e) { log(`${n}: non riuscita (${e.message})`); }
}

if (ha('--applica')) {
  for (const p of proposte) {
    if (p.vecchio === p.nuovo) continue;
    fs.renameSync(path.join(DIR, p.vecchio), path.join(DIR, p.nuovo));
    p.applicato = true;
  }
  log(`rinominate ${proposte.filter((p) => p.applicato).length}; per tornare indietro: --annulla`);
} else log('solo proposta: rilancia con --applica per rinominare');
fs.writeFileSync(ELENCO, JSON.stringify(proposte, null, 2));
