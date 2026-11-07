// Stile Documentario, dal passo 4 in poi (lo lancia pc/locale/documentario.mjs --stile documentario, dopo pulizia e
// immagini). Un solo piano sequenza verticale su un mondo d'archivio, Denis in camera dentro una stampa sulla scrivania.
//   node pc/locale/doc-flusso.mjs <video> <cartella -pulizia> --slug X --titolo X [--voce voce-sincronizzata.wav] [--senza-davinci]
// 4. regia (pc/locale/doc-regia.mjs, qwen3.8) → scene.json
// 5. proxy verticale del video tagliato, ritagliato attorno al viso (public/documentario/<slug>/tu.mp4), voce, immagini
// 6. mondo e camera (pc/locale/doc-mondo.mjs) → props + eventi dei suoni
// 7. render Remotion della composizione Documentario (video intero 1080×1920, senza audio)
// 8. suoni: SFX, musica, ambiente (pc/rotolo/suoni.py, tracce separate)
// 9. timeline in DaVinci: V1 il video, A1 voce, A2 SFX, A3 musica, A4 ambiente (pc/locale/doc-timeline.py)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opz = (k, d = '') => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const ha = (k) => args.includes(k);
const [VIDEO, PUL] = args.map((a) => path.resolve(a));
const slug = opz('--slug'), titolo = opz('--titolo', slug);
const PY = path.join(ROOT, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const PYTHON = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const t00 = Date.now();
const passo = (n, testo) => console.log(`\n[documentario] ${n}. ${testo}  (${((Date.now() - t00) / 60000).toFixed(1)} min dal passo 4)`);
const run = (cmd, a, o = {}) => {
  const r = spawnSync(cmd, a, { stdio: 'inherit', cwd: ROOT, shell: process.platform === 'win32' && cmd === 'npx', env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, ...o });
  if (r.status !== 0) { console.error(`[documentario] fermo: ${path.basename(cmd)} ${a[0] ? path.basename(String(a[0])) : ''} è uscito con ${r.status}`); process.exit(1); }
};
const CART = `documentario/${slug}`;
const PUB = path.join(ROOT, 'public', CART);
fs.mkdirSync(PUB, { recursive: true });

passo(4, 'regia del piano sequenza (scene)');
run('node', [path.join(ROOT, 'pc', 'locale', 'doc-regia.mjs'), PUL, ...(ha('--rifai-ai') ? ['--rifai-ai'] : [])]);

passo(5, 'proxy verticale del video, voce e immagini');
// viso sul video originale: il ritaglio 9:16 si centra sulla posizione mediana del viso
const VISO = path.join(PUL, 'viso.json');
if (!fs.existsSync(VISO)) run(PYTHON, [path.join(ROOT, 'pc', 'rotolo', 'viso.py'), VIDEO, VISO]);
const v = JSON.parse(fs.readFileSync(VISO, 'utf8'));
const mediana = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] ?? 0.5; };
const cx = mediana(v.punti.map((p) => p.x));
const W = v.w, H = v.h;
const cw = Math.min(W, Math.round(H * 9 / 16 / 2) * 2), chh = cw === W ? Math.round(W * 16 / 9 / 2) * 2 : H;
const x0 = Math.max(0, Math.min(W - cw, Math.round(cx * W - cw / 2)));
const tieni = JSON.parse(fs.readFileSync(path.join(PUL, 'tagli.json'), 'utf8')).tieni;
const TU = path.join(PUB, 'tu.mp4');
if (!fs.existsSync(TU)) {
  const f = tieni.map((x, k) => `[0:v]trim=${x.da}:${x.a},setpts=PTS-STARTPTS[v${k}]`).join(';') + ';' + tieni.map((_, k) => `[v${k}]`).join('')
    + `concat=n=${tieni.length}:v=1:a=0,fps=30000/1001,crop=${cw}:${chh}:${x0}:0,scale=1080:1920[v]`;
  const ff = path.join(PUL, 'filtri-doc.txt');
  fs.writeFileSync(ff, f);
  const nv = spawnSync('ffmpeg', ['-v', 'error', '-y', '-hwaccel', 'cuda', '-i', VIDEO, '-/filter_complex', ff, '-map', '[v]', '-c:v', 'h264_nvenc', '-preset', 'p5', '-cq', '19', '-g', '30', TU], { stdio: 'inherit' });
  if (nv.status !== 0) run('ffmpeg', ['-v', 'error', '-y', '-i', VIDEO, '-/filter_complex', ff, '-map', '[v]', '-c:v', 'libx264', '-crf', '18', '-preset', 'fast', TU]);
}
run('ffmpeg', ['-v', 'error', '-y', '-ss', '2', '-i', TU, '-frames:v', '1', '-q:v', '3', path.join(PUB, 'tu-fermo.jpg')]);
// voce tagliata (dalla voce registrata a parte se c'è, se no dall'audio della camera)
const VOCE = path.join(PUL, 'voce-tagliata.wav');
if (!fs.existsSync(VOCE)) {
  const fa = tieni.map((x, k) => `[0:a]atrim=${x.da}:${x.a},asetpts=PTS-STARTPTS[a${k}]`).join(';') + ';' + tieni.map((_, k) => `[a${k}]`).join('') + `concat=n=${tieni.length}:v=0:a=1[a]`;
  fs.writeFileSync(path.join(PUL, 'filtri-voce.txt'), fa);
  run('ffmpeg', ['-v', 'error', '-y', '-i', opz('--voce') || VIDEO, '-/filter_complex', path.join(PUL, 'filtri-voce.txt'), '-map', '[a]', '-ac', '2', '-ar', '48000', VOCE]);
}
// voce a -15 LUFS: suoni.py mette SFX, musica e ambiente ai livelli giusti rispetto a lei (la somma in DaVinci ~-14)
const VOCE_N = path.join(PUL, 'voce-doc.wav');
run('ffmpeg', ['-v', 'error', '-y', '-i', VOCE, '-af', 'loudnorm=I=-15:TP=-1.5:LRA=11', '-ar', '48000', '-ac', '2', VOCE_N]);
fs.copyFileSync(VOCE_N, path.join(PUB, 'voce.wav'));
const imm = JSON.parse(fs.readFileSync(path.join(PUL, 'immagini.json'), 'utf8'));
for (const e of imm.elementi) {
  const da = path.join(imm.cartella, e.file);
  if (fs.existsSync(da) && !fs.existsSync(path.join(PUB, e.file))) fs.copyFileSync(da, path.join(PUB, e.file));
}

passo(6, 'mondo, camera e suoni');
const PROPS = path.join(PUL, 'documentario.json'), EVENTI = path.join(PUL, 'eventi.json');
run('node', [path.join(ROOT, 'pc', 'locale', 'doc-mondo.mjs'), path.join(PUL, 'scene.json'), path.join(PUL, 'parole-pulite.json'), PROPS, '--cartella', CART, '--eventi', EVENTI]);

passo(7, 'render del piano sequenza (Remotion)');
fs.mkdirSync(path.join(ROOT, 'out', 'locale'), { recursive: true });
const RENDER = path.join(ROOT, 'out', 'locale', `${slug}-documentario-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}.mp4`);
const cpu = Math.max(2, Math.min(8, os.cpus().length - 1));
run('npx', ['remotion', 'render', 'src/index.ts', 'Documentario', RENDER, `--props=${PROPS}`, '--muted', '--crf=16', `--concurrency=${cpu}`]);

passo(8, 'suoni: SFX, musica e ambiente (tracce separate)');
const STEMS = path.join(PUL, `suoni-doc-${Date.now()}`);   // cartella nuova: DaVinci riusa le clip già importate con lo stesso percorso
run(PYTHON, [path.join(ROOT, 'pc', 'rotolo', 'suoni.py'), EVENTI, VOCE_N, path.join(PUL, 'mix-doc.wav'), '--stems', STEMS]);

if (ha('--senza-davinci')) { console.log(`\n[documentario] pronto: ${RENDER} (tracce in ${STEMS})`); process.exit(0); }
passo(9, 'timeline in DaVinci');
try {
  const ps = await (await fetch(`${process.env.OLLAMA_HOST || 'http://127.0.0.1:11434'}/api/ps`)).json();
  for (const m of ps.models || []) spawnSync('ollama', ['stop', m.name]);
} catch {}
const RESOLVE_EXE = 'C:\\Program Files\\Blackmagic Design\\DaVinci Resolve\\Resolve.exe';
const aperto = /Resolve\.exe/i.test(spawnSync('tasklist', ['/FI', 'IMAGENAME eq Resolve.exe'], { encoding: 'utf8' }).stdout || '');
if (!aperto && fs.existsSync(RESOLVE_EXE)) spawn('explorer.exe', [RESOLVE_EXE], { detached: true, stdio: 'ignore' }).unref();
run(PY, [path.join(ROOT, 'pc', 'locale', 'doc-timeline.py'), RENDER, VOCE_N, STEMS, '--nome', `Documentario ${titolo}`]);
console.log(`\n[documentario] fatto: timeline "Documentario ${titolo}" nel progetto "Regista locale" (${RENDER})`);
