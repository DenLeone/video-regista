// Passo 2 del flusso locale: pulizia del parlato. Dal video (o audio) e dalle parole di Whisper trova
// cosa togliere e scrive i tagli, con i tempi precisi.
//   node pc/locale/pulizia.mjs <video o audio> [--parole parole.json] [--uscita cartella] [--modello qwen3.8:27b]
//                              [--voce voce-sincronizzata.wav] [--silenzio 0.6] [--senza-ai] [--rifai-ai] [--senza-allinea] [--senza-anteprima]
// - silenzi: buchi tra le parole più lunghi di --silenzio secondi (niente AI)
// - ripetizioni, false partenze, autocorrezioni, intercalari: AI locale (Ollama) su un elenco di parole
//   numerate; risponde con intervalli di parole da togliere, che il codice controlla
// Scrive nella cartella di uscita (default: accanto al file, <nome>-pulizia/):
//   parole.json          trascrizione (se non c'era: Whisper sul PC, pc/trascrivi.py)
//   parole-allineate.json  le stesse parole con i tempi precisi (allineamento forzato, pc/locale/allinea.py)
//   tagli.json           { sorgente, durata, tieni:[{da,a}], togli:[{da,a,motivo,testo}] } in secondi del file originale
//   parole-pulite.json   le parole tenute, con i tempi già spostati sul video tagliato (per i passi dopo)
//   anteprima.mp4        720p tagliato, per ascoltare se i tagli sono giusti
import fs from 'node:fs';
import path from 'node:path';
import { chiediLocale } from './ollama.mjs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opz = (k, d = '') => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const ha = (k) => args.includes(k);
const SORG = path.resolve(args[0] || '');
if (!args[0] || !fs.existsSync(SORG)) { console.error('uso: node pc/locale/pulizia.mjs <video o audio> [--parole parole.json] [--uscita cartella]'); process.exit(1); }
const OUT = path.resolve(opz('--uscita', SORG.replace(/\.[^.]+$/, '') + '-pulizia'));
fs.mkdirSync(OUT, { recursive: true });
const OLLAMA = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const MODELLO = opz('--modello', process.env.MODELLO_PULIZIA || 'qwen3.8:27b');
const SILENZIO = Number(opz('--silenzio', '0.6'));
const MARGINE = 0.12; // aria lasciata prima e dopo il parlato intorno a ogni taglio
const log = (...a) => console.log('[pulizia]', ...a);
const durataDi = (f) => Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).stdout.trim());
const DURATA = durataDi(SORG);
// --voce: voce registrata a parte e già sincronizzata (pc/locale/sincronizza.py): si ascolta quella, non l'audio della camera
const AUDIO = opz('--voce') ? path.resolve(opz('--voce')) : SORG;

// ---------- 1. parole con i tempi
const PAROLE = path.join(OUT, 'parole.json');
if (opz('--parole')) fs.copyFileSync(path.resolve(opz('--parole')), PAROLE);
if (!fs.existsSync(PAROLE)) {
  const py = path.join(ROOT, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  const wav = path.join(OUT, 'voce16.wav');
  spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', AUDIO, '-vn', '-ac', '1', '-ar', '16000', wav], { stdio: 'inherit' });
  const r = spawnSync(py, [path.join(ROOT, 'pc', 'trascrivi.py'), wav, PAROLE, '--lingua', 'it'], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('trascrizione non riuscita');
  fs.rmSync(wav, { force: true });
}
// tempi precisi: allineamento forzato del testo sull'audio (pc/locale/allinea.py, modello MMS).
// I tempi di Whisper sbagliano anche di 0,3 s e i tagli lascerebbero pezzi di sillaba.
const ALLINEATE = path.join(OUT, 'parole-allineate.json');
if (!ha('--senza-allinea') && !fs.existsSync(ALLINEATE)) {
  const py = path.join(ROOT, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  const r = spawnSync(py, [path.join(ROOT, 'pc', 'locale', 'allinea.py'), AUDIO, PAROLE, ALLINEATE], { stdio: ['ignore', 'inherit', 'ignore'] });
  if (r.status !== 0) log('allineamento non riuscito: uso i tempi di Whisper (tagli meno precisi)');
}
const parole = JSON.parse(fs.readFileSync(!ha('--senza-allinea') && fs.existsSync(ALLINEATE) ? ALLINEATE : PAROLE, 'utf8'))
  .map(({ w, s, e }) => ({ w: w.trim(), s, e }));
log(`${parole.length} parole, ${DURATA.toFixed(1)} s`);

// ---------- 2. cosa togliere secondo l'AI (intervalli di indici di parola)
const PROMPT = `Sei il montatore di un video parlato di Denis, creator italiano. Ti do la trascrizione parola per parola, ogni parola con il suo numero.
Trova SOLO quello che un montatore taglierebbe per rendere il parlato pulito e scorrevole:
- ripetizioni immediate di una parola o di un pezzo di frase, anche con la virgola in mezzo (es. "4:casa, 5:casa" → togli 4)
- false partenze e frasi lasciate a metà e poi ricominciate
- autocorrezioni: togli dalla PRIMA parola sbagliata fino all'ultima parola prima di quella giusta, così resta solo la versione corretta (es. "10:compro 11:il 12:rosso, 13:no, 14:il 15:blu" → togli da 12 a 14, resta "compro il blu")
- intercalari vuoti (ehm, eh, cioè, tipo, niente, vabbè) SOLO quando non dicono niente
NON tagliare contenuto, battute, opinioni, espressioni naturali che danno ritmo. Nel dubbio non tagliare.
Ogni taglio deve lasciare una frase grammaticalmente corretta unendo la parola prima e quella dopo.

Rispondi SOLO con JSON: {"tagli": [{"da": <numero prima parola da togliere>, "a": <numero ultima parola da togliere>, "motivo": "ripetizione|falsa partenza|autocorrezione|intercalare"}]}
Se non c'è niente da togliere: {"tagli": []}

TRASCRIZIONE:
${parole.map((w, i) => `${i}:${w.w}`).join(' ')}`;


let tagliAI = [];
if (!ha('--senza-ai')) {
  const t0 = Date.now();
  // la risposta si riusa finché testo e modello sono gli stessi (--rifai-ai per chiederla di nuovo)
  const CACHE = path.join(OUT, 'ai.json');
  const chiave = `${MODELLO}
${PROMPT}`;
  const vecchia = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : null;
  let t;
  if (vecchia?.chiave === chiave && !ha('--rifai-ai')) { t = vecchia.risposta; log('AI: risposta già pronta (stesso testo)'); }
  else {
    t = await chiediLocale(PROMPT, { modello: MODELLO, temperatura: 0.1 });
    // in cache solo una risposta che è JSON valido (una troncata si richiede al giro dopo)
    try { JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); fs.writeFileSync(CACHE, JSON.stringify({ chiave, risposta: t })); } catch { console.log('[cache] risposta non valida, non la salvo'); }
  }
  log(`AI (${MODELLO}) in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  const d = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
  // controllo: indici veri, in ordine, non più di 15 parole per taglio, niente sovrapposizioni
  for (const x of [].concat(d.tagli || [])) {
    const da = Math.round(x.da), a = Math.round(x.a ?? x.da);
    if (!(da >= 0 && a >= da && a < parole.length)) { log(`scartato (indici fuori): ${JSON.stringify(x)}`); continue; }
    if (a - da + 1 > 15) { log(`scartato (troppo lungo, ${a - da + 1} parole): ${parole.slice(da, a + 1).map((w) => w.w).join(' ')}`); continue; }
    if (tagliAI.some((y) => da <= y.a && a >= y.da)) continue;
    tagliAI.push({ da, a, motivo: String(x.motivo || 'taglio') });
    log(`AI: togli ${da}–${a} (${x.motivo}): "${parole.slice(da, a + 1).map((w) => w.w).join(' ')}"`);
  }
  tagliAI.sort((p, q) => p.da - q.da);
  const tolte = tagliAI.reduce((s, x) => s + x.a - x.da + 1, 0);
  if (tolte > parole.length * 0.3) { log(`l'AI toglie ${tolte} parole su ${parole.length}: troppe, non mi fido e tengo solo i silenzi`); tagliAI = []; }
}

// ---------- 3. tempi: parole tenute → tratti da tenere, con i silenzi accorciati
const via = new Set(tagliAI.flatMap((x) => Array.from({ length: x.a - x.da + 1 }, (_, k) => x.da + k)));
const tenute = parole.map((w, i) => ({ ...w, i })).filter((w) => !via.has(w.i));
// tratti: parole tenute consecutive (nell'originale) e vicine nel tempo stanno nello stesso tratto
const tieni = [];
for (const w of tenute) {
  const u = tieni.at(-1);
  if (u && w.i === u.ultima + 1 && w.s - u.fine <= SILENZIO) { u.fine = w.e; u.ultima = w.i; }
  else tieni.push({ inizio: w.s, fine: w.e, prima: w.i, ultima: w.i });
}
// aria intorno al parlato, senza superare il tratto vicino né i bordi del file
tieni.forEach((x, k) => {
  const prima = k > 0 ? tieni[k - 1].fine : 0, dopo = k < tieni.length - 1 ? tieni[k + 1].inizio : DURATA;
  // Whisper mette le parole attaccate: l'aria non deve mai entrare nella parola vicina (tolta o no)
  // il limite è a metà dell'aria tra le due parole: gli attacchi (s, f, l) hanno poca energia e
  // l'allineamento li colloca un po' tardi; tagliare proprio sul bordo ne lascerebbe un pezzo
  const finePrec = x.prima > 0 ? (parole[x.prima - 1].e + x.inizio) / 2 : 0;
  const inizioSucc = x.ultima < parole.length - 1 ? (x.fine + parole[x.ultima + 1].s) / 2 : DURATA;
  x.finePrec = finePrec; x.inizioSucc = inizioSucc;
  x.da = +Math.max(0, x.inizio - MARGINE, (prima + x.inizio) / 2, finePrec).toFixed(3);
  x.a = +Math.min(DURATA, x.fine + MARGINE, (x.fine + dopo) / 2, inizioSucc).toFixed(3);
});
// ogni giuntura dentro il parlato si sposta sul punto più silenzioso entro ±80 ms: i tempi di Whisper
// sbagliano di qualche centesimo e un taglio esatto sulla parola rischia di mangiare una sillaba
{
  const SR = 16000;
  const pcm = spawnSync('ffmpeg', ['-v', 'error', '-i', AUDIO, '-vn', '-ac', '1', '-ar', String(SR), '-f', 's16le', '-'], { maxBuffer: 1 << 30 }).stdout;
  const campioni = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length >> 1);
  const energia = (t) => { // RMS su 10 ms centrati in t
    const c = Math.round(t * SR), m = 80;
    let e = 0;
    for (let i = Math.max(0, c - m); i < Math.min(campioni.length, c + m); i++) e += campioni[i] * campioni[i];
    return e;
  };
  const quieto = (t, min, max) => {
    let best = t, bestE = energia(t);
    for (let d = -0.08; d <= 0.08001; d += 0.005) {
      const u = t + d;
      if (u < min || u > max) continue;
      const e = energia(u);
      if (e < bestE) { best = u; bestE = e; }
    }
    return +best.toFixed(3);
  };
  tieni.forEach((x, k) => {
    const prec = k > 0 ? tieni[k - 1].a : 0, succ = k < tieni.length - 1 ? tieni[k + 1].da : DURATA;
    // mai dentro la parola vicina (tolta o tenuta): solo nell'aria tra le due
    if (x.da > 0) x.da = quieto(x.da, Math.max(prec + 0.02, x.finePrec), x.inizio);
    if (x.a < DURATA) x.a = quieto(x.a, x.fine, Math.min(succ - 0.02, x.inizioSucc));
  });
}
const togli = [];
let cursore = 0;
for (const x of tieni) { if (x.da - cursore > 0.05) togli.push({ da: +cursore.toFixed(3), a: x.da }); cursore = x.a; }
if (DURATA - cursore > 0.05) togli.push({ da: +cursore.toFixed(3), a: +DURATA.toFixed(3) });
// motivo e testo di ogni pezzo tolto
for (const t of togli) {
  const dentro = parole.filter((w) => (w.s + w.e) / 2 > t.da && (w.s + w.e) / 2 < t.a);
  const ai = tagliAI.find((x) => dentro.some((w) => parole.indexOf(w) >= x.da && parole.indexOf(w) <= x.a));
  t.motivo = ai ? ai.motivo : 'silenzio';
  t.testo = dentro.map((w) => w.w).join(' ');
}
const tenuto = tieni.reduce((s, x) => s + x.a - x.da, 0);
fs.writeFileSync(path.join(OUT, 'tagli.json'), JSON.stringify({ sorgente: SORG, ...(AUDIO !== SORG ? { voce: AUDIO } : {}), durata: +DURATA.toFixed(3), durataPulita: +tenuto.toFixed(3), modello: ha('--senza-ai') ? null : MODELLO,
  // parlaDa/parlaA: dove inizia e finisce il parlato del tratto (per arrotondare ai fotogrammi senza tagliarlo)
  tieni: tieni.map(({ da, a, inizio, fine }) => ({ da, a, parlaDa: +inizio.toFixed(3), parlaA: +fine.toFixed(3) })), togli }, null, 2));

// parole sul video tagliato: ogni tratto si sposta indietro di quanto è stato tolto prima
let spost = 0;
const pulite = [];
tieni.forEach((x, k) => {
  spost += x.da - (k > 0 ? tieni[k - 1].a : 0);
  for (const w of tenute) if (w.i >= x.prima && w.i <= x.ultima) pulite.push({ w: w.w, s: +(w.s - spost).toFixed(3), e: +(w.e - spost).toFixed(3) });
});
fs.writeFileSync(path.join(OUT, 'parole-pulite.json'), JSON.stringify(pulite));

log(`tolti ${togli.length} pezzi: ${DURATA.toFixed(1)} s → ${tenuto.toFixed(1)} s`);
for (const t of togli) log(`  ${t.da.toFixed(2)}–${t.a.toFixed(2)}  ${t.motivo.padEnd(14)} ${t.testo ? `"${t.testo}"` : ''}`);

// ---------- 4. anteprima tagliata (720p) con micro-dissolvenze audio per non sentire i clic
if (!ha('--senza-anteprima')) {
  const video = /\.(mp4|mov|mkv|m4v|webm)$/i.test(SORG);
  const f = [];
  tieni.forEach((x, k) => {
    if (video) f.push(`[0:v]trim=${x.da}:${x.a},setpts=PTS-STARTPTS,scale=-2:720[v${k}]`);
    f.push(`[${AUDIO !== SORG ? 1 : 0}:a]atrim=${x.da}:${x.a},asetpts=PTS-STARTPTS,afade=t=in:d=0.01,afade=t=out:st=${Math.max(0, x.a - x.da - 0.01).toFixed(3)}:d=0.01[a${k}]`);
  });
  f.push(`${tieni.map((_, k) => (video ? `[v${k}][a${k}]` : `[a${k}]`)).join('')}concat=n=${tieni.length}:v=${video ? 1 : 0}:a=1${video ? '[v]' : ''}[a]`);
  const uscita = path.join(OUT, video ? 'anteprima.mp4' : 'anteprima.m4a');
  const fileFiltri = path.join(OUT, 'filtri.txt');
  fs.writeFileSync(fileFiltri, f.join(';\n'));
  const enc = video ? ['-map', '[v]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24'] : [];
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', SORG, ...(AUDIO !== SORG ? ['-i', AUDIO] : []), '-/filter_complex', fileFiltri, ...enc, '-map', '[a]', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', uscita], { stdio: 'inherit' });
  fs.rmSync(fileFiltri, { force: true });
  log(r.status === 0 ? `anteprima: ${uscita}` : 'anteprima non riuscita');
}
