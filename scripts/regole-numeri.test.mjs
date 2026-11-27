import assert from 'node:assert/strict';
import { test } from 'node:test';
import { conRegoleNumeri, formulaDaPochi, VIDEO_PER_FORMULA } from './regista.mjs';

// 📊 17/11: le regole dell'Analista arrivano anche ai montaggi lanciati dal bot, una volta sola
test('le regole dei numeri entrano nel brief una volta sola', () => {
  const regole = '- Tieni il montato tra 28 e 45 secondi.';
  const b = conRegoleNumeri('Stile: Impact', regole);
  assert.match(b, /Dai numeri dei social/);
  assert.match(b, /28 e 45/);
  assert.equal(conRegoleNumeri(b, regole), b);
  assert.equal(conRegoleNumeri('Stile: Kal', ''), 'Stile: Kal');
});

// 📊 27/11: la formula di uno stile (con la durata) guida ogni montaggio di quello stile: da 1-2 video è un caso, si ignora
test('la formula dell\'Analista vale solo da 3 video in su', () => {
  assert.equal(VIDEO_PER_FORMULA, 3);
  const formula = (n) => `# Formula di Kal dai numeri (📊 Analista, 2026-11-23)\nDa ${n} video. Si aggiorna a ogni giro dell'Analista.\n\n- Durata tra 28 e 45 secondi`;
  assert.equal(formulaDaPochi(formula(1)), true);
  assert.equal(formulaDaPochi(formula(2)), true);
  assert.equal(formulaDaPochi(formula(3)), false);
  assert.equal(formulaDaPochi(formula(12)), false);
  assert.equal(formulaDaPochi('- una formula scritta a mano, senza conteggio'), false); // senza «Da N video» resta com'è
  assert.equal(formulaDaPochi(''), false);
});
