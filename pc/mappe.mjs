// Mappe dei capitoli (vlog di viaggio): mappa vera (OpenStreetMap) della zona, la linea del viaggio che
// si disegna dalla tappa prima a quella del capitolo, il pin e il nome, con un lento zoom. Il posto viene
// SOLO da quello scritto nel piano ("luogo": "Schloss Schönbrunn, Wien"), cercato nel paese del viaggio:
// se non si trova, niente mappa (mai una a caso). Le mappe e le ricerche restano in cache.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const UA = { 'user-agent': 'video-regista/1.0 (Denis, uso personale; vlog)' };
const attesa = (ms) => new Promise((ok) => setTimeout(ok, ms));

/** coordinate di un posto scritto a parole (OpenStreetMap), con il paese per non finire nel Belvedere sbagliato */
export async function cerca(luogo, paese, cache) {
  const k = `${luogo}|${paese || ''}`;
  if (cache[k] !== undefined) return cache[k];
  await attesa(1100); // una richiesta al secondo
  try {
    const q = new URLSearchParams({ q: luogo, format: 'jsonv2', limit: '1', 'accept-language': 'it', ...(paese ? { countrycodes: paese } : {}) });
    const j = await (await fetch(`https://nominatim.openstreetmap.org/search?${q}`, { headers: UA, signal: AbortSignal.timeout(15_000) })).json();
    cache[k] = j[0] ? { lat: Number(j[0].lat), lon: Number(j[0].lon), nome: j[0].display_name } : null;
  } catch { return null; } // rete giù: si riprova la prossima volta
  return cache[k];
}

// Web Mercator: coordinate → pixel al livello di zoom z
const px = (lon, z) => ((lon + 180) / 360) * 256 * 2 ** z;
const py = (lat, z) => { const r = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 256 * 2 ** z; };

async function tessera(z, x, y, dir) {
  const f = path.join(dir, `${z}-${x}-${y}.png`);
  if (fs.existsSync(f)) return f;
  for (let prova = 0; prova < 3; prova++) {
    try {
      const r = await fetch(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`, { headers: UA, signal: AbortSignal.timeout(20_000) });
      if (r.ok) { fs.writeFileSync(f, Buffer.from(await r.arrayBuffer())); return f; }
    } catch { /* riprova */ }
    await attesa(1500);
  }
  throw new Error(`tessera della mappa ${z}/${x}/${y} non scaricata`);
}

/**
 * clip della mappa (solo video, 1920×1080 poi portata a W×H) — da = tappa prima (o null), a = tappa del capitolo
 * @returns percorso dell'mp4
 */
export async function clipMappa({ da, a, nome, sotto, uscita, dir, W, H, FPS, dur = 3.5, encoder }) {
  if (fs.existsSync(uscita)) return uscita;
  const MW = 1920, MH = 1080;
  // zoom: entrambe le tappe dentro il 60% del quadro; da sola, vista di città
  let z = 13;
  if (da) {
    for (z = 15; z > 4; z--) if (Math.abs(px(a.lon, z) - px(da.lon, z)) < MW * 0.6 && Math.abs(py(a.lat, z) - py(da.lat, z)) < MH * 0.6) break;
  }
  const cx = da ? (px(a.lon, z) + px(da.lon, z)) / 2 : px(a.lon, z), cy = da ? (py(a.lat, z) + py(da.lat, z)) / 2 : py(a.lat, z);
  const x0 = cx - MW / 2, y0 = cy - MH / 2;
  const tx0 = Math.floor(x0 / 256), ty0 = Math.floor(y0 / 256), tx1 = Math.floor((x0 + MW) / 256), ty1 = Math.floor((y0 + MH) / 256);
  fs.mkdirSync(dir, { recursive: true });
  const tessere = [];
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) tessere.push({ f: await tessera(z, tx, ty, dir), x: (tx - tx0) * 256, y: (ty - ty0) * 256 });
  // mosaico delle tessere, ritagliato sul quadro
  const nx = tx1 - tx0 + 1;
  const sfondo = path.join(dir, `sfondo-${path.basename(uscita, '.mp4')}.png`);
  const ins = tessere.flatMap((t) => ['-i', t.f]);
  const lay = tessere.map((t) => `${t.x}_${t.y}`).join('|');
  const ox = Math.round(x0 - tx0 * 256), oy = Math.round(y0 - ty0 * 256);
  let r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...ins, '-filter_complex', `${tessere.map((_, k) => `[${k}:v]format=rgb24[t${k}]`).join(';')};${tessere.map((_, k) => `[t${k}]`).join('')}xstack=inputs=${tessere.length}:layout=${lay}:fill=white,crop=${MW}:${MH}:${ox}:${oy}`, '-frames:v', '1', sfondo]);
  if (r.status !== 0) throw new Error(`mappa: ${String(r.stderr).slice(-300)}`);
  // linea del viaggio a puntini che si disegna in 1,5 s, pin, nome; colori un po' spenti e zoom lento
  const ax = px(a.lon, z) - x0, ay = py(a.lat, z) - y0;
  const punti = [];
  if (da) {
    const bx = px(da.lon, z) - x0, by = py(da.lat, z) - y0, n = 70;
    for (let k = 0; k <= n; k++) punti.push({ x: bx + ((ax - bx) * k) / n, y: by + ((ay - by) * k) / n, t: 0.3 + (1.5 * k) / n });
  }
  const scrivi = (f, t) => { fs.writeFileSync(path.join(dir, f), t); return f; };
  const fNome = scrivi(`nome-${path.basename(uscita, '.mp4')}.txt`, nome.toUpperCase());
  const fSotto = sotto ? scrivi(`sotto-${path.basename(uscita, '.mp4')}.txt`, sotto) : null;
  const tPin = da ? 1.8 : 0.4;
  const disegni = [
    'eq=saturation=0.55:brightness=-0.04:contrast=1.05',
    ...punti.map((p) => `drawbox=x=${Math.round(p.x - 5)}:y=${Math.round(p.y - 5)}:w=10:h=10:color=0xE53935:t=fill:enable='gte(t,${p.t.toFixed(2)})'`),
    ...(da ? [`drawbox=x=${Math.round(punti[0].x - 11)}:y=${Math.round(punti[0].y - 11)}:w=22:h=22:color=white:t=fill`, `drawbox=x=${Math.round(punti[0].x - 7)}:y=${Math.round(punti[0].y - 7)}:w=14:h=14:color=0x333333:t=fill`] : []),
    `drawbox=x=${Math.round(ax - 17)}:y=${Math.round(ay - 17)}:w=34:h=34:color=white:t=fill:enable='gte(t,${tPin})'`,
    `drawbox=x=${Math.round(ax - 12)}:y=${Math.round(ay - 12)}:w=24:h=24:color=0xE53935:t=fill:enable='gte(t,${tPin})'`,
    // nome a destra del pin, a sinistra se il pin è verso il bordo destro
    `drawtext=fontfile=font.ttf:textfile=${fNome}:fontsize=64:fontcolor=0xFFE500:borderw=6:bordercolor=black:x=${ax > MW * 0.55 ? `${Math.round(ax - 30)}-text_w` : Math.round(ax + 30)}:y=${Math.round(ay - 60)}:enable='gte(t,${tPin + 0.15})'`,
    ...(fSotto ? [`drawtext=fontfile=font.ttf:textfile=${fSotto}:fontsize=34:fontcolor=white:borderw=4:bordercolor=black:x=${ax > MW * 0.55 ? `${Math.round(ax - 32)}-text_w` : Math.round(ax + 32)}:y=${Math.round(ay + 12)}:enable='gte(t,${tPin + 0.3})'`] : []),
    `drawtext=fontfile=font.ttf:text='© OpenStreetMap':fontsize=20:fontcolor=black@0.7:x=w-tw-14:y=h-th-10`,
  ];
  const frames = Math.round(dur * FPS);
  // zoom lento verso il pin (il pin resta fermo sullo schermo)
  const AX = ax.toFixed(1), AY = ay.toFixed(1);
  const vf = `${disegni.join(',')},zoompan=z='1+0.07*on/${frames}':x='${AX}-${AX}/zoom':y='${AY}-${AY}/zoom':d=1:s=${W}x${H}:fps=${FPS},format=yuv420p,setsar=1`;
  r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-loop', '1', '-framerate', String(FPS), '-t', String(dur), '-i', sfondo, '-vf', vf, '-t', String(dur), ...encoder, '-an', uscita], { cwd: dir });
  if (r.status !== 0) throw new Error(`mappa: ${String(r.stderr).split('\n').filter(Boolean).slice(-2).join(' | ')}`);
  return uscita;
}
