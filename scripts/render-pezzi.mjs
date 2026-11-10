// Render a pezzi in parallelo (10/11).
// Un solo processo di Remotion lascia ferma quasi metà della macchina: le schede dello stesso Chrome
// si passano il turno per catturare il fotogramma. Qui il video si divide in N pezzi, ognuno col suo
// processo e il suo Chrome, e alla fine si riuniscono con combineChunks (video copiato così com'è,
// audio AAC fatto per incollarsi senza scatti). Stesse impostazioni del render intero del regista.
//
//   node scripts/render-pezzi.mjs <pacchetto|src/index.ts> <Stile> <uscita.mp4> <piano.json> [pezzi]
//
// Esce con codice ≠ 0 se qualcosa non va: il regista ripiega sul render intero.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { combineChunks, renderMedia, selectComposition } from '@remotion/renderer';

const QUI = fileURLToPath(import.meta.url);
const browserExecutable = process.env.REMOTION_BROWSER || null;

// i fotogrammi [da, a] di ogni pezzo: tutti lunghi uguali, l'ultimo prende il resto
export function dividi(durata, pezzi) {
  const n = Math.max(1, Math.min(pezzi, Math.floor(durata / 30) || 1));
  const passo = Math.ceil(durata / n);
  const out = [];
  for (let da = 0; da < durata; da += passo) out.push([da, Math.min(durata, da + passo) - 1]);
  return { passo, intervalli: out };
}

async function unPezzo(serveUrl, stile, filePiano, da, a, video, audio, schede) {
  const inputProps = JSON.parse(fs.readFileSync(filePiano, 'utf8'));
  const composition = await selectComposition({ serveUrl, id: stile, inputProps, browserExecutable, logLevel: 'error' });
  await renderMedia({
    composition, serveUrl, inputProps, browserExecutable, logLevel: 'error',
    codec: 'h264-ts', audioCodec: 'aac', outputLocation: video, separateAudioTo: audio,
    forSeamlessAacConcatenation: true, enforceAudioTrack: true, frameRange: [da, a],
    videoBitrate: '15M', encodingMaxRate: '16M', encodingBufferSize: '32M', audioBitrate: '320k',
    imageFormat: 'png', colorSpace: 'bt709', concurrency: schede, overwrite: true,
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--pezzo') {
    const [, serveUrl, stile, filePiano, da, a, video, audio, schede] = args;
    await unPezzo(serveUrl, stile, filePiano, Number(da), Number(a), video, audio, Number(schede) || 1);
    return;
  }
  const [ingresso, stile, uscita, filePiano, quanti] = args;
  if (!ingresso || !stile || !uscita || !filePiano) {
    console.error('uso: node scripts/render-pezzi.mjs <pacchetto|src/index.ts> <Stile> <uscita.mp4> <piano.json> [pezzi]');
    process.exit(2);
  }
  const t0 = Date.now();
  const serveUrl = fs.existsSync(path.join(ingresso, 'index.html')) ? path.resolve(ingresso) : null;
  if (!serveUrl) throw new Error('serve il pacchetto già pronto (cartella con index.html)');
  const inputProps = JSON.parse(fs.readFileSync(filePiano, 'utf8'));
  const composition = await selectComposition({ serveUrl, id: stile, inputProps, browserExecutable, logLevel: 'error' });
  const cpu = os.availableParallelism();
  const { passo, intervalli } = dividi(composition.durationInFrames, Number(quanti) || Math.min(4, cpu));
  if (intervalli.length < 2) throw new Error('video troppo corto per dividerlo');
  const schede = Math.max(1, Math.floor(cpu / intervalli.length));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'render-pezzi-'));
  const video = intervalli.map((_, i) => path.join(dir, `v${i}.ts`));
  const audio = intervalli.map((_, i) => path.join(dir, `a${i}.aac`));
  console.log(`[render] ${composition.durationInFrames} fotogrammi in ${intervalli.length} pezzi da ${passo}, ${schede} sched${schede === 1 ? 'a' : 'e'} l'uno`);
  try {
    let fatti = 0;
    await Promise.all(intervalli.map(([da, a], i) => new Promise((ok, ko) => {
      const c = spawn(process.execPath, [QUI, '--pezzo', serveUrl, stile, filePiano, da, a, video[i], audio[i], schede].map(String), { stdio: ['ignore', 'inherit', 'inherit'] });
      c.on('error', ko);
      c.on('close', (code) => {
        if (code !== 0) return ko(new Error(`pezzo ${i + 1} terminato con codice ${code}`));
        console.log(`[render] pezzo ${++fatti}/${intervalli.length} pronto (${Math.round((Date.now() - t0) / 1000)} s)`);
        ok();
      });
    })));
    fs.mkdirSync(path.dirname(path.resolve(uscita)), { recursive: true });
    await combineChunks({
      outputLocation: path.resolve(uscita), videoFiles: video, audioFiles: audio, codec: 'h264', audioCodec: 'aac',
      fps: composition.fps, framesPerChunk: passo, preferLossless: false, compositionDurationInFrames: composition.durationInFrames,
      audioBitrate: '320k', logLevel: 'error',
    });
    console.log(`[render] ${path.basename(uscita)} pronto in ${Math.round((Date.now() - t0) / 1000)} s`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === QUI) main().catch((e) => { console.error(`[render] ${e.message}`); process.exit(1); });
