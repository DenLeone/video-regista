// «Guardare» un video che sta su Drive (Claude, 27/11): fogli di fotogrammi col tempo scritto sopra + una copia leggera.
// Il file grosso non passa dal connettore Drive (limite 10 MB): qui si scarica, si riduce e i pezzi piccoli tornano su Drive.
// Repo pubblico: nel log solo numeri, mai nomi di file.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 26 });
const FONT = ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf'].find((f) => fs.existsSync(f));

/** Fogli di fotogrammi (5 colonne) + copia leggera. Restituisce i file creati in `out`. */
export function creaFogli({ src, out, passo = 0.5, perFoglio = 15, larghezza = 270 }) {
  fs.mkdirSync(out, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fogli-'));
  try {
    const testo = FONT ? `,drawtext=fontfile=${FONT}:text='%{pts\\:hms}':x=6:y=6:fontsize=20:fontcolor=white:box=1:boxcolor=black@0.6` : '';
    run('ffmpeg', ['-v', 'error', '-y', '-i', src, '-vf', `fps=1/${passo},scale=${larghezza}:-2${testo}`, '-q:v', '3', path.join(tmp, '%04d.jpg')]);
    const n = fs.readdirSync(tmp).filter((f) => f.endsWith('.jpg')).length;
    const fogli = [];
    for (let i = 0, k = 0; i < n; i += perFoglio, k++) {
      const f = path.join(out, `foglio-${String(k + 1).padStart(2, '0')}.jpg`);
      run('ffmpeg', ['-v', 'error', '-y', '-start_number', String(i + 1), '-i', path.join(tmp, '%04d.jpg'), '-frames:v', '1', '-vf', 'tile=5x3', '-q:v', '3', f]);
      fogli.push(f);
    }
    // copia leggera: sta sotto i 3 MB anche a 30 s (il connettore Drive accetta pochi MB per volta)
    const piccolo = path.join(out, 'piccolo.mp4');
    run('ffmpeg', ['-v', 'error', '-y', '-i', src, '-vf', 'scale=540:-2:flags=lanczos', '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', '600k', '-maxrate', '800k', '-bufsize', '1600k', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '64k', '-ac', '2', '-t', '40', piccolo]);
    return { fotogrammi: n, fogli, piccolo };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const R = process.env.REGISTA_REMOTE || 'gdrive';
  const percorso = process.env.PERCORSO || '';
  const passo = Math.min(5, Math.max(0.25, Number(process.env.PASSO) || 0.5));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fv-'));
  try {
    if (!percorso || percorso.includes('..') || percorso.startsWith('/')) throw new Error('percorso non valido');
    const src = path.join(dir, `in${path.extname(percorso).toLowerCase() || '.mp4'}`);
    run('rclone', ['copyto', `${R}:${percorso}`, src]);
    const out = path.join(dir, 'out');
    const r = creaFogli({ src, out, passo });
    const dest = `12 · Risorse/_registri/fogli/${process.env.GITHUB_RUN_ID || Date.now()}`;
    run('rclone', ['copy', out, `${R}:${dest}`]);
    console.log(`fogli: ${r.fotogrammi} fotogrammi, ${r.fogli.length} fogli su Drive (${dest})`);
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `dove=${dest}\n`);
  } catch (e) {
    console.log(`::error::${String(e.message).split('\n')[0].slice(0, 120)}`);
    process.exit(1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
