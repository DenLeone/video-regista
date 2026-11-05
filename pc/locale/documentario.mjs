// Flusso locale completo, un comando: dal tuo video (tu che parli) e da una cartella di immagini alla timeline
// in DaVinci con il video tagliato che si muove e la grafica Rotolo/Tech sopra. Niente token: AI locali (Ollama).
//   node pc/locale/documentario.mjs <video> <cartella immagini> [--mondo tech|rotolo] [--titolo X] [--4k]
//                                   [--rinomina] [--uscita cartella] [--senza-davinci] [--con-davinci] [--sottotitoli WATER|no]
// DaVinci va tenuto CHIUSO: lo apre lo script all'ultimo passo (aperto, rallenta l'AI fino a 50 volte).
// Passi (ognuno salta se ha già il risultato, le risposte delle AI si riusano):
//   1. voce: se nella cartella del video c'è un file audio (o --voce), si sincronizza e sostituisce l'audio della camera
//   [--rinomina] nomi delle immagini (gemma4: le rinomina davvero, --annulla con rinomina.mjs)
//   2. pulizia del parlato (Whisper + allineamento + qwen3.8) → tagli
//   3. immagini sulle parole (qwen3.8)
//   4. regia (beats.json, testi da qwen3.8)
//   5. grafica trasparente (Remotion, ProRes 4444; 1080×1920, --4k per la piena risoluzione)
//   6. movimento del presentatore (stessa geometria della lastra)
//   7. suoni: eventi dalla regia, SFX + musica (con ducking sotto la voce) + ambiente come tracce separate
//   8. timeline in DaVinci (deve essere aperto, External scripting: Local): V1 tu, V2 grafica, A1 voce, A2–A4 suoni
// Lavoro in work/locale/<nome>/ (o --uscita), grafica in out/locale/.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opz = (k, d = '') => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const ha = (k) => args.includes(k);
const VIDEO = path.resolve(args[0] || ''), IMM = path.resolve(args[1] || '');
if (!args[1] || !fs.existsSync(VIDEO) || !fs.existsSync(IMM)) {
  console.error('uso: node pc/locale/documentario.mjs <video> <cartella immagini> [--mondo tech|rotolo] [--titolo X] [--4k] [--rinomina]'); process.exit(1);
}
const titolo = opz('--titolo', path.basename(path.dirname(VIDEO)));
const slug = titolo.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
const LAV = path.resolve(opz('--uscita', path.join(ROOT, 'work', 'locale', slug)));
const PUL = path.join(LAV, 'pulizia');
fs.mkdirSync(PUL, { recursive: true });
const PY = path.join(ROOT, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const t00 = Date.now();
const passo = (n, testo) => console.log(`\n[documentario] ${n}. ${testo}  (${((Date.now() - t00) / 60000).toFixed(1)} min)`);
const run = (cmd, a, o = {}) => {
  const r = spawnSync(cmd, a, { stdio: 'inherit', cwd: ROOT, shell: process.platform === 'win32' && cmd === 'npx', ...o });
  if (r.status !== 0) { console.error(`[documentario] fermo: ${path.basename(cmd)} ${a[0] ? path.basename(String(a[0])) : ''} è uscito con ${r.status}`); process.exit(1); }
};
const node = (script, a, o) => run('node', [path.join(ROOT, 'pc', 'locale', script), ...a], o);

// DaVinci aperto tiene ~6 GB della scheda video: il modello AI non ci sta più e Windows lo sposta nella RAM.
// Misurato su RTX 5070 Ti 16 GB: qwen3.8:27b 28 → 4,5 token/s, gpt-oss:20b 156 → 3 token/s. Quindi DaVinci si apre
// solo all'ultimo passo (lo apre questo script); se è già aperto ci si ferma, salvo --con-davinci.
const RESOLVE_EXE = 'C:\\Program Files\\Blackmagic Design\\DaVinci Resolve\\Resolve.exe';
const davinciAperto = () => process.platform === 'win32' && /Resolve\.exe/i.test(spawnSync('tasklist', ['/FI', 'IMAGENAME eq Resolve.exe'], { encoding: 'utf8' }).stdout || '');
if (davinciAperto() && !ha('--con-davinci') && !ha('--senza-davinci')) {
  console.error("[documentario] fermo: DaVinci Resolve è aperto e occupa la scheda video (l'AI andrebbe fino a 50 volte più lenta). Chiudilo: lo apro io all'ultimo passo. Per andare avanti lo stesso: --con-davinci");
  process.exit(1);
}

// misure e frame rate del video
const info = JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate', '-of', 'json', VIDEO], { encoding: 'utf8' }).stdout).streams[0];
const [fn, fd] = info.r_frame_rate.split('/').map(Number);
const FPS_VIDEO = fn / (fd || 1);
// timeline e grafica: verticale 2160×3840 a 29,97 (o --fps); il video può essere orizzontale e a 59,94
const FPS = Number(opz('--fps', 30000 / 1001));
const TW = 2160, TH = 3840;
console.log(`[documentario] ${path.basename(VIDEO)}: ${info.width}×${info.height} a ${FPS_VIDEO.toFixed(3)} fps → timeline ${TW}×${TH} a ${FPS.toFixed(3)} fps, lavoro in ${LAV}`);

// voce registrata a parte: un file audio nella cartella del video (o --voce). Si sincronizza con l'audio della camera.
const audioCartella = fs.readdirSync(path.dirname(VIDEO)).filter((n) => /\.(wav|mp3|m4a|aac|flac)$/i.test(n));
const VOCE_EXT = opz('--voce') ? path.resolve(opz('--voce')) : audioCartella.length === 1 ? path.join(path.dirname(VIDEO), audioCartella[0]) : null;
if (!opz('--voce') && audioCartella.length > 1) console.log(`[documentario] più file audio nella cartella (${audioCartella.join(', ')}): uso l'audio della camera. Scegli con --voce`);
let VOCE_SYNC = null;
if (VOCE_EXT && !ha('--senza-voce')) {
  passo(1, `sincronizzazione della voce (${path.basename(VOCE_EXT)})`);
  VOCE_SYNC = path.join(LAV, 'voce-sincronizzata.wav');
  if (!fs.existsSync(VOCE_SYNC)) run(process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), [path.join(ROOT, 'pc', 'locale', 'sincronizza.py'), VIDEO, VOCE_EXT, VOCE_SYNC]);
}

if (ha('--rinomina')) { passo(1, 'nomi delle immagini'); node('rinomina.mjs', [IMM, '--applica']); }

passo(2, 'pulizia del parlato');
node('pulizia.mjs', [VIDEO, '--uscita', PUL, '--senza-anteprima', ...(VOCE_SYNC ? ['--voce', VOCE_SYNC] : [])]);

passo(3, 'immagini sulle parole');
node('immagini.mjs', [PUL, IMM]);

passo(4, 'regia');
node('regia.mjs', [PUL, '--mondo', opz('--mondo', 'tech'), '--titolo', titolo]);
const beats = JSON.parse(fs.readFileSync(path.join(PUL, 'beats.json'), 'utf8'));

passo(5, 'grafica trasparente (Remotion)');
const PROPS = path.join(LAV, 'props-grafica.json');
fs.writeFileSync(PROPS, JSON.stringify({ ...beats, soloGrafica: true, fps: FPS }));
fs.mkdirSync(path.join(ROOT, 'out', 'locale'), { recursive: true });
// nome nuovo a ogni render: un .mov già importato in DaVinci è bloccato e non si sovrascrive
const GRAFICA = path.join(ROOT, 'out', 'locale', `${slug}-grafica-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}.mov`);
const cpu = Math.max(2, Math.min(8, (await import('node:os')).cpus().length - 1));
run('npx', ['remotion', 'render', 'src/index.ts', 'Rotolo', GRAFICA, `--props=${PROPS}`, '--codec=prores', '--prores-profile=4444',
  '--pixel-format=yuva444p10le', '--image-format=png', `--concurrency=${cpu}`, ...(ha('--4k') ? [] : ['--scale=0.5'])]);

passo(6, 'movimento del presentatore');
const LASTRA = path.join(PUL, 'lastra.json');
run('node', ['--experimental-strip-types', '--no-warnings', path.join(ROOT, 'pc', 'locale', 'lastra.mjs'), path.join(PUL, 'beats.json'), LASTRA,
  '--fps', String(FPS), '--w', String(TW), '--h', String(TH)]);

passo(7, 'suoni: SFX, musica e ambiente (tracce separate)');
const EVENTI = path.join(PUL, 'eventi.json');
run('node', ['--experimental-strip-types', '--no-warnings', path.join(ROOT, 'pc', 'rotolo', 'eventi.mjs'), path.join(PUL, 'beats.json'), EVENTI]);
// la voce tagliata serve solo per abbassare la musica quando parli
const tieni = JSON.parse(fs.readFileSync(path.join(PUL, 'tagli.json'), 'utf8')).tieni;
const VOCE = path.join(PUL, 'voce-tagliata.wav');
const filtri = tieni.map((x, k) => `[0:a]atrim=${x.da}:${x.a},asetpts=PTS-STARTPTS[a${k}]`).join(';') + ';' + tieni.map((_, k) => `[a${k}]`).join('') + `concat=n=${tieni.length}:v=0:a=1[a]`;
fs.writeFileSync(path.join(PUL, 'filtri-voce.txt'), filtri);
run('ffmpeg', ['-v', 'error', '-y', '-i', VOCE_SYNC || VIDEO, '-/filter_complex', path.join(PUL, 'filtri-voce.txt'), '-map', '[a]', '-ac', '2', '-ar', '48000', VOCE]);
const STEMS = path.join(PUL, 'suoni');
run(process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), [path.join(ROOT, 'pc', 'rotolo', 'suoni.py'), EVENTI, VOCE, path.join(PUL, 'mix.wav'), '--stems', STEMS],
  { env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
const AUDIO = ['sfx', 'musica', 'ambiente'].map((n) => path.join(STEMS, `${n}.wav`)).join(',');

if (ha('--senza-davinci')) { console.log(`\n[documentario] pronto per DaVinci: ${GRAFICA}`); process.exit(0); }
passo(8, 'timeline in DaVinci');
// libera la scheda video dai modelli AI, poi apre DaVinci se è chiuso (livelli.py aspetta che risponda)
try {
  const ps = await (await fetch(`${process.env.OLLAMA_HOST || 'http://127.0.0.1:11434'}/api/ps`)).json();
  for (const m of ps.models || []) spawnSync('ollama', ['stop', m.name]);
} catch {}
if (!davinciAperto() && fs.existsSync(RESOLVE_EXE)) {
  console.log('[documentario] apro DaVinci Resolve');
  spawn(RESOLVE_EXE, [], { detached: true, stdio: 'ignore' }).unref();
}
run(PY, [path.join(ROOT, 'pc', 'locale', 'livelli.py'), VIDEO, GRAFICA, '--tagli', path.join(PUL, 'tagli.json'), '--lastra', LASTRA, '--audio', AUDIO, ...(VOCE_SYNC ? ['--voce', VOCE_SYNC] : []), '--nome', titolo]);
// 9. sottotitoli: lo script di Denis (davinci-automation/auto_captions.py, non modificato) sulla timeline appena creata,
//    preset ClashiVFX: WATER per tech (resta blu), --sottotitoli NOME per un altro, --sottotitoli no per saltare
const SOTTO_DIR = process.env.DAVINCI_AUTOMAZIONE || path.join(process.env.USERPROFILE || '', 'Desktop', 'my-video', 'davinci-automation');
const PRESET = opz('--sottotitoli', 'WATER');
if (PRESET !== 'no' && fs.existsSync(path.join(SOTTO_DIR, 'auto_captions.py'))) {
  passo(9, `sottotitoli (${PRESET})`);
  // testo dalla nostra trascrizione dentro auto_captions.py, poi titoli spostati fuori dal viso. Se fallisce, la
  // timeline resta buona: si avvisa e si chiude lo stesso (i sottotitoli si rifanno con "Avvia Sottotitoli.bat").
  const SOTTO = path.join(ROOT, 'pc', 'locale', 'sottotitoli.py');
  const env = { ...process.env, PYTHONIOENCODING: 'utf-8' };
  const ok = spawnSync(PY, [SOTTO, 'titoli', PUL, '--preset', PRESET, '--cartella', SOTTO_DIR], { stdio: 'inherit', cwd: ROOT, env }).status === 0
    && spawnSync(PY, [SOTTO, 'posiziona', PUL], { stdio: 'inherit', cwd: ROOT, env }).status === 0;
  if (!ok) console.log('[documentario] ATTENZIONE: sottotitoli non riusciti, la timeline è pronta senza');
} else if (PRESET !== 'no') console.log(`[documentario] sottotitoli saltati: manca ${path.join(SOTTO_DIR, 'auto_captions.py')}`);
console.log(`\n[documentario] fatto in ${((Date.now() - t00) / 60000).toFixed(1)} min: progetto "Regista locale", timeline "${titolo}"`);
