import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applicaFrasi, sostituzioniDa } from './regista.mjs';

test('sottotitoli: frasi corrette dal brief («A» → «B»), più corte o vuote, punteggiatura che resta', () => {
  const s = sostituzioniDa('Sottotitoli: «Il DDL è antisemitismo» → «Il DDL antisemitismo»\n«No. Cioè» -> «Nì. Cioè»\n«e È legittimo» → «È legittimo»');
  assert.equal(s.length, 3);
  const piano = { parole: ['Il', 'DDL', 'è', 'antisemitismo.', 'Israele?', 'No.', 'È', 'legittimo?', 'No.', 'Cioè', 'e', 'È', 'legittimo'].map((w, i) => ({ w, at: i, dur: 0.9 })), testo: 'Il DDL è antisemitismo.' };
  const regia = { testo_montato: 'Il DDL è antisemitismo e' };
  assert.equal(applicaFrasi(piano, regia, s).length, 3);
  assert.equal(piano.parole.map((p) => p.w).join(' '), 'Il DDL antisemitismo. Israele? No. È legittimo? Nì. Cioè È legittimo');
  assert.equal(piano.testo, 'Il DDL antisemitismo.');
  assert.ok(piano.parole.every((p, i, a) => i === 0 || p.at >= a[i - 1].at));
});
