// 🟩 Zone del verticale (Denis 19/11, TASSATIVE): lette da zone.json alla radice del repo (lo stesso file di src/zone.ts).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ZONA = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'zone.json'), 'utf8'));
export function dentroZona(x, y, w, h) {
  const s = ZONA.sicura;
  if (x < s.x0 || y < s.y0 || x + w > s.x1 || y + h > s.y1) return false;
  if (y + h > ZONA.tasti.y0 && x + w > ZONA.tasti.x0) return false;
  return true;
}
export const topInZona = (top, alto = 0) => Math.max(ZONA.sicura.y0, Math.min(top, ZONA.sicura.y1 - alto));
// la regola in parole, per i prompt delle AI
export const REGOLA_ZONE = `ZONE DEL VIDEO VERTICALE 1080×1920 (tassative): tutto (testi, grafiche, loghi, sottotitoli) dentro x ${ZONA.sicura.x0}–${ZONA.sicura.x1}, y ${ZONA.sicura.y0}–${ZONA.sicura.y1}; sotto y ${ZONA.tasti.y0} non oltre x ${ZONA.tasti.x0} (lì ci sono i tasti di Instagram); sotto y ${ZONA.cimitero.y0} niente di niente; mai grafiche sopra la faccia di Denis.`;

// le zone disegnate sopra un fotogramma verticale (ffmpeg, per i fogli di controllo): bordo verde = zona sicura,
// rosso = tasti di Instagram e «cimitero». Le misure si adattano alla dimensione del fotogramma (iw, ih).
export function filtroZone({ pieno = false } = {}) {
  const s = ZONA.sicura, t = ZONA.tasti;
  const X = (v) => `iw*${(v / ZONA.w).toFixed(4)}`, Y = (v) => `ih*${(v / ZONA.h).toFixed(4)}`;
  const rosso = pieno ? 'red@0.35:t=fill' : 'red@0.8:t=3';
  return [
    `drawbox=x=${X(s.x0)}:y=${Y(s.y0)}:w=${X(s.x1 - s.x0)}:h=${Y(t.y0 - s.y0)}:color=lime@0.8:t=3`,
    `drawbox=x=${X(s.x0)}:y=${Y(t.y0)}:w=${X(t.x0 - s.x0)}:h=${Y(s.y1 - t.y0)}:color=lime@0.8:t=3`,
    `drawbox=x=${X(t.x0)}:y=${Y(t.y0)}:w=${X(ZONA.w - t.x0)}:h=${Y(s.y1 - t.y0)}:color=${rosso}`,
    `drawbox=x=0:y=${Y(ZONA.cimitero.y0)}:w=iw:h=${Y(ZONA.h - ZONA.cimitero.y0)}:color=${rosso}`,
  ].join(',');
}
