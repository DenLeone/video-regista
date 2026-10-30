// Mappe dei capitoli (vlog di viaggio), disegnate da zero: sfondo scuro, confini dei paesi (Natural
// Earth, dominio pubblico) con il paese del viaggio evidenziato, il viaggio fatto finora come una linea
// tenue e la tappa nuova come un arco luminoso che si disegna, pin rotondi che spuntano con un anello.
// Niente scritte della mappa: solo i nomi delle tappe. Il posto viene SOLO da quello scritto nel piano
// ("luogo"); se non si trova, niente mappa. Spostamenti di pochi km (stessa città): niente mappa.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const UA = { 'user-agent': 'video-regista/1.0 (Denis, uso personale; vlog)' };
const attesa = (ms) => new Promise((ok) => setTimeout(ok, ms));
const CONFINI = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson';

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
export const km = (a, b) => { const r = Math.PI / 180, x = (b.lon - a.lon) * r * Math.cos(((a.lat + b.lat) / 2) * r), y = (b.lat - a.lat) * r; return Math.hypot(x, y) * 6371; };

async function confini(dir) {
  const f = path.join(dir, 'confini-50m.geojson');
  if (!fs.existsSync(f)) {
    const r = await fetch(CONFINI, { headers: UA, signal: AbortSignal.timeout(120_000) });
    if (!r.ok) throw new Error(`confini dei paesi non scaricati (${r.status})`);
    fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
  }
  return JSON.parse(fs.readFileSync(f, 'utf8')).features.map((x) => ({
    iso: String(x.properties.ISO_A2_EH || x.properties.ISO_A2 || '').toLowerCase(),
    poligoni: x.geometry.type === 'Polygon' ? [x.geometry.coordinates] : x.geometry.coordinates,
  }));
}

// proiezione di Mercatore normalizzata (0..1)
const mx = (lon) => (lon + 180) / 360;
const my = (lat) => { const r = (lat * Math.PI) / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2; };

// ---------- disegno su un buffer RGB ----------
const COL = { fondo: [12, 18, 26], terra: [30, 40, 50], casa: [44, 60, 74], confine: [64, 82, 98], confineCasa: [120, 145, 165] };
function riempi(buf, w, h, punti, col) { // poligono pieno, scanline even-odd
  let y0 = Infinity, y1 = -Infinity;
  for (const [, y] of punti) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  for (let y = Math.max(0, Math.ceil(y0)); y <= Math.min(h - 1, Math.floor(y1)); y++) {
    const xs = [];
    for (let i = 0, j = punti.length - 1; i < punti.length; j = i++) {
      const [xa, ya] = punti[i], [xb, yb] = punti[j];
      if ((ya > y) !== (yb > y)) xs.push(xa + ((y - ya) * (xb - xa)) / (yb - ya));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.max(0, Math.ceil(xs[k])); x <= Math.min(w - 1, Math.floor(xs[k + 1])); x++) { const o = (y * w + x) * 3; buf[o] = col[0]; buf[o + 1] = col[1]; buf[o + 2] = col[2]; }
    }
  }
}
function punto(buf, w, h, cx, cy, r, col, a = 1) { // disco morbido (bordo sfumato di 1 px)
  for (let y = Math.max(0, Math.floor(cy - r - 1)); y <= Math.min(h - 1, Math.ceil(cy + r + 1)); y++) {
    for (let x = Math.max(0, Math.floor(cx - r - 1)); x <= Math.min(w - 1, Math.ceil(cx + r + 1)); x++) {
      const d = Math.hypot(x - cx, y - cy), k = Math.max(0, Math.min(1, r + 0.5 - d)) * a;
      if (k <= 0) continue;
      const o = (y * w + x) * 3;
      for (let c = 0; c < 3; c++) buf[o + c] = buf[o + c] + (col[c] - buf[o + c]) * k;
    }
  }
}
function linea(buf, w, h, pts, r, col, a) { for (let i = 0; i < pts.length; i++) punto(buf, w, h, pts[i][0], pts[i][1], r, col, a); }
// arco tra due punti (curva verso l'alto, 18% della distanza)
function arco(a, b, n = 160) {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
  const cx = (a[0] + b[0]) / 2 - (dy / len) * len * 0.18 * Math.sign(dx || 1), cy = (a[1] + b[1]) / 2 + (dx / len) * len * 0.18 * -Math.sign(dx || 1) - len * 0.05;
  return Array.from({ length: n + 1 }, (_, k) => { const t = k / n, u = 1 - t; return [u * u * a[0] + 2 * u * t * cx + t * t * b[0], u * u * a[1] + 2 * u * t * cy + t * t * b[1]]; });
}

/**
 * clip della mappa (solo video): tappe = [{ lat, lon, nome }] fino a quella del capitolo (l'ultima),
 * paese = codice a due lettere da evidenziare
 */
export async function clipMappa({ tappe, paese, uscita, dir, W, H, FPS, dur = 3.5, encoder }) {
  if (fs.existsSync(uscita)) return uscita;
  fs.mkdirSync(dir, { recursive: true });
  const paesi = await confini(dir);
  const MW = 1920, MH = 1080;
  // inquadratura: tutte le tappe finora, con margine, almeno ~250 km di larghezza, 16:9
  const xs = tappe.map((t) => mx(t.lon)), ys = tappe.map((t) => my(t.lat));
  let [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const minimo = 250 / 40075 / Math.cos((tappe[tappe.length - 1].lat * Math.PI) / 180);
  let sw = Math.max(x1 - x0, minimo) * 1.6, sh = Math.max(y1 - y0, minimo * 0.5625) * 1.6;
  if (sw / sh > MW / MH) sh = (sw * MH) / MW; else sw = (sh * MW) / MH;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const P = (lon, lat, S = 1) => [((mx(lon) - (cx - sw / 2)) / sw) * MW * S, ((my(lat) - (cy - sh / 2)) / sh) * MH * S];

  // sfondo: disegnato al doppio e rimpicciolito (bordi morbidi)
  const S = 2, bw = MW * S, bh = MH * S, big = new Float32Array(bw * bh * 3);
  for (let i = 0; i < bw * bh; i++) big.set(COL.fondo, i * 3);
  // solo gli anelli che toccano l'inquadratura
  const anelli = (p) => p.flatMap((poli) => poli.map((anello) => anello.map(([lon, lat]) => P(lon, lat, S))))
    .filter((a) => a.some(([x, y]) => x > -bw && x < 2 * bw && y > -bh && y < 2 * bh));
  const visti = paesi.map((p) => ({ ...p, a: anelli(p.poligoni) })).filter((p) => p.a.length);
  for (const p of visti) for (const a of p.a) riempi(big, bw, bh, a, p.iso === paese ? COL.casa : COL.terra);
  // confini continui: un punto ogni ~1,5 px lungo ogni lato (il paese del viaggio sopra gli altri)
  for (const p of [...visti.filter((x) => x.iso !== paese), ...visti.filter((x) => x.iso === paese)]) {
    const casa = p.iso === paese;
    for (const a of p.a) for (let i = 1; i < a.length; i++) {
      const [xa, ya] = a[i - 1], [xb, yb] = a[i], n = Math.ceil(Math.hypot(xb - xa, yb - ya) / 1.5);
      if ((xa < 0 && xb < 0) || (ya < 0 && yb < 0) || (xa > bw && xb > bw) || (ya > bh && yb > bh)) continue;
      for (let k = 0; k <= n; k++) punto(big, bw, bh, xa + ((xb - xa) * k) / n, ya + ((yb - ya) * k) / n, casa ? 2.2 : 1.2, casa ? COL.confineCasa : COL.confine);
    }
  }
  const base = new Float32Array(MW * MH * 3);
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) for (let c = 0; c < 3; c++) {
    base[(y * MW + x) * 3 + c] = (big[((2 * y) * bw + 2 * x) * 3 + c] + big[((2 * y) * bw + 2 * x + 1) * 3 + c] + big[((2 * y + 1) * bw + 2 * x) * 3 + c] + big[((2 * y + 1) * bw + 2 * x + 1) * 3 + c]) / 4;
  }
  // vignettatura
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) { const d = Math.hypot((x - MW / 2) / (MW / 2), (y - MH / 2) / (MH / 2)); const k = Math.max(0.55, 1 - Math.max(0, d - 0.55) * 0.6); for (let c = 0; c < 3; c++) base[(y * MW + x) * 3 + c] *= k; }

  const pp = tappe.map((t) => P(t.lon, t.lat));
  const fatto = pp.slice(0, -1).flatMap((p, i) => (i + 1 < pp.length - 1 ? arco(p, pp[i + 1]) : []));
  const nuovo = pp.length > 1 ? arco(pp[pp.length - 2], pp[pp.length - 1]) : [];
  const GIALLO = [255, 214, 0], BIANCO = [255, 255, 255];
  const N = Math.round(dur * FPS);

  // nomi delle tappe (il nuovo compare quando spunta il pin)
  const tPin = nuovo.length ? 1.9 : 0.4;
  const scritte = tappe.map((t, i) => {
    const f = `tappa-${path.basename(uscita, '.mp4')}-${i}.txt`;
    fs.writeFileSync(path.join(dir, f), t.nome);
    const [x, y] = pp[i], ultima = i === tappe.length - 1, destra = x < MW * 0.7;
    return `drawtext=fontfile=font.ttf:textfile=${f}:fontsize=${ultima ? 46 : 30}:fontcolor=${ultima ? '0xFFD600' : 'white@0.75'}:borderw=${ultima ? 5 : 3}:bordercolor=black@0.8:x=${destra ? Math.round(x + 26) : `${Math.round(x - 26)}-text_w`}:y=${Math.round(y - (ultima ? 26 : 18))}${ultima ? `:enable='gte(t,${tPin + 0.1})'` : ''}`;
  });
  const vf = [...scritte, `zoompan=z='1.04-0.04*on/${N}':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=${W}x${H}:fps=${FPS}`, 'format=yuv420p', 'setsar=1'].join(',');
  const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${MW}x${MH}`, '-r', String(FPS), '-i', '-', '-vf', vf, ...encoder, '-an', uscita], { cwd: dir, stdio: ['pipe', 'ignore', 'pipe'] });
  let errore = '';
  ff.stderr.on('data', (d) => { errore += d; });
  const fine = new Promise((ok) => ff.on('close', ok));
  const frame = new Float32Array(base.length), out = Buffer.alloc(MW * MH * 3);
  for (let f = 0; f < N; f++) {
    const t = f / FPS;
    frame.set(base);
    linea(frame, MW, MH, fatto, 2.5, BIANCO, 0.35); // viaggio fatto finora
    for (const p of pp.slice(0, -1)) { punto(frame, MW, MH, p[0], p[1], 8, BIANCO, 0.9); punto(frame, MW, MH, p[0], p[1], 4.5, COL.fondo, 1); }
    if (nuovo.length) {
      const k = Math.min(1, Math.max(0, (t - 0.25) / 1.6)), e = 1 - (1 - k) ** 3; // si disegna in 1,6 s, rallentando
      const fin = Math.max(1, Math.round(e * (nuovo.length - 1)));
      const tratto = nuovo.slice(0, fin + 1);
      linea(frame, MW, MH, tratto, 9, GIALLO, 0.12); // bagliore
      linea(frame, MW, MH, tratto, 4, GIALLO, 1);
      if (k < 1) punto(frame, MW, MH, tratto[tratto.length - 1][0], tratto[tratto.length - 1][1], 7, BIANCO, 1); // la punta
    }
    if (t >= tPin) { // il pin spunta (rimbalzo) e un anello pulsa
      const [x, y] = pp[pp.length - 1], q = Math.min(1, (t - tPin) / 0.35), s = q < 1 ? 1.25 * Math.sin(q * Math.PI * 0.62) / Math.sin(Math.PI * 0.62) : 1;
      const r2 = ((t - tPin) % 1.2) / 1.2;
      for (let a = 0; a < 360; a += 3) punto(frame, MW, MH, x + Math.cos((a * Math.PI) / 180) * (14 + 40 * r2), y + Math.sin((a * Math.PI) / 180) * (14 + 40 * r2), 2, GIALLO, (1 - r2) * 0.7);
      punto(frame, MW, MH, x, y, 15 * s, BIANCO, 1);
      punto(frame, MW, MH, x, y, 10 * s, GIALLO, 1);
    }
    for (let i = 0; i < out.length; i++) out[i] = frame[i];
    if (!ff.stdin.write(out)) await new Promise((ok) => ff.stdin.once('drain', ok));
  }
  ff.stdin.end();
  if ((await fine) !== 0) throw new Error(`mappa: ${errore.split('\n').filter(Boolean).slice(-2).join(' | ')}`);
  return uscita;
}
