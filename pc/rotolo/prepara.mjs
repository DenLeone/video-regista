// Rotolo, passo "prepara": completa beats.json e la cartella del documento prima del render.
//   node pc/rotolo/prepara.mjs <beats.json>
// - misura le proporzioni (ar = larghezza/altezza) di foto, ritagli e carte → le scrive nel json
// - scarica i font giapponesi ridotti ai soli caratteri usati (Google Fonts con &text=): pochi KB
// - copia le texture comuni (carta, tavolo, grana) se mancano: le genera pc/rotolo/texture.py
// La cartella è public/<cartella del json>.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const file = process.argv[2];
if (!file) { console.error('uso: node pc/rotolo/prepara.mjs <beats.json>'); process.exit(1); }
const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
const DIR = path.join(ROOT, 'public', doc.cartella);
if (!fs.existsSync(DIR)) { console.error(`manca la cartella ${DIR}`); process.exit(1); }

// ---------- proporzioni delle immagini
const ar = (n) => {
  const p = path.join(DIR, n);
  if (!fs.existsSync(p)) { console.error(`⚠ manca ${n}`); return undefined; }
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', p], { encoding: 'utf8' });
  const [w, h] = r.stdout.trim().split(',').map(Number);
  return w && h ? Math.round((w / h) * 1000) / 1000 : undefined;
};
const tutti = [...(doc.apertura ? [doc.apertura] : []), ...doc.beats];
const mancano = [];
for (const b of tutti) for (const el of b.elementi) {
  if (el.file) { el.ar = ar(el.file); if (!el.ar) mancano.push(el.file); }
  if (el.files) { el.ars = el.files.map(ar); el.files.forEach((n, i) => { if (!el.ars[i]) mancano.push(n); }); }
}
fs.writeFileSync(file, JSON.stringify(doc, null, 2));

// ---------- font: solo i caratteri del documento
const testi = [];
const raccogli = (o) => { if (typeof o === 'string') testi.push(o); else if (o && typeof o === 'object') Object.values(o).forEach(raccogli); };
raccogli(doc);
const LAT = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,;:!?&'+-→·àèéìòùÀÈÉÌÒÙ ";
const caratteri = [...new Set([...testi.join(''), ...LAT])].join('');
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36' };
for (const [fam, nome] of [['Shippori+Mincho:wght@500', 'mincho500'], ['Shippori+Mincho:wght@800', 'mincho800'], ['Yuji+Syuku', 'pennello']]) {
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${fam}&display=block&text=${encodeURIComponent(caratteri)}`, { headers: UA })).text();
  const url = /url\((.*?)\)/.exec(css)?.[1];
  if (!url) { console.error(`⚠ font ${nome}: risposta inattesa`); continue; }
  fs.writeFileSync(path.join(DIR, `${nome}.woff2`), Buffer.from(await (await fetch(url, { headers: UA })).arrayBuffer()));
}

// ---------- texture comuni
const COMUNI = path.join(ROOT, 'work', 'rotolo-comuni');
const servono = ['washi.jpg', 'tavolo.jpg', ...[0, 1, 2, 3, 4, 5].map((i) => `grana${i}.png`)];
if (servono.some((n) => !fs.existsSync(path.join(DIR, n)))) {
  if (servono.some((n) => !fs.existsSync(path.join(COMUNI, n)))) {
    const py = process.platform === 'win32' ? 'python' : 'python3';
    const r = spawnSync(py, [path.join(ROOT, 'pc', 'rotolo', 'texture.py'), COMUNI], { stdio: 'inherit' });
    if (r.status !== 0) { console.error('⚠ texture non generate'); process.exit(1); }
  }
  for (const n of servono) if (!fs.existsSync(path.join(DIR, n))) fs.copyFileSync(path.join(COMUNI, n), path.join(DIR, n));
}

const durata = Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(DIR, doc.voce)], { encoding: 'utf8' }).stdout);
if (durata && Math.abs(durata - doc.durata) > 0.3) console.error(`⚠ durata nel json ${doc.durata} s, voce ${durata.toFixed(2)} s`);
console.log(mancano.length ? `pronto, ma mancano ${mancano.length} immagini: ${mancano.join(', ')}` : `pronto: ${caratteri.length} caratteri nei font`);
if (mancano.length) process.exit(2);
