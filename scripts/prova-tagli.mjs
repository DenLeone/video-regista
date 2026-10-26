// Confronto locale: gli stessi comandi di taglio, uno alla volta e 4 insieme, stesso file.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { comandiTaglio, eseguiFfmpeg } from './regista.mjs';

export async function confrontaTagliParalleli() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tagli-'));
  const src = path.join(dir, 'src.mp4');
  const fatto = spawnSync('ffmpeg', [
    '-y', '-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=25:duration=2',
    '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-shortest',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', src,
  ], { encoding: 'utf8' });
  if (fatto.status !== 0) throw new Error(fatto.stderr?.slice(-400) || 'ffmpeg di prova fallito');
  const sorgente = { originale: src, colore: null, ritaglia916: false, stock: true };
  const lista = (base) => [0, 0.5, 1, 1.4].map((start, i) =>
    comandiTaglio(sorgente, start, 0.35, path.join(base, `${i}.mp4`), true, true));
  const seq = path.join(dir, 'seq');
  const par = path.join(dir, 'par');
  fs.mkdirSync(seq);
  fs.mkdirSync(par);
  const argomenti = lista(seq)[0];
  if (argomenti[argomenti.indexOf('-threads') + 1] !== '2') throw new Error('manca -threads 2');
  if (argomenti[argomenti.indexOf('-crf') + 1] !== '16') throw new Error('il crf del taglio è cambiato');
  if (!argomenti.includes('veryfast')) throw new Error('il preset del taglio è cambiato');
  await eseguiFfmpeg(lista(seq), 1);
  await eseguiFfmpeg(lista(par), 4);
  for (let i = 0; i < 4; i++) {
    const a = fs.readFileSync(path.join(seq, `${i}.mp4`));
    const b = fs.readFileSync(path.join(par, `${i}.mp4`));
    const ha = crypto.createHash('sha256').update(a).digest('hex');
    const hb = crypto.createHash('sha256').update(b).digest('hex');
    if (ha !== hb) throw new Error(`pezzo ${i} diverso: sequenziale ${ha} parallelo ${hb}`);
  }
  return dir;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  confrontaTagliParalleli().then((dir) => console.log('tagli identici', dir)).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
