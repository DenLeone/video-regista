import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nomeScena, codiceScena, intestazione, scenaNelPiano } from './scene-mano.mjs';

test('scene a mano: nome dal brief, file in motion/scene, intestazione', () => {
  assert.equal(nomeScena('Stile: Ultron\nAnimazione: skill-vinile'), 'skill-vinile');
  assert.equal(nomeScena('niente'), null);
  assert.equal(codiceScena('../segreti'), null);
  assert.equal(codiceScena('non-esiste'), null);
  const c = codiceScena('skill-vinile');
  assert.ok(c && /M3\./.test(c));
  assert.deepEqual(intestazione(c), { parola: 'vinile', anticipo: 0.5, durata: 6 });
});

test('scene a mano: parte sulla parola, toglie le grafiche nello stesso momento, resta una sola animazione', () => {
  const piano = {
    parole: [{ at: 30.4, dur: 0.8, w: 'spotify' }, { at: 32.27, dur: 0.3, w: 'Vinile,' }, { at: 60, dur: 0.5, w: 'fine.' }],
    schermate: [{ at: 24, dur: 5, tipo: 'chat' }, { at: 35.8, dur: 3.5, tipo: 'animazione', prompt: 'x' }, { at: 37, dur: 3, tipo: 'primadopo' }, { at: 45, dur: 3, tipo: 'numeri' }],
    icone: [{ at: 30.27, dur: 1.8, file: 'img_logo_spotify.png' }, { at: 7.5, dur: 1, file: 'img_logo_google.png' }],
  };
  const a = scenaNelPiano(piano, 'Animazione: skill-vinile');
  assert.match(a, /a 31\.77 s per 6 s \(tolte 3 grafiche/);
  assert.deepEqual(piano.schermate.map((x) => [x.tipo, x.at]), [['chat', 24], ['animazione', 31.77], ['numeri', 45]]);
  assert.equal(piano.schermate[1].scena, 'skill-vinile');
  assert.deepEqual(piano.icone.map((x) => x.file), ['img_logo_google.png']);
  assert.equal(scenaNelPiano({ parole: [{ at: 1, dur: 1, w: 'ciao' }] }, 'Animazione: skill-vinile').includes('non c\'è'), true);
  assert.equal(scenaNelPiano(piano, 'Stile: Ultron'), null);
});

test('prodotto-3d: parte quando Denis dice il nome del prodotto e porta il nome alla scena', () => {
  const c = codiceScena('prodotto-3d');
  assert.deepEqual(intestazione(c), { parola: '{prodotto}', anticipo: 0.2, durata: 4.5, serve: 'foto' });
  const piano = { soggetto: 'PGYTECH CreateMate', parole: [{ at: 0.2, dur: 0.3, w: 'questo' }, { at: 2.4, dur: 0.5, w: 'Pgytech' }, { at: 30, dur: 0.5, w: 'fine.' }], schermate: [{ at: 2, dur: 3, tipo: 'titolo' }] };
  assert.match(scenaNelPiano(piano, 'Animazione: prodotto-3d'), /a 2\.2 s per 4\.5 s \(tolte 1/);
  assert.deepEqual(piano.schermate.at(-1).dati, { titolo: 'PGYTECH CreateMate' });
  assert.match(scenaNelPiano({ soggetto: 'Ajazz AK820', parole: [{ at: 1, dur: 1, w: 'ciao' }] }, 'Animazione: prodotto-3d'), /non si sente/);
});

test('classifica: legge il blocco del brief e mette una scena per voce quando Denis dice il nome', async () => {
  const { leggiClassifica, classificaNelPiano } = await import('./scene-mano.mjs');
  const brief = 'Stile: Ultron\nClassifica: Top 3 skill\n\n3. Karpathy Skills | 234k stelle su GitHub | Un solo CLAUDE.md\n2. Matt Pocock | 275k\n1. Superpowers | 295k stelle | Pianifica e testa | obra/superpowers\nAltro: niente';
  const c = leggiClassifica(brief);
  assert.equal(c.titolo, 'Top 3 skill');
  assert.deepEqual(c.voci.map((v) => [v.n, v.nome, v.numero, v.etichetta]), [[3, 'Karpathy Skills', '234k', 'stelle su GitHub'], [2, 'Matt Pocock', '275k', ''], [1, 'Superpowers', '295k', 'stelle']]);
  assert.equal(c.voci[2].sotto, 'obra/superpowers');
  assert.equal(leggiClassifica('Stile: Ultron'), null);
  const piano = {
    // «Superpowers» detto anche nell'intro: conta solo dopo la voce di prima
    parole: [{ at: 1, dur: 0.5, w: 'Superpowers' }, { at: 5, dur: 0.5, w: 'Karpathy,' }, { at: 9, dur: 0.5, w: 'Pocock' }, { at: 12, dur: 0.5, w: 'superpowers!' }, { at: 30, dur: 0.5, w: 'fine' }],
    schermate: [{ at: 6, dur: 2, tipo: 'chat' }, { at: 20, dur: 2, tipo: 'numeri' }],
  };
  assert.match(classificaNelPiano(piano, brief), /3 voci su 3, tolte 1/);
  const cl = piano.schermate.filter((x) => x.scena === 'classifica');
  assert.deepEqual(cl.map((x) => [x.at, x.dur, x.dati.voce.n]), [[4.7, 3.7, 3], [8.7, 2.7, 2], [11.7, 4.5, 1]]);
  assert.equal(cl[0].dati.totale, 3);
  assert.deepEqual(piano.schermate.map((x) => x.tipo).filter((t) => t !== 'animazione'), ['numeri']);
  assert.match(classificaNelPiano({ parole: [{ at: 1, dur: 1, w: 'ciao' }, { at: 9, dur: 1, w: 'fine' }], schermate: [] }, brief), /0 voci su 3 \(non sento: Karpathy Skills, Matt Pocock, Superpowers\)/);
});
