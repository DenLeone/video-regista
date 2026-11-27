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

test('campi Elaborato: parole sul petto, entrata dolce, tessere', () => {
  const s = leggiStile('Nome X\nSottotitoli: strati\nParole sul petto: sì\nEntrata parole piccole: dolce\nApertura tessere: sì\n');
  assert.equal(s.grafica.sulPetto, true);
  assert.equal(s.grafica.entrataPiccole, 'dolce');
  assert.equal(s.grafica.tessere, true);
  const no = leggiStile('Nome X\n');
  assert.ok(!no.grafica.sulPetto && !no.grafica.entrataPiccole && !no.grafica.tessere);
});

test('pagina profilo e parole medie: campi di stile e prompt', () => {
  const s = leggiStile('Nome X\nSottotitoli: strati\nPagina profilo: sì\nNome profilo: @denleone\nParole medie: sì\n');
  assert.equal(s.grafica.paginaProfilo, true);
  assert.equal(s.grafica.nomeProfilo, '@denleone');
  assert.equal(s.grafica.paroleMedie, true);
  const prompt = promptSuMisura(s.grafica, s.testoAI);
  assert.match(prompt, /pagina_profilo/);
  assert.match(prompt, /enfasi_media/);
  const no = leggiStile('Nome X\n');
  assert.doesNotMatch(promptSuMisura(no.grafica, no.testoAI), /pagina_profilo|enfasi_media/);
});

test('pagina profilo: una sola, tempi da 2 s', () => {
  const r = schedeEditorDa([{ frase: 'F2' }, { frase: 'F4' }], { inizio, totale: 43, dur: 2.4, max: 1, nome: 'pagina profilo' });
  assert.deepEqual(r, [{ at: 5, dur: 2.4 }]);
});

test('profilo: nome visibile e numeri', () => {
  const s = leggiStile('Nome X\nNome profilo: @itsblackden\nNome visibile: Black Den\nNumeri profilo: 420 post, 11 mila follower, 346 seguiti\n');
  assert.equal(s.grafica.nomeProfilo, '@itsblackden');
  assert.equal(s.grafica.nomeVisibile, 'Black Den');
  assert.deepEqual(s.grafica.numeriProfilo, ['420', '11 mila', '346']);
});
