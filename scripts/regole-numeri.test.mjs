import assert from 'node:assert/strict';
import { test } from 'node:test';
import { conRegoleNumeri } from './regista.mjs';

// 📊 17/11: le regole dell'Analista arrivano anche ai montaggi lanciati dal bot, una volta sola
test('le regole dei numeri entrano nel brief una volta sola', () => {
  const regole = '- Tieni il montato tra 28 e 45 secondi.';
  const b = conRegoleNumeri('Stile: Impact', regole);
  assert.match(b, /Dai numeri dei social/);
  assert.match(b, /28 e 45/);
  assert.equal(conRegoleNumeri(b, regole), b);
  assert.equal(conRegoleNumeri('Stile: Kal', ''), 'Stile: Kal');
});
