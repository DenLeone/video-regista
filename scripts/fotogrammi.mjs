// Fotogrammi di prova di uno stile, in pochi secondi (09/11).
// Con il kit (azione "kit" del regista: piano + pezzi in piccolo in _regista/kit) le prove di uno stile
// non aspettano più un render: i file di kit/media vanno in public/media, poi
//
//   node scripts/fotogrammi.mjs <Stile> <piano.json> <foglio.jpg> <secondi...>
//   node scripts/fotogrammi.mjs Focus work/kit/piano.json out/focus.jpg 0.7 1.7 3.2 4.3 5.7
//
// Il progetto si impacchetta una volta sola, poi ogni fotogramma costa uno o due secondi. I tempi sono
// in secondi del montaggio; il foglio li mette in fila, con il secondo scritto sotto.
// REMOTION_BROWSER = Chrome già installato (come nel regista); SCALA = 0.5 di default.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// tempi in secondi → fotogrammi dentro la durata (l'ultimo fotogramma valido è durata − 1)
export function fotogrammiDa(secondi, fps, durata) {
  return secondi.map((s) => Math.min(Math.max(0, durata - 1), Math.max(0, Math.round(Number(s) * fps))));
}

async function main() {
  const [stile, filePiano, foglio, ...tempi] = process.argv.slice(2);
  const secondi = tempi.map((t) => Number(String(t).replace(',', '.'))).filter((t) => Number.isFinite(t) && t >= 0);
  if (!stile || !filePiano || !foglio || !secondi.length) {
    console.error('uso: node scripts/fotogrammi.mjs <Stile> <piano.json> <foglio.jpg> <secondi...>');
    process.exit(2);
  }
  const inputProps = JSON.parse(fs.readFileSync(filePiano, 'utf8'));
  const scala = Math.min(1, Math.max(0.1, Number(process.env.SCALA) || 0.5));
  const browserExecutable = process.env.REMOTION_BROWSER || null;
  const t0 = Date.now();
  const tempo = () => `${((Date.now() - t0) / 1000).toFixed(0)} s`;
  const serveUrl = await bundle({ entryPoint: path.join(ROOT, 'src', 'index.ts'), publicDir: path.join(ROOT, 'public') });
  console.log(`[fotogrammi] progetto pronto (${tempo()})`);
  const composition = await selectComposition({ serveUrl, id: stile, inputProps, browserExecutable });
  const frames = fotogrammiDa(secondi, composition.fps, composition.durationInFrames);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fotogrammi-'));
  const fatti = [];
  for (const [i, frame] of frames.entries()) {
    const output = path.join(dir, `${String(i).padStart(3, '0')}.png`);
    try {
      await renderStill({ composition, serveUrl, inputProps, frame, output, scale: scala, browserExecutable, overwrite: true });
      fatti.push({ output, s: frame / composition.fps });
      console.log(`[fotogrammi] ${(frame / composition.fps).toFixed(2)} s (${tempo()})`);
    } catch (e) { console.error(`[fotogrammi] ${secondi[i]} s non riuscito: ${String(e.message).split('\n')[0]}`); }
  }
  if (!fatti.length) { console.error('[fotogrammi] nessun fotogramma riuscito'); process.exit(1); }
  fs.mkdirSync(path.dirname(path.resolve(foglio)), { recursive: true });
  // in fila, con il secondo scritto sotto ogni fotogramma
  const ingressi = fatti.flatMap((f) => ['-i', f.output]);
  const etichette = fatti.map((f, i) => `[${i}:v]pad=iw:ih+44:0:0:color=black,drawtext=text='${f.s.toFixed(1)} s':x=(w-text_w)/2:y=h-36:fontsize=28:fontcolor=white[v${i}]`).join(';');
  const fila = fatti.length > 1 ? `;${fatti.map((_, i) => `[v${i}]`).join('')}hstack=inputs=${fatti.length}[o]` : ';[v0]null[o]';
  execFileSync('ffmpeg', ['-y', '-v', 'error', ...ingressi, '-filter_complex', etichette + fila, '-map', '[o]', '-frames:v', '1', '-q:v', '3', path.resolve(foglio)], { stdio: 'inherit' });
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`[fotogrammi] ${fatti.length} fotogrammi in ${foglio} (${tempo()})`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(ROOT, 'scripts', 'fotogrammi.mjs')) main().catch((e) => { console.error(`[fotogrammi] ${e.message}`); process.exit(1); });
