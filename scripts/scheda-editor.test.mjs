import test from 'node:test';
import assert from 'node:assert/strict';
import { schedeEditorDa } from './scheda-editor.mjs';
import { leggiStile, promptSuMisura } from './stile-su-misura.mjs';

const inizio = (id) => ({ F1: 1, F2: 5, F3: 7, F4: 20, F5: 24, F6: 40 }[id] ?? null);

test('scheda editor: tempi, distanza, bordi', () => {
  const avvisi = [];
  const r = schedeEditorDa([{ frase: 'F1' }, { frase: 'F2' }, { frase: 'F3' }, { frase: 'F4' }, { frase: 'F5' }, { frase: 'F9' }, { frase: 'F6' }], { inizio, totale: 43, avvisi });
  // F1 troppo presto, F2 ok, F3/F4.. max 2 e distanza >= 8, F6 negli ultimi 3 s
  assert.deepEqual(r.map((x) => x.at), [5, 20]);
  assert.ok(r.every((x) => x.dur === 2.6));
  assert.equal(avvisi.length, 1);
});

test('scheda editor: campo di stile', () => {
  const s = leggiStile('Nome X\nScheda editor: sì\n');
  assert.equal(s.grafica.schedaEditor, true);
  assert.match(promptSuMisura(s.grafica, s.testoAI), /scheda_editor/);
  const no = leggiStile('Nome X\n');
  assert.doesNotMatch(promptSuMisura(no.grafica, no.testoAI), /scheda_editor/);
});
