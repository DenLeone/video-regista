import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { ICONE_CONCETTO, NOMI_ICONE, iconeConcettoDa } from './icone-concetto.mjs';
import { leggiStile, promptSuMisura } from './stile-su-misura.mjs';

test('src/iconeConcettoElenco.tsx è aggiornato rispetto a scripts/icone-concetto.mjs', async () => {
  const { contenuto } = await import('./genera-icone-concetto.mjs');
  assert.equal(fs.readFileSync(new URL('../src/iconeConcettoElenco.tsx', import.meta.url), 'utf8'), contenuto(), 'rigenera con: node scripts/genera-icone-concetto.mjs');
});

test('icone di concetto: lista chiusa, frase usata, distanza, massimo 5, lati alternati', () => {
  const avvisi = [];
  const inizio = (f) => ({ F001: 1, F002: 2, F003: 3.5, F004: 6, F005: 9, F006: 12, F007: 15, F008: 18 }[f] ?? null);
  const r = iconeConcettoDa([
    { frase: 'F001', icona: 'corsa' }, { frase: 'F002', icona: 'diamante' }, // troppo vicina (< 3 s) alla prima
    { frase: 'F004', icona: 'astronave' },                                    // non in lista
    { frase: 'F009', icona: 'idea' },                                          // frase non usata
    { frase: 'F005', icona: 'idea', dette: 'idea' }, { frase: 'F006', icona: 'cuore' }, // troppo vicina (2,4 s) a «idea»
     { frase: 'F007', icona: 'stella' },
    { frase: 'F008', icona: 'razzo', lato: 'sinistra' },
  ], { inizio, trova: (d) => (d === 'idea' ? { at: 9.8 } : null), avvisi });
  assert.deepEqual(r.map((x) => x.nome), ['corsa', 'idea', 'stella', 'razzo']);
  assert.deepEqual(r.map((x) => x.lato), ['destra', 'sinistra', 'destra', 'sinistra']);
  assert.equal(r[1].at, 9.7); // sulla parola detta, 0,1 s prima
  assert.ok(r.every((x, i) => i === 0 || x.at - r[i - 1].at >= 3));
  assert.equal(avvisi.length, 2);
  assert.deepEqual(iconeConcettoDa(undefined, { inizio }), []);
  assert.ok(NOMI_ICONE.length >= 20);
});

test('stile: «Icone concetto: sì» entra nella grafica e nelle istruzioni all\'AI', () => {
  const base = 'Nome: Prova\nSottotitoli: frase\nIcone concetto: sì\n';
  const { grafica, testoAI } = leggiStile(base, 'Prova');
  assert.equal(grafica.iconeConcetto, true);
  const prompt = promptSuMisura(grafica, testoAI);
  assert.match(prompt, /icone_concetto/);
  assert.match(prompt, /corsa, camminata/);
  assert.match(prompt, /soldi/);
  const no = leggiStile('Nome: P\nSottotitoli: frase\nIcone concetto: no\n', 'P');
  assert.ok(!no.grafica.iconeConcetto);
  assert.doesNotMatch(promptSuMisura(no.grafica, no.testoAI), /icone_concetto/);
});
