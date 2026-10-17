// Sincronizzazione dalle immagini, per le camere senza audio utilizzabile
// (es. Sony con un ricevitore wireless spento nella presa microfono: registra
// solo fruscio). Due camere che riprendono la stessa scena vedono gli stessi
// movimenti (mani, prodotto, gesti) negli stessi istanti: si confronta il
// movimento nelle varie zone delle due inquadrature e si cerca lo spostamento
// in cui salgono e scendono insieme. Provato su Cuffie p30i (iPhone dall'alto
// sulle mani + Sony frontale): picco netto a −9,13 s, falsi allineamenti molto
// più bassi.

import { execFileSync } from 'node:child_process';
import { correlazione, normalizza } from './audio.mjs';

const LATO = [72, 128], CELLA = 8, FPS = 30; // video ridotto a 72×128 (o 128×72), celle da 8×8 pixel

// movimento per cella, un valore per fotogramma; `da`/`dur` per leggere solo un pezzo
export function movimento(file, { orizzontale = false, da = 0, dur = 0 } = {}) {
  const [w, h] = orizzontale ? [LATO[1], LATO[0]] : LATO;
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-threads', '0', '-skip_loop_filter', 'all',
    ...(da > 0 ? ['-ss', String(da)] : []), ...(dur > 0 ? ['-t', String(dur)] : []), '-i', file, '-an',
    '-vf', `fps=${FPS},scale=${w}:${h}:flags=area,format=gray`, '-f', 'rawvideo', '-'],
  { maxBuffer: 2 ** 31 - 1, stdio: ['ignore', 'pipe', 'ignore'] });
  const px = w * h, n = Math.floor(raw.length / px);
  const cx = Math.floor(w / CELLA), cy = Math.floor(h / CELLA);
  const celle = Array.from({ length: cx * cy }, () => new Float32Array(n));
  for (let t = 1; t < n; t++) {
    const a = (t - 1) * px, b = t * px;
    for (let y = 0; y < cy * CELLA; y++) {
      const riga = y * w, cr = Math.floor(y / CELLA) * cx;
      for (let x = 0; x < cx * CELLA; x++) celle[cr + Math.floor(x / CELLA)][t] += Math.abs(raw[b + riga + x] - raw[a + riga + x]);
    }
  }
  for (const c of celle) { c[0] = c[1] || 0; for (let t = 0; t < n; t++) c[t] /= CELLA * CELLA; }
  return { fps: FPS, n, cx, cy, celle };
}

// zone più grandi (rx × ry) sommando le celle, in scala logaritmica
function zone(mov, rx, ry) {
  const out = [];
  for (let zy = 0; zy < ry; zy++) for (let zx = 0; zx < rx; zx++) {
    const z = new Float32Array(mov.n);
    for (let y = Math.floor(zy * mov.cy / ry); y < Math.floor((zy + 1) * mov.cy / ry); y++)
      for (let x = Math.floor(zx * mov.cx / rx); x < Math.floor((zx + 1) * mov.cx / rx); x++) {
        const c = mov.celle[y * mov.cx + x];
        for (let t = 0; t < mov.n; t++) z[t] += c[t];
      }
    for (let t = 0; t < mov.n; t++) z[t] = Math.log1p(z[t]);
    out.push(z);
  }
  return out;
}

// Offset in secondi (tempo nell'altra camera = tempo nel riferimento + offset).
// Ogni zona del riferimento si confronta con ogni zona dell'altra (le inquadrature
// sono diverse: le mani stanno in basso in una e ovunque nell'altra); contano solo
// le coppie che si muovono insieme (somma dei quadrati delle correlazioni positive).
export function syncMovimento(rif, altro, { griglia = [3, 4] } = {}) {
  const fps = rif.fps;
  const za = zone(rif, ...griglia).map((z) => normalizza(z, fps));
  const zb = zone(altro, ...griglia).map((z) => normalizza(z, fps));
  const minSovrapp = Math.floor(Math.min(rif.n, altro.n) * 0.4);
  let somma = null, coppie = 0;
  for (const a of za) for (const b of zb) {
    const r = correlazione(a, b, minSovrapp);
    if (!somma) somma = new Float64Array(r.length);
    for (let i = 0; i < r.length; i++) somma[i] += r[i] > 0 ? r[i] ** 2 : 0;
    coppie++;
  }
  let best = -1, bestI = 0;
  for (let i = 0; i < somma.length; i++) if (somma[i] > best) { best = somma[i]; bestI = i; }
  let secondo = 0;
  for (let i = 0; i < somma.length; i++) if (Math.abs(i - bestI) > fps && somma[i] > secondo) secondo = somma[i];
  const spicco = secondo > 0 ? best / secondo : 10;
  // allineamenti veri 2,8–10, falsi fino a 1,5 (prova su Cuffie p30i con pezzi da 45 s)
  return { offset: +((bestI - (rif.n - 1)) / fps).toFixed(3), punteggio: +Math.sqrt(best / coppie).toFixed(3), spicco: +spicco.toFixed(2), affidabile: spicco >= 2 };
}
