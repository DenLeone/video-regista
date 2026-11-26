// Ritaglio 9:16 che segue il viso (Denis, 26/11): il girato è orizzontale (il teleprompter non permette la camera
// in verticale), il verticale si ritaglia dal 4K tenendo il viso al centro. Il viso si cerca ogni mezzo secondo
// su fotogrammi piccoli (scripts/volto.py, OpenCV); qui la traccia si liscia e diventa l'espressione di ffmpeg.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Il brief chiede il verticale ricavato da un girato orizzontale. */
export const vuoleVerticale = (brief) => /formato\s*:\s*vertical|vertical[ei]\s+da\s+orizzontal|ritaglia(?:to|re)?\s+(?:in\s+)?vertical|9\s*:\s*16\s+da\s+orizzontal/i.test(String(brief || ''));

const mediana3 = (v) => v.map((x, i) => [v[i - 1], x, v[i + 1]].filter((n) => n != null).sort((a, b) => a - b).reduce((m, n, _i, a) => (a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2), 0));

/**
 * campioni [[t, cx|null, larghezza]] → traccia liscia [[t, cx]]: buchi colmati, mediana, e una piccola zona morta
 * (il ritaglio non trema per un viso che si muove di pochissimo). Senza nessun viso: null (si ritaglia al centro).
 */
export function lisciaTraccia(campioni, zonaMorta = 0.015) {
  const t = (campioni || []).map((c) => c[0]);
  const trovati = (campioni || []).filter((c) => c[1] != null);
  if (!trovati.length) return null;
  const grezzi = campioni.map((c, i) => {
    if (c[1] != null) return c[1];
    const prima = [...campioni.slice(0, i)].reverse().find((x) => x[1] != null);
    const dopo = campioni.slice(i + 1).find((x) => x[1] != null);
    if (prima && dopo) return prima[1] + ((dopo[1] - prima[1]) * (c[0] - prima[0])) / (dopo[0] - prima[0]);
    return (prima || dopo)[1];
  });
  const m = mediana3(grezzi);
  const out = [];
  let ultimo = m[0];
  m.forEach((x, i) => { if (Math.abs(x - ultimo) >= zonaMorta) ultimo = x; out.push([t[i], +ultimo.toFixed(4)]); });
  return out;
}

/** Posizione del viso (0..1) al secondo `t`, interpolata fra i campioni. */
export function cxA(traccia, t) {
  if (!traccia?.length) return 0.5;
  if (t <= traccia[0][0]) return traccia[0][1];
  for (let i = 1; i < traccia.length; i++) {
    if (t <= traccia[i][0]) {
      const [t0, a] = traccia[i - 1];
      const [t1, b] = traccia[i];
      return t1 === t0 ? b : a + ((b - a) * (t - t0)) / (t1 - t0);
    }
  }
  return traccia[traccia.length - 1][1];
}

/** Filtro ffmpeg: ritaglio 9:16 dell'altezza intera, centrato sul viso e mai fuori dal fotogramma. */
export function filtroRitaglioVolto(traccia, start, dur, durFiltro = dur) {
  const a0 = cxA(traccia, start).toFixed(4);
  const a1 = cxA(traccia, start + dur).toFixed(4);
  const d = Math.max(0.1, durFiltro).toFixed(3);
  return `crop=w=trunc(ih*9/16/2)*2:h=ih:x='min(max(iw*(${a0}+(${a1}-${a0})*t/${d})-out_w/2,0),iw-out_w)':y=0,`;
}

/** Cerca il viso nel video: ffmpeg estrae fotogrammi piccoli, OpenCV li guarda. Mai un errore: null = al centro. */
export function tracciaVolto(file, durata, log = () => {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'volto-'));
  try {
    const passo = Math.max(0.5, durata / 300); // al massimo 300 fotogrammi
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', file, '-vf', `fps=1/${passo},scale=640:-2`, '-q:v', '4', path.join(dir, '%05d.jpg')], { stdio: ['ignore', 'ignore', 'pipe'], maxBuffer: 1 << 24 });
    const uscita = path.join(dir, 'volto.json');
    execFileSync('python3', [path.join(path.dirname(fileURLToPath(import.meta.url)), 'volto.py'), dir, uscita, String(passo)], { stdio: ['ignore', 'ignore', 'inherit'] });
    const { campioni } = JSON.parse(fs.readFileSync(uscita, 'utf8'));
    const traccia = lisciaTraccia(campioni);
    const visti = (campioni || []).filter((c) => c[1] != null).length;
    log(`  viso trovato in ${visti} fotogrammi su ${(campioni || []).length}${traccia ? `, posizione media ${(traccia.reduce((s, x) => s + x[1], 0) / traccia.length).toFixed(2)}` : ': ritaglio al centro'}`);
    return traccia;
  } catch (e) {
    log(`  viso: non riuscito (${String(e.message).split('\n')[0]}): ritaglio al centro`);
    return null;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
