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
