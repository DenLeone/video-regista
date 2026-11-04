// Rotolo: dalla cartella con l'audio e le foto al video finito, in un comando.
//   node pc/rotolo/rotolo.mjs <cartella> [--nome Nintendo] [--4k] [--brief "…"] [--rifai-regia] [--solo-render] [--uscita file.mp4]
// La cartella contiene: UN file audio (la voce: wav/mp3/m4a…) e le foto con il nome giusto
// (tipo-nome-anno, es. persona-hiroshi-yamauchi-1960.jpg; vedi pc/rotolo/LEGGIMI.md).
// Passi: trascrizione (Whisper sul PC, o Groq) → regia AI (beats.json) → prepara → suoni → render.
// beats.json viene copiato anche nella cartella di partenza: si può correggere a mano e rifare con --solo-render.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opz = (k, d = '') => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const ha = (k) => args.includes(k);
const SORG = path.resolve(args[0] || '');
if (!args[0] || !fs.existsSync(SORG)) { console.error('uso: node pc/rotolo/rotolo.mjs <cartella con audio e foto> [--nome X] [--4k]'); process.exit(1); }
const nome = opz('--nome', path.basename(SORG));
const slug = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'storia';
const CART = `collage/rotolo-${slug}`;
const LAV = path.join(ROOT, 'public', CART);
const log = (...a) => console.log('[rotolo]', ...a);
const run = (cmd, a, o = {}) => {
  // shell solo per npx su Windows (è un .cmd): con la shell i nomi con gli spazi si spezzerebbero
  const r = spawnSync(cmd, a, { stdio: 'inherit', cwd: ROOT, shell: process.platform === 'win32' && cmd === 'npx', ...o });
  if (r.status !== 0) throw new Error(`${cmd} ${a.slice(0, 2).join(' ')}… terminato con codice ${r.status}`);
};
fs.mkdirSync(LAV, { recursive: true });

// ---------- materiale: foto (webp → png) e voce
const file = fs.readdirSync(SORG);
for (const f of file.filter((n) => /\.(jpe?g|png|webp)$/i.test(n))) {
  const da = path.join(SORG, f);
  if (/\.webp$/i.test(f)) { const a = path.join(LAV, f.replace(/\.webp$/i, '.png')); if (!fs.existsSync(a)) run('ffmpeg', ['-v', 'error', '-y', '-i', da, a]); }
  else fs.copyFileSync(da, path.join(LAV, f));
}
const audio = file.filter((n) => /\.(wav|mp3|m4a|aac|flac|ogg|opus)$/i.test(n)).sort((a, b) => /voce|vo\b|audio|narr/i.test(b) - /voce|vo\b|audio|narr/i.test(a));
if (!audio.length) throw new Error(`nessun file audio in ${SORG}`);
if (audio.length > 1) log(`più audio, uso ${audio[0]}`);
const VOCE = path.join(LAV, 'voce.wav');
run('ffmpeg', ['-v', 'error', '-y', '-i', path.join(SORG, audio[0]), '-ac', '2', '-ar', '48000', VOCE]);

// ---------- trascrizione
const PAROLE = path.join(LAV, 'parole.json');
if (!fs.existsSync(PAROLE) || ha('--rifai-regia')) {
  const py = path.join(ROOT, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  if (fs.existsSync(py) && !process.env.GROQ_FORZA) {
    log('trascrizione con Whisper sul PC');
    run(py, [path.join(ROOT, 'pc', 'trascrivi.py'), VOCE, PAROLE, '--lingua', 'it']);
  } else if (process.env.GROQ_API_KEY) {
    log('trascrizione con Groq');
    const mp3 = path.join(os.tmpdir(), `${slug}-voce.mp3`);
    run('ffmpeg', ['-v', 'error', '-y', '-i', VOCE, '-ac', '1', '-ar', '16000', '-b:a', '48k', mp3]);
    const form = new FormData();
    form.append('file', new Blob([fs.readFileSync(mp3)]), 'voce.mp3');
    form.append('model', 'whisper-large-v3'); form.append('language', 'it');
    form.append('response_format', 'verbose_json'); form.append('timestamp_granularities[]', 'word');
    const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }, body: form });
    if (!r.ok) throw new Error(`Groq ${r.status}: ${await r.text()}`);
    fs.writeFileSync(PAROLE, JSON.stringify(((await r.json()).words || []).map((w) => ({ w: w.word, s: +w.start.toFixed(2), e: +w.end.toFixed(2) }))));
  } else throw new Error('per la trascrizione serve .venv (Whisper sul PC) o GROQ_API_KEY');
}

// ---------- regia
const BEATS = path.join(LAV, 'beats.json');
const nelSorgente = path.join(SORG, 'beats.json');
if (ha('--solo-render') && fs.existsSync(nelSorgente)) fs.copyFileSync(nelSorgente, BEATS);
else if (!fs.existsSync(BEATS) || ha('--rifai-regia')) {
  log('regia AI');
  run('node', [path.join(ROOT, 'pc', 'rotolo', 'regia.mjs'), PAROLE, LAV, BEATS, '--cartella', CART, ...(opz('--brief') ? ['--brief', opz('--brief')] : [])]);
}
const doc = JSON.parse(fs.readFileSync(BEATS, 'utf8'));
doc.titolo = doc.titolo || nome; doc.cartella = CART; doc.voce = 'voce.wav';
fs.writeFileSync(BEATS, JSON.stringify(doc, null, 2));
run('node', [path.join(ROOT, 'pc', 'rotolo', 'prepara.mjs'), BEATS]);
try { fs.copyFileSync(BEATS, nelSorgente); } catch { /* cartella in sola lettura: pazienza */ }

// ---------- suoni
const EVENTI = path.join(LAV, 'eventi.json');
run('node', ['--experimental-strip-types', '--no-warnings', path.join(ROOT, 'pc', 'rotolo', 'eventi.mjs'), BEATS, EVENTI]);
run(process.platform === 'win32' ? 'python' : 'python3', [path.join(ROOT, 'pc', 'rotolo', 'suoni.py'), EVENTI, VOCE, path.join(LAV, 'mix.wav')], { env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });

// ---------- render (con l'audio già mixato)
const props = { ...JSON.parse(fs.readFileSync(BEATS, 'utf8')), voce: 'mix.wav' };
const PROPS = path.join(LAV, 'props-render.json');
fs.writeFileSync(PROPS, JSON.stringify(props));
const uscita = path.resolve(opz('--uscita', path.join(ROOT, 'out', 'rotolo', `${slug}${ha('--4k') ? '-4k' : ''}.mp4`)));
fs.mkdirSync(path.dirname(uscita), { recursive: true });
const cpu = Math.max(2, Math.min(8, os.cpus().length - 1));
log(`render ${ha('--4k') ? '4K 2160×3840' : '1080×1920'} con ${cpu} processi`);
run('npx', ['remotion', 'render', 'src/index.ts', 'Rotolo', uscita, `--props=${PROPS}`, `--concurrency=${cpu}`, '--crf=20', ...(ha('--4k') ? [] : ['--scale=0.5'])]);
log(`fatto: ${uscita}`);
if (doc.note?.length) log(`note della regia:\n- ${[].concat(doc.note).join('\n- ')}`);
