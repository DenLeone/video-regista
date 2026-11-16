import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { LUT_ILOG, LUT_SLOG3, filtroTecnico, nomeLog, riconosciLog } from './colore.mjs';

// 🎥 16/11: Denis gira in log anche con la Sony (S-Log3) per i documentari, come con la Insta360 (I-Log)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'colore-'));
const info = (pix = 'yuv420p10le') => ({ durata: 10, tags: {}, colore: { trc: 'bt709', primaries: 'bt709', matrix: 'bt709', pix } });
const finto = path.join(tmp, 'non-esiste.mp4'); // nessun fotogramma: niente statistiche, decide solo il brief

test('la LUT tecnica giusta per ogni log', () => {
  assert.ok(filtroTecnico({ log: 'slog3' }).includes(path.basename(LUT_SLOG3)));
  assert.ok(filtroTecnico({ log: true }).includes(path.basename(LUT_ILOG)));
  assert.equal(nomeLog({ log: 'slog3' }), 'S-Log3');
  assert.equal(nomeLog({ log: true }), 'I-Log');
  assert.ok(fs.existsSync(LUT_SLOG3), 'manca la LUT Sony: python3 scripts/look/slog3_lut.py');
});

test('Sony: «s-log» nel brief lo forza (anche s-log3, slog3), «senza s-log» lo esclude', () => {
  for (const brief of ['girato in s-log', 'S-Log3', 'slog3 documentario']) {
    const i = info();
    const r = riconosciLog(finto, i, 'sony', brief, tmp);
    assert.equal(r.iLog, true, brief);
    assert.equal(r.tipo, 'S-Log3');
    assert.equal(i.colore.log, 'slog3');
  }
  assert.equal(riconosciLog(finto, info(), 'sony', 'senza s-log', tmp).iLog, false);
  assert.equal(riconosciLog(finto, info(), 'sony', '', tmp).iLog, false);
  // «i-log» nel brief non converte un file Sony con la LUT Insta360
  assert.equal(riconosciLog(finto, info(), 'sony', 'i-log', tmp).iLog, false);
});

test('Insta360: l\'I-Log resta come prima', () => {
  const i = info();
  const r = riconosciLog(finto, i, 'insta', 'i-log', tmp);
  assert.equal(r.tipo, 'I-Log');
  assert.equal(i.colore.log, true);
  assert.equal(riconosciLog(finto, info(), 'insta', 'senza i-log', tmp).iLog, false);
});
