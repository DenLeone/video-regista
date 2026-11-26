import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { comandiTaglio } from './regista.mjs';
import { cxA, filtroRitaglioVolto, lisciaTraccia, vuoleVerticale } from './volto.mjs';

const ffmpegOk = !spawnSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' }).error;

test('il brief chiede il verticale da un girato orizzontale', () => {
  assert.ok(vuoleVerticale('Stile: Cinematico\nFormato: verticale'));
  assert.ok(vuoleVerticale('ritaglia in verticale seguendo il viso'));
  assert.ok(vuoleVerticale('verticale da orizzontale'));
  assert.ok(!vuoleVerticale('Stile: Cinematico'));
  assert.ok(!vuoleVerticale(''));
  assert.ok(!vuoleVerticale(undefined));
});

test('traccia del viso: nessun viso = null; buchi colmati; il ritaglio non trema', () => {
  assert.equal(lisciaTraccia([[0, null, 0], [0.5, null, 0]]), null);
  assert.equal(lisciaTraccia([]), null);
  const t = lisciaTraccia([[0, 0.4, 0.1], [0.5, null, 0], [1, 0.6, 0.1], [1.5, 0.6, 0.1]]);
  assert.equal(t.length, 4);
  assert.ok(t.every(([, x]) => x >= 0.4 && x <= 0.6));
  // un viso che si muove di pochissimo: la posizione resta ferma
  const fermo = lisciaTraccia([[0, 0.5, 0.1], [0.5, 0.505, 0.1], [1, 0.498, 0.1], [1.5, 0.502, 0.1]]);
  assert.ok(fermo.every(([, x]) => x === fermo[0][1]));
  // un viso solo a metà video: prima e dopo vale il primo/ultimo visto
  const parziale = lisciaTraccia([[0, null, 0], [0.5, null, 0], [1, 0.7, 0.1]]);
  assert.ok(parziale.every(([, x]) => x === 0.7));
});

test('posizione del viso fra i campioni e fuori dai bordi', () => {
  const tr = [[0, 0.2], [2, 0.6]];
  assert.equal(cxA(tr, -1), 0.2);
  assert.ok(Math.abs(cxA(tr, 1) - 0.4) < 1e-9);
  assert.equal(cxA(tr, 9), 0.6);
  assert.equal(cxA(null, 3), 0.5);
});

test('filtro di ritaglio: altezza intera, 9:16, dentro il fotogramma', () => {
  const f = filtroRitaglioVolto([[0, 0.3], [4, 0.7]], 1, 2);
  assert.match(f, /^crop=w=trunc\(ih\*9\/16\/2\)\*2:h=ih:x='min\(max\(iw\*\(0\.4000\+\(0\.6000-0\.4000\)\*t\/2\.000\)-out_w\/2,0\),iw-out_w\)':y=0,$/);
});

test('comandiTaglio: con la traccia del viso usa il ritaglio che segue il viso; senza, il centro di prima', () => {
  const base = { originale: '/x.mp4', colore: null, ritaglia916: true };
  const seg = comandiTaglio({ ...base, volto: [[0, 0.3], [4, 0.7]] }, 1, 2, '/o.mp4', false, true);
  assert.match(seg[seg.indexOf('-vf') + 1], /^crop=w=trunc\(ih\*9\/16\/2\)\*2:h=ih:x='min\(max\(iw\*\(/);
  const centro = comandiTaglio(base, 1, 2, '/o.mp4', false, true);
  assert.match(centro[centro.indexOf('-vf') + 1], /^crop=trunc\(ih\*9\/16\/2\)\*2:ih,/);
  const nessuno = comandiTaglio({ ...base, ritaglia916: false }, 1, 2, '/o.mp4', false, true);
  assert.doesNotMatch(nessuno[nessuno.indexOf('-vf') + 1], /crop=/);
});

test('ffmpeg: il verticale esce 1080x~1920 e segue il viso (rosso a sinistra, blu a destra)', { skip: !ffmpegOk }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'volto-t-'));
  const src = path.join(dir, 'src.mp4');
  // 1920x1080: metà sinistra rossa, metà destra blu
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=960x1080:r=25:d=2', '-f', 'lavfi', '-i', 'color=c=blue:s=960x1080:r=25:d=2',
    '-filter_complex', '[0][1]hstack', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', src]);
  const colore = (out) => execFileSync('ffmpeg', ['-v', 'error', '-i', out, '-frames:v', '1', '-vf', 'scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']).toJSON().data;
  const taglia = (volto, nome) => {
    const out = path.join(dir, nome);
    execFileSync('ffmpeg', comandiTaglio({ originale: src, colore: null, ritaglia916: true, volto }, 0, 1, out, false, true));
    const dim = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', out], { encoding: 'utf8' }).trim();
    return { dim, rgb: colore(out) };
  };
  const sx = taglia([[0, 0.2], [2, 0.2]], 'a.mp4');
  const dx = taglia([[0, 0.8], [2, 0.8]], 'b.mp4');
  // 9:16 con larghezza pari: l'altezza esce 1920 ± 4 (stesso arrotondamento del ritaglio al centro di prima)
  assert.match(sx.dim, /^1080,19(1\d|2\d)$/);
  assert.match(dx.dim, /^1080,19(1\d|2\d)$/);
  assert.ok(sx.rgb[0] > 150 && sx.rgb[2] < 100, `a sinistra doveva essere rosso: ${sx.rgb}`);
  assert.ok(dx.rgb[2] > 150 && dx.rgb[0] < 100, `a destra doveva essere blu: ${dx.rgb}`);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('volto.py: senza visi dà campioni vuoti e non si ferma', { skip: !ffmpegOk }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'volto-p-'));
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=s=320x180:r=2:d=2', path.join(dir, '%05d.jpg')]);
  const uscita = path.join(dir, 'u.json');
  const py = path.join(path.dirname(fileURLToPath(import.meta.url)), 'volto.py');
  execFileSync('python3', [py, dir, uscita, '0.5']);
  const { campioni } = JSON.parse(fs.readFileSync(uscita, 'utf8'));
  assert.ok(Array.isArray(campioni));
  assert.ok(campioni.every((c) => c[1] === null));
  // cartella che non esiste: nessun errore, uscita vuota
  const u2 = path.join(dir, 'u2.json');
  execFileSync('python3', [py, path.join(dir, 'non-c-e'), u2, '0.5'], { stdio: 'ignore' });
  assert.deepEqual(JSON.parse(fs.readFileSync(u2, 'utf8')).campioni, []);
  fs.rmSync(dir, { recursive: true, force: true });
});
