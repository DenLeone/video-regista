// 🛒 Sponsor (24/11, Denis): con «Sponsor: carrello» nel brief (lo scrive la Squadra) il video mostra, ogni 5-6 secondi
// per 2 secondi, «Aggiungi al carrello» con una freccia verso il carrello (in basso, sopra la descrizione).
// Si applica dopo il render: un clip trasparente (motion/carrello.html) sovrapposto con ffmpeg. Non serve Ultron.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const QUI = path.dirname(fileURLToPath(import.meta.url));
export const PAGINA = path.join(QUI, '..', 'motion', 'carrello.html');
export const PASSO = 5.5, DURATA = 2, INIZIO = 3;

export const vuoleCarrello = (brief = '') => /\bsponsor\s*:\s*carrello\b/i.test(String(brief));

// quando compare: INIZIO, poi ogni PASSO secondi; l'ultima deve finire prima della fine del video
export function momentiCarrello(durata) {
  const fuori = [];
  for (let at = INIZIO; at + DURATA <= durata - 0.3; at += PASSO) fuori.push({ at: +at.toFixed(2), dur: DURATA });
  return fuori;
}

export async function applicaCarrello({ video, uscita = null, log = () => {} }) {
  const sonda = (campo) => spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', campo, '-of', 'csv=p=0', video], { encoding: 'utf8' }).stdout.trim();
  const [w, h] = sonda('stream=width,height').split(',').map(Number);
  if (!(h > w)) { log('carrello: video non verticale, salto'); return null; }
  const durata = Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video], { encoding: 'utf8' }).stdout) || 0;
  const momenti = momentiCarrello(durata);
  if (!momenti.length) { log('carrello: video troppo corto, salto'); return null; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carrello-'));
  try {
    const clip = path.join(dir, 'carrello.mov');
    const { renderMotion } = await import('./motion.mjs');
    await renderMotion({ modello: 'carrello', formato: 'verticale', uscita: clip, html: fs.readFileSync(PAGINA, 'utf8'), alfa: true });
    const { filtroSovrapposizioni } = await import('./ultron.mjs');
    const { filtro, uscita: v } = filtroSovrapposizioni(momenti.map((m) => ({ ...m, clip })), w, h);
    const tmp = path.join(dir, 'fuori.mp4');
    const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', video, ...momenti.flatMap(() => ['-i', clip]), '-filter_complex', filtro, '-map', v, '-map', '0:a?',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', tmp], { stdio: ['ignore', 'ignore', 'inherit'] });
    if (r.status !== 0) throw new Error('ffmpeg non ha applicato il carrello');
    fs.copyFileSync(tmp, uscita || video);
    log(`carrello: ${momenti.length} volte`);
    return momenti;
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
