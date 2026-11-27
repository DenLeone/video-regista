import assert from 'node:assert/strict';
import { test } from 'node:test';
import { completaPianoElaborato } from './piano-elaborato.mjs';

const clips = [{ start: 0, end: 40 }, { start: 50, end: 70 }];

test('pagina profilo a 2,5 s e scheda editor a 6 s quando la regia non le ha', () => {
  const p = { clips, grafica: { paginaProfilo: true, schedaEditor: true }, iconeConcetto: [{ at: 6.5, dur: 2, nome: 'x' }, { at: 20, dur: 2, nome: 'y' }] };
  const riga = completaPianoElaborato(p);
  assert.deepEqual(p.paginaProfilo, [{ at: 2.5, dur: 2.4 }]);
  assert.deepEqual(p.schedeEditor, [{ at: 6, dur: 2.8 }]);
  assert.deepEqual(p.iconeConcetto.map((i) => i.at), [20]);
  assert.match(riga, /pagine 1, schede 1/);
});

test('niente di nuovo se lo stile non le vuole o la regia le ha già messe', () => {
  const senza = { clips, grafica: {} };
  completaPianoElaborato(senza);
  assert.equal(senza.paginaProfilo, undefined);
  assert.equal(senza.schedeEditor, undefined);
  const gia = { clips, grafica: { paginaProfilo: true, schedaEditor: true }, paginaProfilo: [{ at: 30, dur: 2.4 }], schedeEditor: [{ at: 50, dur: 2.6 }] };
  completaPianoElaborato(gia);
  assert.deepEqual(gia.paginaProfilo, [{ at: 30, dur: 2.4 }]);
  assert.deepEqual(gia.schedeEditor, [{ at: 50, dur: 2.6 }]);
});

test('video troppo corto: nessuna scheda', () => {
  const p = { clips: [{ start: 0, end: 8 }], grafica: { paginaProfilo: true, schedaEditor: true } };
  completaPianoElaborato(p);
  assert.equal(p.paginaProfilo, undefined);
  assert.equal(p.schedeEditor, undefined);
});
