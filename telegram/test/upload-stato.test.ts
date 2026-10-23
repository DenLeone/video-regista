import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_PARTI, PARTE, byteFatti, dimensioneParte, etaSecondi, nomeSicuro, numeroParti, partiMancanti, registraEtag,
} from '../src/upload-stato';

test('un pezzo confermato non si rimanda e non si conta due volte', () => {
  let parti = registraEtag([], 2, '"abc"');
  parti = registraEtag(parti, 1, '"uno"');
  parti = registraEtag(parti, 2, '"due"');
  assert.deepEqual(parti.map((p) => p.n), [1, 2]);
  assert.equal(parti[1].etag, '"due"');
  assert.deepEqual(partiMancanti(4, parti), [3, 4]);
  const fatti = byteFatti(PARTE * 3, PARTE, parti);
  assert.equal(fatti, PARTE * 2);
});

test('i pezzi restano sopra i 5 MiB e sotto il tetto di R2', () => {
  assert.equal(dimensioneParte(10 * 1024 * 1024), PARTE);
  const enorme = 200 * 1024 * 1024 * 1024;
  const parte = dimensioneParte(enorme);
  assert.ok(parte >= PARTE);
  assert.ok(numeroParti(enorme, parte) <= MAX_PARTI);
  assert.equal(numeroParti(0), 0);
});

test('eta dai byte ancora da mandare', () => {
  assert.equal(etaSecondi(50, 100, 10), 5);
  assert.equal(etaSecondi(100, 100, 10), 0);
  assert.equal(etaSecondi(0, 100, 0), null);
});

test('il nome resta quello della camera, così il runner riconosce il dispositivo', () => {
  const usati = new Set<string>();
  assert.equal(nomeSicuro('DCIM/IMG_20261022.mov', usati), 'IMG_20261022.mov');
  assert.equal(nomeSicuro('IMG_20261022.mov', usati), 'IMG_20261022_2.mov');
  assert.equal(nomeSicuro('C0042.MP4', usati), 'C0042.MP4');
});
