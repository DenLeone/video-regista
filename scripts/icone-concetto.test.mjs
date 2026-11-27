import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { ICONE_CONCETTO, NOMI_ICONE, iconeConcettoDa } from './icone-concetto.mjs';
import { leggiStile, promptSuMisura } from './stile-su-misura.mjs';

test('l\'elenco delle icone è uguale in scripts/ e in src/iconeConcetto.tsx', () => {
  const tsx = fs.readFileSync(new URL('../src/iconeConcetto.tsx', import.meta.url), 'utf8');
  const blocco = /export const ICONE_CONCETTO[^=]*=\s*\{([\s\S]*?)\n\};/.exec(tsx)[1];
  const coppie = [...blocco.matchAll(/(\w+):\s*(Icon\w+)/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(Object.fromEntries(coppie), ICONE_CONCETTO);
  for (const [, comp] of coppie) assert.match(tsx.split("from '@tabler/icons-react'")[0], new RegExp(`\\b${comp}\\b`), `${comp} non importata`);
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
  assert.match(prompt, /corsa, diamante/);
  const no = leggiStile('Nome: P\nSottotitoli: frase\nIcone concetto: no\n', 'P');
  assert.ok(!no.grafica.iconeConcetto);
  assert.doesNotMatch(promptSuMisura(no.grafica, no.testoAI), /icone_concetto/);
});
