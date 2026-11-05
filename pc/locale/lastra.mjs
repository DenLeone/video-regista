// Movimento del presentatore per DaVinci: dove sta e quanto è grande il video vero, fotogramma per fotogramma,
// con la stessa geometria della lastra di Remotion (geometriaLastra in src/rotolo/impagina.ts), così il video
// sotto (V1) e la grafica trasparente sopra (V2) coincidono.
//   node --experimental-strip-types --no-warnings pc/locale/lastra.mjs <beats.json> <uscita.json> [--fps 29.97] [--w 2160 --h 3840]
// Uscita: { fps, w, h, tratti: [{ da, a, zoom, pan, tilt, p }] } (p = quota di schermo della lastra: 1 intero, 0,5 metà): fotogrammi [da, a) con la stessa trasformazione della
// clip nella pagina Edit di DaVinci (Zoom, Pan, Tilt in pixel). Il Transform in Fusion messo da script non arriva al
// render (verificato: il fotogramma esce identico all'originale), le proprietà della clip sì.
import fs from 'node:fs';
import { geometriaLastra, lastra, trattiLastra } from '../../src/rotolo/impagina.ts';

const args = process.argv.slice(2);
const opz = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const [fileBeats, uscita] = args;
if (!uscita) { console.error('uso: node --experimental-strip-types pc/locale/lastra.mjs <beats.json> <uscita.json> [--fps 29.97]'); process.exit(1); }
const doc = JSON.parse(fs.readFileSync(fileBeats, 'utf8'));
if (!doc.presentatore) { console.error('beats.json senza presentatore'); process.exit(1); }
const fps = Number(opz('--fps', doc.fps ?? 30));
const W = Number(opz('--w', 2160)), H = Number(opz('--h', 3840));
const trattiL = trattiLastra(doc);
const n = Math.round(doc.durata * fps);

// tratti di fotogrammi con la stessa trasformazione: nelle transizioni uno per fotogramma, fermi altrove.
// DaVinci (pagina Edit): Zoom attorno al centro, Pan/Tilt in pixel della timeline, Tilt positivo = su.
const tratti = [];
for (let f = 0; f < n; f++) {
  const t = f / fps;
  const p = Math.max(0.001, lastra(doc, t, trattiL)); // nascosto: il video resta dietro la grafica, fermo
  const { alta, left, top, vw, vh } = geometriaLastra(doc.presentatore, p, t, W, H);
  const cx = left + vw / 2, cy = (H - alta) + top + vh / 2;
  const k = { zoom: +(vw / W).toFixed(4), pan: Math.round(cx - W / 2), tilt: Math.round(H / 2 - cy), p: +p.toFixed(3) };
  const u = tratti.at(-1);
  // uguale al tratto in corso (entro 1 px e 0,0005 di zoom): lo allunga
  if (u && Math.abs(u.zoom - k.zoom) < 5e-4 && Math.abs(u.pan - k.pan) <= 1 && Math.abs(u.tilt - k.tilt) <= 1 && Math.abs(u.p - k.p) < 0.01) u.a = f + 1;
  else tratti.push({ da: f, a: f + 1, ...k });
}
fs.writeFileSync(uscita, JSON.stringify({ fps, w: W, h: H, tratti }));
console.log(`[lastra] ${tratti.length} tratti su ${n} fotogrammi → ${uscita}`);
