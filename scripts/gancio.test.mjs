import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spostaGancio } from './regista.mjs';

// il discorso del FIFINE AM8 (16/11): l'apertura debole, la frase forte a metà
const frasi = [
  { id: 'F001', testo: 'Ho appena sbustato questo Fifine AM8' },
  { id: 'F002', testo: 'sembra tenere abbastanza bene l\'audio.' },
  { id: 'F007', testo: 'Il prezzo è ultra competitivo perché' },
  { id: 'F008', testo: 'a 50€ vi portate a casa un mic che è di qualità semi-professionale' },
  { id: 'F009', testo: 'Quindi se volete aumentare il livello' },
];
const seq = frasi.map((f) => ({ frase: f.id }));

test('il gancio va in apertura e il pezzo che lo introduceva esce', () => {
  const g = spostaGancio(seq, { gancio: 'F008', sequenza: [] }, frasi);
  assert.deepEqual(g.seq.map((x) => x.frase), ['F008', 'F001', 'F002', 'F009']);
  assert.match(g.avviso, /tolto F007/);
});

test('un gancio che rimanda a prima non si sposta, se non parte dalla parola giusta', () => {
  assert.deepEqual(spostaGancio(seq, { gancio: 'F009', sequenza: [] }, frasi).seq, seq);
  const conParola = spostaGancio(seq, { gancio: 'F009', sequenza: [{ frase: 'F009', da_parola: 'se volete' }] }, frasi);
  assert.equal(conParola.seq[0].frase, 'F009');
});

test('senza gancio, o con il gancio già in apertura, non cambia niente', () => {
  assert.deepEqual(spostaGancio(seq, {}, frasi).seq, seq);
  assert.deepEqual(spostaGancio(seq, { gancio: 'F001' }, frasi).seq, seq);
  assert.deepEqual(spostaGancio(seq, { gancio: 'F099' }, frasi).seq, seq);
});

test('nelle correzioni i pezzi appesi o fuori posto escono (FIFINE v2)', async () => {
  const { controllaFilo } = await import('./regista.mjs');
  const tutte = [...frasi, { id: 'F010', testo: 'questo qua è un ottimo prodotto anche perché ha l\'entrata anche XLR' }];
  const v2 = ['F008', 'F009', 'F001', 'F002', 'F007', 'F010'].map((frase) => ({ frase }));
  const { seq, tolti } = controllaFilo(v2, tutte);
  assert.deepEqual(seq.map((x) => x.frase), ['F008', 'F001', 'F002', 'F010']);
  assert.deepEqual(tolti.sort(), ['F007', 'F009']);
  // l'ordine giusto non si tocca
  assert.deepEqual(controllaFilo(tutte.map((f) => ({ frase: f.id })), tutte).tolti, []);
});

// 🧹 la coda finale e 📖 le parole corrette (16/11, FIFINE: «…è il mutuo quindi»)
const paroleDi = (testo, da) => testo.split(' ').map((w, i) => ({ w, s: da + i * 0.4, e: da + i * 0.4 + 0.3 }));
const analisiFinale = () => {
  const f1 = 'A 50 euro vi portate a casa un microfono.', f2 = 'una cosa utile è il mutuo quindi';
  return { fps: 30, sorgenti: [{ id: 'A', file: 'a.mp4', principale: true, tipo: 'video', durata: 20, orient: 'v', parole: [...paroleDi(f1, 0), ...paroleDi(f2, 4)] }],
    frasi: [{ id: 'F001', principale: 'A', inizio: 0, fine: 3.6, testo: f1 }, { id: 'F002', principale: 'A', inizio: 4, fine: 6.8, testo: f2 }] };
};

test('l\'ultima frase non finisce più su «quindi»', async () => {
  const { risolviRegia } = await import('./regia.mjs');
  const { piano, avvisi } = risolviRegia({ sequenza: [{ frase: 'F001', camera: 'A' }, { frase: 'F002', camera: 'A' }], keywords: [] }, analisiFinale());
  assert.ok(avvisi.some((a) => /tolto «quindi»/.test(a)), avvisi.join(' | '));
  assert.match(piano.testo, /è il mutuo$/);
  assert.ok(!piano.parole.some((p) => /quindi/i.test(p.w)));
});

test('le parole sbagliate si correggono nei sottotitoli e nel testo, con punteggiatura e maiuscola', async () => {
  const { applicaParole } = await import('./regista.mjs');
  const piano = { testo: 'è il mutuo. Mutuo!', parole: [{ w: 'il' }, { w: 'mutuo.' }, { w: 'Mutuo!' }] };
  const regia = { testo_montato: 'è il mutuo.' };
  const fatte = applicaParole(piano, regia, [{ sbagliata: 'mutuo', giusta: 'muto' }, { sbagliata: 'due parole', giusta: 'x' }, { sbagliata: 'il', giusta: 'il' }]);
  assert.deepEqual(piano.parole.map((p) => p.w), ['il', 'muto.', 'Muto!']);
  assert.equal(piano.testo, 'è il muto. Muto!');
  assert.equal(regia.testo_montato, 'è il muto.');
  assert.equal(fatte.length, 1);
});
