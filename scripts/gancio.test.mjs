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
