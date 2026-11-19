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

// ingombro del viso tra at e at+dur (unione di tutte le posizioni), in pixel del video w×h: {alto, basso, sx, dx}
// alto = capelli (¼ di viso sopra la fronte), basso = mento + collo corto; larghezza ≈ 0,8 dell'altezza del viso
export function visoNelTempo(punti, at, dur, w, h) {
  const v = (punti || []).filter((p) => p.y != null && p.t >= at - 0.5 && p.t <= at + dur + 0.5);
  if (!v.length) return null;
  return {
    alto: Math.min(...v.map((p) => (p.y - 0.75 * p.s) * h)),
    basso: Math.max(...v.map((p) => (p.y + 0.6 * p.s) * h)),
    sx: Math.min(...v.map((p) => p.x * w - 0.5 * p.s * h)),
    dx: Math.max(...v.map((p) => p.x * w + 0.5 * p.s * h)),
  };
}

// dove mettere la fascia di un'animazione (f.w × f.h), nei tre posti buoni del video «safe zone» di Denis:
//   1) sopra la testa (dal bordo alto della zona sicura), 2) accanto alla testa (dal lato con più spazio),
//   3) sul petto (sotto il mento, sopra i sottotitoli). Sempre dentro la zona sicura e mai sulla faccia.
// Sopra la testa è il posto di Ultron: si usa se la fascia resta almeno al 60%; altrimenti vince il posto più grande.
// null = in nessun posto ci sta almeno al 45%. Senza viso trovato si suppone la testa a 560–1000 px, centrata.
// SOTTOTITOLI_Y = dove iniziano i sottotitoli «basso» di Ultron (~1215 su 1920): il petto si ferma prima.
const SOTTOTITOLI_Y = 1190, MARGINE = 30;
export function postoFascia({ viso, w, h, f }) {
  const k = h / ZONA.h, s = ZONA.sicura;
  const V = viso || { alto: 560 * k, basso: 1000 * k, sx: 390 * (w / ZONA.w), dx: 690 * (w / ZONA.w) };
  const x0 = s.x0 * k, x1 = s.x1 * k, y0 = Math.ceil(s.y0 * k), m = MARGINE * k;
  const rapporto = f.h / f.w, piena = w; // a scala 1 la fascia è larga quanto il video
  const pari = (n) => Math.round(n / 2) * 2;
  // la fascia più grande che sta nel rettangolo (centrata dentro)
  const dentro = (nome, rx0, ry0, rx1, ry1) => {
    const lw = rx1 - rx0, lh = ry1 - ry0;
    if (lw <= 0 || lh <= 0) return null;
    const scala = Math.min(lw / piena, lh / (piena * rapporto));
    const sw = pari(piena * scala), sh = pari(piena * rapporto * scala);
    return { posto: nome, x: Math.round(rx0 + (lw - sw) / 2), y: Math.round(nome === 'sopra' ? ry0 : ry0 + (lh - sh) / 2), sw, sh, scala: +scala.toFixed(2) };
  };
  const tastiY = ZONA.tasti.y0 * k, tastiX = ZONA.tasti.x0 * k;
  const sopra = dentro('sopra', x0, y0, x1, V.alto - m);
  // accanto: dall'alto della zona fino a dove finisce la testa (al massimo fino ai tasti di Instagram)
  const giu = Math.min(V.basso, tastiY);
  const lati = [dentro('accanto', x0, y0, V.sx - m, giu), dentro('accanto', V.dx + m, y0, x1, giu)];
  // petto: sotto il mento fino ai sottotitoli; a destra non oltre i tasti se scende sotto y 970
  const petto = dentro('petto', x0, V.basso + m, SOTTOTITOLI_Y * k > tastiY ? tastiX : x1, SOTTOTITOLI_Y * k);
  if (sopra && sopra.scala >= 0.6) return sopra;
  const migliore = [sopra, ...lati, petto].filter(Boolean).sort((a, b) => b.scala - a.scala)[0];
  return migliore && migliore.scala >= 0.45 ? migliore : null;
}
