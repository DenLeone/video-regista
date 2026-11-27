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

test('icone automatiche dal parlato: sinonimi, distanza, niente sotto le schede', () => {
  const parole = [['sponsor', 10], ['albero', 4.6], ['regali', 5.5], ['doni', 7.2], ['piace', 9.2], ['mondo', 12], ['storia', 14.5], ['ciao', 3], ['alberi', 18.5], ['telefoni', 22]].map(([w, at]) => ({ w, at, dur: 0.4 }));
  const p = { clips, parole, grafica: { iconeConcetto: true, paginaProfilo: true, schedaEditor: true }, iconeConcetto: [] };
  const riga = completaPianoElaborato(p);
  const nomi = p.iconeConcetto.map((i) => i.nome);
  assert.ok(nomi.includes('soldi'), 'sponsor → soldi');
  assert.ok(!p.iconeConcetto.some((i) => i.at > 2.3 && i.at < 5.3), 'niente sotto la pagina profilo (2,5–4,9 s)');
  assert.ok(nomi.includes('albero') && nomi.includes('telefono'), 'alberi → albero, telefoni → telefono');
  assert.ok(!p.iconeConcetto.some((i) => i.at > 5.4 && i.at < 9), 'niente sotto la scheda editor (6–8,8 s)');
  for (let i = 1; i < p.iconeConcetto.length; i++) assert.ok(p.iconeConcetto[i].at - p.iconeConcetto[i - 1].at >= 3, 'almeno 3 s tra due icone');
  assert.match(riga, /automatiche/);
});

test('icone automatiche: mai sotto una scheda immagine (pezzo con inserto)', () => {
  const p = {
    clips: [{ start: 0, end: 10 }, { start: 10, end: 16, inserto: { file: 'x.jpg', tipo: 'immagine' } }, { start: 16, end: 40 }],
    parole: [['mondo', 12], ['storia', 14], ['sponsor', 20]].map(([w, at]) => ({ w, at, dur: 0.4 })),
    grafica: { iconeConcetto: true }, iconeConcetto: [],
  };
  completaPianoElaborato(p);
  assert.deepEqual(p.iconeConcetto.map((i) => i.nome), ['soldi']);
});
