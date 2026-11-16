import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CATENA_PODCAST, LOOK_FFMPEG, leggiStile, promptSuMisura } from './stile-su-misura.mjs';

// 📱 documentario verticale (16/11): colore caldo e sfondo un po' più scuro SOLO con «Colore su misura: sì»
const STILE = `Nome: Documentario verticale
Sottotitoli: frase
Maiuscolo sottotitoli: sì
Look: caldo naturale
Soggetto in risalto: naturale -20%
Colore su misura: sì
Voce: podcast
Schermate: sopra`;

test('con «Colore su misura: sì» valgono look caldo naturale, risalto naturale e voce podcast', () => {
  const { grafica: g } = leggiStile(STILE, 'Documentario verticale');
  assert.equal(g.look, 'caldo naturale');
  assert.equal(g.risalto, 'naturale');
  assert.equal(g.risaltoLuce, 0.8);
  assert.equal(g.voce, 'podcast');
  assert.equal(g.schermate, 'sopra');
  assert.equal(g.sfoca, false);
  assert.equal(g.vignetta, 0);
  assert.ok(LOOK_FFMPEG['caldo naturale'].filtro.includes('colorbalance'));
  assert.ok(CATENA_PODCAST.includes('acompressor') && CATENA_PODCAST.includes('loudnorm'));
  const meno30 = leggiStile(STILE.replace('-20%', '-30%'), 'x').grafica;
  assert.equal(meno30.risaltoLuce, 0.7);
});

test('senza «Colore su misura» la regola dei colori naturali resta (25/10)', () => {
  const { grafica: g } = leggiStile(STILE.replace('Colore su misura: sì\n', ''), 'x');
  assert.equal(g.look, 'naturale');
  assert.equal(g.risalto, false);
  // anche con l'eccezione, un look diverso dal caldo naturale non passa
  assert.equal(leggiStile(STILE.replace('caldo naturale', 'teal e arancio'), 'x').grafica.look, 'naturale');
});

test('il prompt spiega le schermate sopra la testa solo a questo stile', () => {
  const { grafica, testoAI } = leggiStile(STILE, 'x');
  assert.match(promptSuMisura(grafica, testoAI), /Schermate sopra la testa/);
  assert.doesNotMatch(promptSuMisura(leggiStile('Nome: Altro', 'y').grafica, ''), /Schermate sopra la testa/);
});

test('la regia porta nel piano le schermate nuove: chat con la risposta, comandi interi nel terminale', async () => {
  const { risolviRegia } = await import('./regia.mjs');
  const paroleDi = (testo, da) => testo.split(' ').map((w, i) => ({ w, s: da + i * 0.4, e: da + i * 0.4 + 0.3 }));
  const f1 = 'Basta che scrivi a Claude voglio installare Everything Claude Code.', f2 = 'Lui te la spiega e tu valuti.';
  const analisi = { fps: 30, sorgenti: [{ id: 'A', file: 'a.mp4', principale: true, tipo: 'video', durata: 20, orient: 'v', parole: [...paroleDi(f1, 0), ...paroleDi(f2, 5)] }],
    frasi: [{ id: 'F001', principale: 'A', inizio: 0, fine: 4.4, testo: f1 }, { id: 'F002', principale: 'A', inizio: 5, fine: 7.4, testo: f2 }] };
  const comando = '/plugin marketplace add https://github.com/affaan-m/ECC';
  const { piano } = risolviRegia({ sequenza: [{ frase: 'F001', camera: 'A' }, { frase: 'F002', camera: 'A' }], keywords: [], schermate: [
    { frase: 'F001', tipo: 'chat', titolo: 'Claude', testo: 'voglio installare Everything Claude Code', risposta: 'Certo: due comandi.', dur: 5 },
    { frase: 'F002', tipo: 'terminale', voci: [comando, '/plugin install ecc@ecc'], dur: 3 },
    { frase: 'F002', tipo: 'boh', dur: 2 },
  ] }, analisi);
  assert.equal(piano.schermate.length, 2);
  assert.equal(piano.schermate[0].risposta, 'Certo: due comandi.');
  assert.equal(piano.schermate[1].voci[0], comando);
});
