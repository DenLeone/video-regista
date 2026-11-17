import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MODELLI, parametri } from './motion.mjs';

test('motion: testi puliti, corti e nel formato giusto', () => {
  const p = parametri({ modello: 'luce', testi: '{"testo":"  Black\\nDen <b>","sotto":"@x","invito":"Seguimi"}', formato: 'boh' });
  assert.equal(p.testo, 'Black Den b');
  assert.equal(p.formato, 'verticale');
  assert.equal(p.invito, 'Seguimi');
  assert.equal(parametri({ modello: 'luce', testi: { testo: 'x'.repeat(80) }, formato: 'orizzontale' }).testo.length, 28);
  assert.equal(parametri({ modello: 'titolo', testi: { testo: 'y'.repeat(80) } }).testo.length, 60);
  // l'invito c'è solo nella chiusura con la luce
  assert.equal(parametri({ modello: 'codice', testi: { testo: 'a', invito: 'b' } }).invito, '');
  // testo semplice (non JSON) = il testo principale
  assert.equal(parametri({ modello: 'intro', testi: 'Fantic' }).testo, 'Fantic');
});

test('motion: errori chiari', () => {
  assert.throws(() => parametri({ modello: 'spotify', testi: { testo: 'x' } }), /modello sconosciuto/);
  assert.throws(() => parametri({ modello: 'luce', testi: { testo: '   ' } }), /manca il testo/);
  for (const m of Object.values(MODELLI)) assert.match(m.pagina, /\.html$/);
});
