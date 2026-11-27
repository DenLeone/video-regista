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

test('Elaborato: pezzi lunghi divisi sulle pause con zoom alternato; l\'ultimo tiene lo zoom del pezzo intero', () => {
  const parole = Array.from({ length: 24 }, (_, i) => ({ w: `parola${i}`, at: i * 0.5 + 0.2, dur: 0.3 }));
  const p = { clips: [{ file: 'a.mp4', start: 100, end: 112, punch: true }, { file: 'a.mp4', start: 112, end: 114, punch: false }], parole, grafica: { sulPetto: true } };
  completaPianoElaborato(p);
  const tot = p.clips.reduce((s, c) => s + c.end - c.start, 0);
  assert.ok(Math.abs(tot - 14) < 0.01, 'durata totale invariata');
  assert.ok(p.clips.length >= 7, 'molti più pezzi');
  for (let i = 1; i < p.clips.length; i++) assert.ok(Math.abs(p.clips[i].start - p.clips[i - 1].end) < 0.001 || p.clips[i].start === 112, 'il parlato prosegue senza buchi');
  for (let i = 1; i < 6; i++) assert.notEqual(p.clips[i].punch, p.clips[i - 1].punch, 'zoom alternato a ogni taglio');
  assert.ok(p.clips.slice(0, -1).every((c) => c.end - c.start >= 1.0), 'nessun pezzo sotto 1 s');
  const ultimo = p.clips.filter((c) => c.start < 112).pop();
  assert.equal(ultimo.punch, true, 'ultimo pezzo = zoom del pezzo intero');
});

test('Elaborato: schede immagine, b-roll e senza il flag non si dividono', () => {
  const base = [{ file: 'a.mp4', start: 0, end: 12 }, { file: 'a.mp4', start: 12, end: 20, inserto: { file: 'x.jpg', tipo: 'immagine' } }];
  const a = { clips: structuredClone(base), parole: [], grafica: { sulPetto: true } };
  completaPianoElaborato(a);
  assert.ok(a.clips.some((c) => c.inserto && c.end - c.start === 8), 'la scheda resta intera');
  const b = { clips: structuredClone(base), parole: [], grafica: {} };
  completaPianoElaborato(b);
  assert.equal(b.clips.length, 2);
});

test('Elaborato: parole giganti in più, lontane dalle altre e dalle schede, in ordine di parlato', () => {
  const nomi = ['sinceramente', 'telefono', 'lavorare', 'moltissimo', 'ciao', 'regalo', 'creatore', 'strategia', 'mattina', 'quarantacinque'];
  const parole = nomi.map((w, i) => ({ w, at: 2 + i * 3, dur: 0.5 }));
  const p = { clips: [{ file: 'a', start: 0, end: 20, inserto: { file: 'x.jpg', tipo: 'immagine' } }, { file: 'a', start: 20, end: 40 }], parole, enfasi: ['strategia'], grafica: { sulPetto: true, dietro: true } };
  const riga = completaPianoElaborato(p);
  assert.ok(p.enfasi.length >= 3, 'più giganti');
  assert.ok(!p.enfasi.includes('sinceramente') && !p.enfasi.includes('telefono'), 'niente sotto la scheda (0–20 s)');
  const tempi = p.enfasi.map((e) => parole.find((w) => w.w === e).at).sort((a, b) => a - b);
  for (let i = 1; i < tempi.length; i++) assert.ok(tempi[i] - tempi[i - 1] >= 2.6, 'distanza minima');
  assert.deepEqual(p.enfasi.map((e) => parole.findIndex((w) => w.w === e)), p.enfasi.map((e) => parole.findIndex((w) => w.w === e)).sort((a, b) => a - b), 'ordine del parlato');
  assert.match(riga, /aggiunte/);
});
