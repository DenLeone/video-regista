import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { vuoleCarrello, momentiCarrello, PAGINA, DURATA } from './carrello.mjs';
import { dentroZona } from './zone.mjs';

test('il brief chiede il carrello', () => {
  assert.equal(vuoleCarrello('Stile: Kal\nSponsor: carrello (freccia…)'), true);
  assert.equal(vuoleCarrello('Stile: Kal\nSponsor: no'), false);
  assert.equal(vuoleCarrello(''), false);
});

test('ogni 5-6 secondi per 2 secondi, mai oltre la fine', () => {
  const m = momentiCarrello(30);
  assert.deepEqual(m.map((x) => x.at), [3, 8.5, 14, 19.5, 25]);
  assert.ok(m.every((x) => x.dur === DURATA && x.at + x.dur <= 29.7));
  assert.deepEqual(momentiCarrello(4), []);
});

test('scritta e freccia dentro le zone del verticale', () => {
  const html = fs.readFileSync(PAGINA, 'utf8');
  const pill = /PILL = \{ x: (\d+), y: (\d+), w: (\d+), h: (\d+) \}, PUNTA = (\d+)/.exec(html).slice(1).map(Number);
  assert.equal(dentroZona(pill[0], pill[1], pill[2], pill[3]), true, 'scritta');
  const punta = pill[4];
  assert.equal(dentroZona(pill[0], pill[1] + pill[3], 120, punta + 2 - pill[1] - pill[3]), true, 'freccia (punta + rimbalzo: 12 - 10)');
});
