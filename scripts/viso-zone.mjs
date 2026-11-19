// 🙂 Dove sta la testa di Denis nel video montato (19/11, zone.json: «mai grafiche sopra la faccia»).
// Usa il rilevatore di volti che c'è già (pc/rotolo/viso.py, YuNet, modello nel repo) e dà, per ogni momento, il punto
// più alto della testa. Ultron lo usa per far stare le animazioni tra la zona sicura in alto e la testa.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ZONA } from './zone.mjs';

const QUI = path.dirname(fileURLToPath(import.meta.url));
const VISO = path.join(QUI, '..', 'pc', 'rotolo', 'viso.py');

// traccia del viso: [{t, x, y, s}] in frazioni del fotogramma, o null se non si riesce / nessun viso
export function tracciaViso(video, dir) {
  const py = process.env.PYTHON || 'python3';
  if (spawnSync(py, ['-c', 'import cv2, numpy'], { stdio: 'ignore' }).status !== 0) {
    spawnSync(py, ['-m', 'pip', 'install', '--quiet', 'opencv-python-headless', 'numpy'], { stdio: 'ignore', timeout: 240_000 });
  }
  const out = path.join(dir, 'viso.json');
  const r = spawnSync(py, [VISO, video, out, '--passo', '0.5'], { encoding: 'utf8', timeout: 600_000 });
  if (r.status !== 0 || !fs.existsSync(out) || /nessun viso|modello YuNet assente/.test(r.stdout || '')) return null;
  try { return JSON.parse(fs.readFileSync(out, 'utf8')).punti || null; } catch { return null; }
}

// punto più alto della testa (capelli compresi) tra at e at+dur, in pixel del video alto h
export function testaInAlto(punti, at, dur, h) {
  const vicini = (punti || []).filter((p) => p.y != null && p.t >= at - 0.5 && p.t <= at + dur + 0.5);
  if (!vicini.length) return null;
  return Math.min(...vicini.map((p) => (p.y - 0.75 * p.s) * h)); // s = altezza del viso; i capelli arrivano ~¼ più su
}

// dove mettere la fascia di un'animazione (alta f.h su f.w): dal bordo alto della zona sicura fino a sopra la testa,
// rimpicciolita e centrata se serve. null = non ci sta senza coprire la faccia (o diventerebbe troppo piccola).
// Senza traccia del viso si suppone la testa a 560 px su 1920 (occhi a ~700, come il resto del Regista).
export function postoFascia({ testa, w, h, f }) {
  const k = h / ZONA.h;
  const y0 = Math.ceil(ZONA.sicura.y0 * k);
  const fondo = (testa ?? 560 * k) - 30 * k;
  const piena = (w * f.h) / f.w;
  const larga = ((ZONA.sicura.x1 - ZONA.sicura.x0) * k) / w; // dentro i margini di lato della zona sicura
  const scala = Math.min(larga, (fondo - y0) / piena);
  if (!(scala >= 0.45)) return null;
  const pari = (n) => Math.round(n / 2) * 2;
  const sw = pari(w * scala), sh = pari(piena * scala);
  return { x: Math.round((w - sw) / 2), y: y0, sw, sh, scala: +scala.toFixed(2) };
}
