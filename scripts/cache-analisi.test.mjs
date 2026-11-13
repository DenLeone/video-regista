import test from 'node:test';
import assert from 'node:assert/strict';
import { cacheSorgente, improntaMateriale, riusoAnalisiIntera, scegliCacheAnalisi } from './cache-analisi.mjs';

test('impronta: stessi file in ordine diverso, stessa impronta', () => {
  const a = improntaMateriale([{ id: 'B', byte: 2 }, { id: 'A', byte: 1 }]);
  const b = improntaMateriale([{ id: 'A', byte: 1 }, { id: 'B', byte: 2 }]);
  assert.equal(a, b);
  assert.notEqual(a, improntaMateriale([{ id: 'A', byte: 9 }, { id: 'B', byte: 2 }]));
});

test('cache senza byte: solo correzione e solo render', () => {
  const cache = { sorgenti: [{ id: 'A', parole: [{ w: 'ciao' }] }] };
  const s = { id: 'A', byte: 10 };
  assert.equal(cacheSorgente(cache, s, {}), null);
  assert.equal(cacheSorgente(cache, s, { correzione: true })?.parole[0].w, 'ciao');
  assert.equal(cacheSorgente(cache, s, { soloRender: true })?.parole[0].w, 'ciao');
});

test('byte diverso: la trascrizione non si riusa', () => {
  const cache = { sorgenti: [{ id: 'A', byte: 10, parole: [{ w: 'vecchia' }] }] };
  assert.equal(cacheSorgente(cache, { id: 'A', byte: 11 }, { correzione: true }), null);
  assert.equal(cacheSorgente(cache, { id: 'A', byte: 10 }, {})?.parole[0].w, 'vecchia');
});

test('analisi intera solo se impronta e modalità discorso coincidono', () => {
  const cache = { frasi: [{ id: 'F001' }], impronta: 'A:1', modoDiscorso: false };
  assert.equal(riusoAnalisiIntera(cache, 'A:1', false), true);
  assert.equal(riusoAnalisiIntera(cache, 'A:1', true), false);
  assert.equal(riusoAnalisiIntera(cache, 'A:2', false), false);
  assert.equal(riusoAnalisiIntera({ frasi: [{ id: 'F001' }] }, 'A:1', false), false);
});

test('tra cache del montaggio e analisi anticipata vince quella dei file sul disco', () => {
  const ufficiale = { frasi: [{ id: 'F001' }], impronta: 'A:1' };
  const anticipato = { frasi: [{ id: 'F009' }], impronta: 'A:2' };
  const file = new Map([['A', 2]]);
  assert.equal(scegliCacheAnalisi(ufficiale, anticipato, file), anticipato);
  assert.equal(scegliCacheAnalisi(ufficiale, anticipato, new Map([['A', 1]])), ufficiale);
  assert.equal(scegliCacheAnalisi(null, anticipato, file), anticipato);
  assert.equal(scegliCacheAnalisi({ frasi: [{ id: 'F001' }] }, null, file).frasi[0].id, 'F001');
});
