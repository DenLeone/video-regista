import assert from 'node:assert/strict';
import { test } from 'node:test';
import { estraiCodice, giudica, pagina, GUIDA } from './motion-ai.mjs';
import { parametri } from './motion.mjs';

test('motion-ai: prende solo il codice e rifiuta risposte inutilizzabili', () => {
  assert.equal(estraiCodice('ecco:\n```js\nconst a = 1;\nM.avvia(r, 5);\n```\nfine'), 'const a = 1;\nM.avvia(r, 5);');
  assert.throws(() => estraiCodice('```js\nconst a = 1;\n```'), /M\.avvia/);
  assert.throws(() => estraiCodice('```js\nM.avvia(r,5); "</script>"\n```'), /script/);
  assert.match(pagina('M.avvia(r, 5);'), /motore\.js[\s\S]*M\.avvia\(r, 5\);/);
  assert.match(GUIDA('orizzontale'), /1920x1080/);
});

test('motion-ai: scarta animazioni vuote, ferme o di durata sbagliata', () => {
  const f = (m, sd, v) => ({ m, sd, px: Array(10).fill(v) });
  assert.match(giudica([f(10, 1, 10), f(10, 1, 10)], 5), /vuoti/);
  assert.match(giudica([f(80, 20, 50), f(80, 20, 50)], 5), /non si muove/);
  assert.match(giudica([f(80, 20, 50), f(80, 20, 90)], 40), /durata/);
  assert.equal(giudica([f(80, 20, 50), f(80, 20, 90)], 6), null);
});

test('motion-ai: la descrizione lunga passa intera, la correzione e il codice di base pure', () => {
  const p = parametri({ modello: 'idea', testi: { testo: 'a'.repeat(2000), correzione: 'più lento', base: 'M.avvia()' }, formato: 'orizzontale' });
  assert.equal(p.testo.length, 1500);
  assert.equal(p.correzione, 'più lento');
  assert.equal(p.base, 'M.avvia()');
  assert.throws(() => parametri({ modello: 'idea', testi: { testo: ' ' } }), /descrizione/);
});
