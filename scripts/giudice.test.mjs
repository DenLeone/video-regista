import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Bozze in gara: Gemini finto sceglie lo stile; senza chiave vale il primo
test('giudicaAnteprime: sceglie con Gemini, ripiega sul primo', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'giudice-'));
  const video = path.join(dir, 'a.mp4');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=360x640:d=10', video]);
  let immagini = 0;
  const srv = http.createServer((q, r) => {
    let b = '';
    q.on('data', (d) => (b += d));
    q.on('end', () => {
      immagini = (b.match(/inline_data/g) || []).length;
      r.setHeader('content-type', 'application/json');
      r.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ scelta: 'Kal', motivo: 'più leggibile' }) }] } }] }));
    });
  });
  await new Promise((ok) => srv.listen(0, ok));
  process.env.GEMINI_URL = `http://127.0.0.1:${srv.address().port}`;
  process.env.GEMINI_API_KEY = 'x';
  process.env.GEMINI_MODELLI = 'gemini-3-flash';
  const { giudicaAnteprime } = await import('./regista.mjs');
  const pronti = [{ nomeStile: 'Cinematico', anteprima: video }, { nomeStile: 'Kal', anteprima: video }];
  const r = await giudicaAnteprime(pronti, 'prova');
  assert.equal(r.nomeStile, 'Kal');
  assert.equal(immagini, 8);
  delete process.env.GEMINI_API_KEY;
  assert.equal((await giudicaAnteprime(pronti)).nomeStile, 'Cinematico');
  srv.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
