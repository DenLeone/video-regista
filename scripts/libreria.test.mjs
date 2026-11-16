import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detto, dettoComeMarca, loghiDetti, nomiLogo, scegliFont } from './libreria.mjs';

test('nomi dei loghi dal file', () => {
  assert.deepEqual(nomiLogo('Tech/ChatGPT.png'), ['chatgpt']);
  assert.deepEqual(nomiLogo('Tech/davinciresolve.svg'), ['davinciresolve']);
  assert.deepEqual(nomiLogo('final-cut-pro logo.png'), ['final cut pro']);
  assert.deepEqual(nomiLogo('apple, iphone.png'), ['apple', 'iphone']);
});

test('loghi detti nel parlato', () => {
  const testo = 'Allora, con Claude e Chat GPT scrivo il copione e poi monto su Final Cut Pro, niente Sony oggi';
  assert.ok(detto('chatgpt', testo));
  assert.ok(!detto('vn', 'avventura'));
  assert.ok(!detto('sony', 'personale'));
  const l = loghiDetti(['Tech/ChatGPT.png', 'Tech/final-cut-pro.png', 'Tech/Sony.png', 'Social/TikTok.png', 'Fonts/x.ttf', 'Tech/claude.svg'], testo);
  assert.deepEqual(l.map((x) => x.nome), ['claude', 'chatgpt', 'final cut pro', 'sony']);
});

test('marche che sono anche parole italiane', () => {
  const testo = "potete selezionarli dell'app, a metà video, e vivo qui; il portatile è un Dell e lo dico su Meta";
  assert.ok(!dettoComeMarca('dell', "potete selezionarli dell'app"));
  assert.ok(!dettoComeMarca('meta', 'a metà video'));
  assert.ok(!dettoComeMarca('vivo', 'e vivo qui'));
  assert.ok(dettoComeMarca('dell', 'il portatile è un Dell e'));
  assert.ok(dettoComeMarca('meta', 'lo dico su Meta'));
  assert.ok(dettoComeMarca('tiktok', 'su tiktok'));
  const l = loghiDetti(['Tech/Dell.png', 'Social/Meta.png', 'Tech/vivo.png'], "selezionarli dell'app, a metà video, e vivo qui");
  assert.deepEqual(l, []);
});

test('font col peso giusto', () => {
  const files = ['Apple garamond/AppleGaramond-Light.ttf', 'Apple garamond/AppleGaramond-Bold.ttf', 'Apple garamond/AppleGaramond.ttf',
    'Apple garamond/AppleGaramond-BoldItalic.ttf', 'Inter_18pt-Black.ttf', 'Inter_18pt-Bold.ttf', 'helvetica-rounded-bold-5871d05ead8de.otf', 'Helvetica-Bold.ttf', 'Helvetica.ttf'];
  assert.equal(scegliFont(files, { famiglia: 'Apple Garamond', peso: 700 }), 'Apple garamond/AppleGaramond-Bold.ttf');
  assert.equal(scegliFont(files, { famiglia: 'Apple Garamond', peso: 400 }), 'Apple garamond/AppleGaramond.ttf');
  assert.equal(scegliFont(files, { famiglia: 'Apple Garamond', peso: 700, corsivo: true }), 'Apple garamond/AppleGaramond-BoldItalic.ttf');
  assert.equal(scegliFont(files, { famiglia: 'Inter', peso: 900 }), 'Inter_18pt-Black.ttf');
  assert.equal(scegliFont(files, { famiglia: 'Helvetica', peso: 700 }), 'Helvetica-Bold.ttf');
  assert.equal(scegliFont(files, { famiglia: 'Montserrat', peso: 700 }), null);
});
