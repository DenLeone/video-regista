import assert from 'node:assert/strict';
import { test } from 'node:test';
import { avvisiSync, notaModello } from './regista.mjs';

// ⚠️ 17/11: avvisi in chiaro a Denis quando la regia l'ha fatta il modello leggero o il labiale rischia di non tornare
test('nota del modello leggero: solo col Lite e solo se il discorso non lo dice già', () => {
  assert.match(notaModello('gemini-3.5-flash-lite'), /modello leggero/);
  assert.equal(notaModello('gemini-3.8-flash'), '');
  assert.equal(notaModello('claude'), '');
  assert.equal(notaModello(undefined), '');
  assert.equal(notaModello('gemini-flash-lite-latest', true), '');
});

const parole = [{ w: 'ciao', s: 0, e: 0.3 }];
test('voce del microfono non agganciata a nessun video: avviso', () => {
  const sorgenti = [
    { id: 'VO', tipo: 'audio', principale: true, parole },
    { id: 'CAM', tipo: 'video', parlato: false },
  ];
  const a = avvisiSync(sorgenti);
  assert.equal(a.length, 1);
  assert.match(a[0], /non si aggancia a nessun video/);
});

test('microfono agganciato alla camera: nessun avviso', () => {
  const sorgenti = [
    { id: 'VO', tipo: 'audio', principale: true, parole },
    { id: 'CAM', tipo: 'video', parlato: true, sync: { con: 'VO', offset: 2.37 } },
  ];
  assert.deepEqual(avvisiSync(sorgenti), []);
});

test('camera con voce sua non agganciata al microfono: due discorsi separati, detto', () => {
  const sorgenti = [
    { id: 'VO', tipo: 'audio', principale: true, parole },
    { id: 'CAM', tipo: 'video', principale: true, parole },
  ];
  const a = avvisiSync(sorgenti);
  assert.ok(a.some((x) => /discorso separato/.test(x)));
  assert.ok(a.some((x) => /non si aggancia a nessun video/.test(x)));
});

test('solo video (niente microfono esterno): nessun avviso di sync', () => {
  assert.deepEqual(avvisiSync([{ id: 'CAM', tipo: 'video', principale: true, parole }]), []);
});
