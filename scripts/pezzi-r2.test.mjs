import test from 'node:test';
import assert from 'node:assert/strict';
import { chiavePezziR2, comandiCopiaPezzoR2, comandiScaricaPezziR2, comandiCancellaPezziR2 } from './rete.mjs';

test('i pezzi di un giro stanno fuori dall\'inbox del girato', () => {
  assert.equal(chiavePezziR2('123-1'), 'pezzi/123-1');
  assert.throws(() => chiavePezziR2('../inbox'));
  const up = comandiCopiaPezzoR2({ dir: '/tmp/pezzo', bucket: 'regista-inbox', giro: '123-1', indice: 2 });
  assert.equal(up[0], 'copy');
  assert.equal(up[2], 'r2:regista-inbox/pezzi/123-1/pezzo-2');
  assert.equal(comandiScaricaPezziR2({ bucket: 'regista-inbox', giro: '123-1', dest: '/tmp/qui' })[1], 'r2:regista-inbox/pezzi/123-1');
  assert.equal(comandiCancellaPezziR2({ bucket: 'regista-inbox', giro: '123-1' })[1], 'r2:regista-inbox/pezzi/123-1');
});
