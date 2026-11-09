// node --experimental-strip-types --test scripts/parole-fitte.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { paroleFitte, forza } from '../src/paroleFitte.ts';

const clip = (sec) => [{ file: 'a.mp4', start: 0, end: sec }];
// una parola ogni 0,4 s; ogni terza è "forte"
const parlato = (sec) => Array.from({ length: Math.floor(sec / 0.4) }, (_, i) => ({
  at: +(i * 0.4).toFixed(2), dur: 0.3, w: i % 3 === 0 ? `Montagna${i}` : 'che',
}));
const senzaSovrapposizioni = (ks) => {
  for (let i = 1; i < ks.length; i++) {
    assert.ok(ks[i - 1].at + ks[i - 1].dur <= ks[i].at + 1e-6, `${ks[i - 1].word} copre ${ks[i].word}`);
  }
};

test('senza parlato restano le parole della regia', () => {
  const k = [{ at: 5, dur: 2, word: 'B' }, { at: 1, dur: 2, word: 'A' }];
  assert.deepEqual(paroleFitte({ clips: clip(10), keywords: k }).map((x) => x.word), ['A', 'B']);
});

test('una parola della regia subito dopo il punto di ricerca non blocca (era un giro infinito)', () => {
  // t parte da 0,2: una parola a 0,6 metteva il limite a 0,0 e il giro non avanzava più
  for (const at of [0.45, 0.6, 0.8, 1.0, 1.3]) {
    const piano = { clips: clip(30), keywords: [{ at, dur: 1.5, word: 'Regia' }], parole: parlato(30) };
    const ks = paroleFitte(piano);
    assert.ok(ks.some((k) => k.word === 'Regia'));
    assert.ok(ks.length > 5, `a ${at}s: solo ${ks.length} parole`);
    senzaSovrapposizioni(ks);
  }
});

test('riempie i buchi: una parola ogni 2–4 s, mai sopra quelle della regia', () => {
  const regia = [{ at: 4, dur: 2, word: 'Uno' }, { at: 20.3, dur: 1.4, word: 'Due' }, { at: 22.1, dur: 2, word: 'Tre' }];
  const ks = paroleFitte({ clips: clip(60), keywords: regia, parole: parlato(60) });
  senzaSovrapposizioni(ks);
  for (const k of ks) assert.ok(k.dur >= 1.2 - 1e-6 || regia.includes(k), `${k.word} dura ${k.dur}`);
  for (let i = 1; i < ks.length; i++) assert.ok(ks[i].at - ks[i - 1].at < 6, `buco di ${ks[i].at - ks[i - 1].at}s`);
  assert.ok(ks.at(-1).at + ks.at(-1).dur <= 60 + 1e-6);
});

test('dati sporchi: durate a zero, parole oltre la fine, niente clip', () => {
  const sporco = [{ at: 3, dur: 0, word: 'Zero' }, { at: 3.3, dur: -1, word: 'Meno' }, { at: 90, dur: 2, word: 'Oltre' }];
  assert.ok(paroleFitte({ clips: clip(20), keywords: sporco, parole: parlato(20) }).length >= 3);
  assert.deepEqual(paroleFitte({ clips: [], keywords: [], parole: parlato(5) }), []);
});

test('forza: numeri e nomi propri vincono, le parole vuote no', () => {
  assert.equal(forza('che', false), 0);
  assert.equal(forza('2024,', false), 10);
  assert.ok(forza('Olivetti', false) > forza('olivetti', false));
  assert.ok(forza('Olivetti', true) === forza('olivetti', false));
});
