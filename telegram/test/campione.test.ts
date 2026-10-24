import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AUDIO_MAX, bozzaNuova, contaSalti, messaggioDecodifica, quadroVuoto, ricaricoBloccato, statLuma, èErroreRete,
} from '../app/campione.js';

test('un fotogramma nero non conta, uno vero sì', () => {
  assert.equal(quadroVuoto(0, 0), true);
  assert.equal(quadroVuoto(8, 10), true);
  assert.equal(quadroVuoto(4, 80), false);
  assert.equal(quadroVuoto(40, 2), false);
  const nero = statLuma(new Uint8Array(64));
  assert.equal(nero.vuoto, true);
  const vivo = new Uint8Array(64);
  vivo[0] = 220;
  vivo[1] = 180;
  vivo[2] = 40;
  vivo[32] = 10;
  assert.equal(statLuma(vivo).vuoto, false);
  assert.equal(contaSalti([10, 10, 40, 41]), 1);
  assert.equal(AUDIO_MAX, 8 * 1024 * 1024);
  assert.match(messaggioDecodifica(), /HEVC/);
});

test('la bozza nuova si riconosce dal quando, e il ricarico aspetta', () => {
  assert.equal(bozzaNuova({ haTesto: true, quando: 20 }, 10), true);
  assert.equal(bozzaNuova({ haTesto: true, quando: 10 }, 10), false);
  assert.equal(bozzaNuova({ haTesto: false, quando: 30 }, 10), false);
  assert.equal(bozzaNuova(null, 0), false);
  assert.equal(ricaricoBloccato({ occupato: 'L’AI analizza…', invio: false }, 'scelta'), true);
  assert.equal(ricaricoBloccato({ occupato: '', invio: true }, 'scelta'), true);
  assert.equal(ricaricoBloccato({ occupato: '', invio: false }, 'invio'), true);
  assert.equal(ricaricoBloccato({ occupato: '', invio: false }, 'scelta'), false);
  assert.equal(èErroreRete(new TypeError('Load failed')), true);
  assert.equal(èErroreRete(new TypeError('Failed to fetch')), true);
  assert.equal(èErroreRete({ name: 'TimeoutError', message: 'The operation was aborted due to timeout' }), true);
  assert.equal(èErroreRete(new Error('Gemini non ha risposto e sul Worker non c’è una chiave Claude HTTP. Riprova tra un momento.')), false);
});
