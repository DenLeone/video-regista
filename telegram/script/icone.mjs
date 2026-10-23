// Icone e splash senza dipendenze: PNG RGBA, sfondo scuro, segno bianco.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'app');

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(tipo, dati) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(dati.length);
  const t = Buffer.from(tipo);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, dati])));
  return Buffer.concat([len, t, dati, crc]);
}

function png(w, h, pixel) {
  const stride = w * 4 + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = pixel(x, y, w, h);
      const o = y * stride + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const firma = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([firma, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

function dentroTriangolo(x, y, punti) {
  const [a, b, c] = punti;
  const segno = (p, q, r) => (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1]);
  const d1 = segno([x, y], a, b);
  const d2 = segno([x, y], b, c);
  const d3 = segno([x, y], c, a);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

function icona(maskable) {
  return (x, y, w, h) => {
    const cx = (w - 1) / 2;
    const cy = (h - 1) / 2;
    const s = Math.min(w, h);
    const nx = (x - cx) / (s / 2);
    const ny = (y - cy) / (s / 2);
    const raggio = Math.hypot(nx, ny);
    const bordo = maskable ? 0.72 : 0.86;
    let R = 7, G = 8, B = 10;
    if (raggio < bordo) {
      const luce = Math.max(0, 1 - raggio / bordo);
      R = 22 + luce * 18;
      G = 22 + luce * 16;
      B = 26 + luce * 14;
    }
    const anello = Math.abs(raggio - bordo * 0.78) < 0.025;
    if (anello && raggio < bordo) { R = 245; G = 245; B = 247; }
    const u = s * (maskable ? 0.16 : 0.2);
    const tri = [[cx - u * 0.35, cy - u * 0.55], [cx - u * 0.35, cy + u * 0.55], [cx + u * 0.62, cy]];
    if (dentroTriangolo(x + 0.5, y + 0.5, tri)) { R = 245; G = 245; B = 247; }
    return [R, G, B, 255];
  };
}

function splash(x, y, w, h) {
  const cx = (w - 1) / 2;
  const cy = h * 0.42;
  const s = 280;
  const dx = x - cx;
  const dy = y - cy;
  if (dx * dx + dy * dy < (s / 2) * (s / 2)) return icona(false)(x - (cx - s / 2), y - (cy - s / 2), s, s);
  if (Math.abs(y - h * 0.62) < 1.5 && Math.abs(x - cx) < 72) return [245, 245, 247, 255];
  return [7, 8, 10, 255];
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'icon-192.png'), png(192, 192, icona(false)));
fs.writeFileSync(path.join(OUT, 'icon-512.png'), png(512, 512, icona(false)));
fs.writeFileSync(path.join(OUT, 'icon-maskable.png'), png(512, 512, icona(true)));
fs.writeFileSync(path.join(OUT, 'apple-touch-icon.png'), png(180, 180, icona(false)));
fs.writeFileSync(path.join(OUT, 'splash-1320x2868.png'), png(1320, 2868, splash));
console.log('icone scritte in', OUT);
