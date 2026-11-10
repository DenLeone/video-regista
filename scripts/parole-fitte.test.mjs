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

test('render a pezzi: i pezzi coprono tutti i fotogrammi, senza buchi né doppioni', async () => {
  const { dividi } = await import('./pezzi.mjs');
  for (const [durata, pezzi] of [[412, 4], [2176, 4], [300, 4], [45, 4], [61, 3], [1, 4], [2176, 2]]) {
    const { passo, intervalli } = dividi(durata, pezzi);
    assert.equal(intervalli[0][0], 0);
    assert.equal(intervalli.at(-1)[1], durata - 1);
    intervalli.forEach(([da, a], i) => {
      assert.ok(a >= da);
      if (i) assert.equal(da, intervalli[i - 1][1] + 1);
      if (i < intervalli.length - 1) assert.equal(a - da + 1, passo);
    });
    assert.ok(intervalli.length <= pezzi);
  }
});

test('pezzi: ogni fotogramma ha le sue clip, con una di margine per parte', async () => {
  const { dividi, fotogrammiClip, clipDelTratto } = await import('./pezzi.mjs');
  const clips = [3.367, 6.067, 4.3, 2.8, 4.467, 0.5, 9.1, 1.234].map((d) => ({ start: 10, end: 10 + d }));
  const pos = fotogrammiClip(clips, 30);
  assert.equal(pos.clip[0].da, 0);
  assert.equal(pos.clip[1].da, 101);
  assert.ok(Math.abs(pos.durata - (pos.clip.at(-1).a + 1)) <= clips.length);
  const { intervalli } = dividi(pos.durata, 4);
  const viste = new Set();
  for (const [da, a] of intervalli) {
    const solo = clipDelTratto(pos.clip, da, a);
    pos.clip.forEach((p, i) => { if (p.a >= da && p.da <= a) assert.ok(solo.has(i), `clip ${i} manca nel tratto ${da}-${a}`); });
    for (const i of solo) viste.add(i);
  }
  assert.equal(viste.size, clips.length);
  assert.deepEqual([...clipDelTratto(pos.clip, 0, 10)], [0, 1]);
  assert.equal(clipDelTratto(pos.clip, 99999, 100000).size, 0);
});

test('nomi di prodotto dal nome della cartella: solo se c\'è una sigla con cifre', async () => {
  process.env.CARTELLA ??= '';
  const { nomiDellaCartella } = await import('./regista.mjs');
  assert.deepEqual(nomiDellaCartella('Ajazz AJ159 V2'), ['Ajazz', 'AJ159']);
  assert.deepEqual(nomiDellaCartella('Test Impact'), []);
  assert.deepEqual(nomiDellaCartella('Olivetti'), []);
  assert.deepEqual(nomiDellaCartella('Video 10-11-2026'), []);
});

test('immagini avanzate: solo sulla frase che ne parla, altrimenti fuori', async () => {
  const { usaTuttoIlMateriale } = await import('./regia.mjs');
  const frasi = ['Io ho un po di mouse', 'il mio preferito è questo', 'la batteria si cambia in un attimo', 'è sempre in carica nel ricevitore', 'cercare il cavo è una noia', 'il sensore è top di gamma', 'per me è un best buy']
    .map((testo, i) => ({ id: `F${String(i + 1).padStart(3, '0')}`, testo, inizio: i * 3, fine: i * 3 + 2.5, principale: 'A' }));
  const immagini = ['x-mouse-m1-batteria-estratta', 'x-mouse-m1-dimensioni-prodotto', 'x-mouse-m1-sensore-paw3311', 'x-mouse-m1-confezione'].map((id) => ({ id, file: `img_${id}.jpg` }));
  const analisi = { frasi, immagini, sorgenti: [{ id: 'A', tipo: 'video', principale: true }] };
  const r = usaTuttoIlMateriale({ sequenza: frasi.map((f) => ({ frase: f.id })) }, analisi);
  const dove = Object.fromEntries(r.sequenza.filter((x) => x.inserto).map((x) => [x.inserto, x.frase]));
  assert.deepEqual(dove, { 'x-mouse-m1-batteria-estratta': 'F003', 'x-mouse-m1-sensore-paw3311': 'F006' });
});
