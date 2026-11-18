import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pulisciMomenti, filtroSovrapposizioni, PROMPT } from './ultron.mjs';
import { vuoleMotion } from './regista.mjs';

test('ultron: momenti dentro il video, distanziati, un solo «idea», numeri solo con cifre', () => {
  const m = pulisciMomenti([
    { at: 0.4, tipo: 'titolo', testo: 'Questa skill cambia tutto' },
    { at: 2.0, tipo: 'numero', testo: '40 ore' },            // sopra il titolo: fuori
    { at: 4.9, tipo: 'numero', testo: '40 ore', sotto: 'risparmiate' },
    { at: 9.0, tipo: 'idea', prompt: 'tre quadrati' },
    { at: 12.9, tipo: 'idea', prompt: 'altra idea' },         // seconda idea: fuori
    { at: 17, tipo: 'numero', testo: 'tantissime' },          // numero senza cifre: fuori
    { at: 19, tipo: 'titolo', testo: 'troppo tardi' },        // finisce oltre la fine: fuori
    { at: 'x', tipo: 'titolo', testo: 'rotto' }, { at: 3, tipo: 'boh', testo: 'tipo strano' },
  ], 20);
  assert.deepEqual(m.map((x) => [x.tipo, x.at]), [['titolo', 0.4], ['numero', 4.9], ['idea', 9]]);
  assert.equal(m[1].sotto, 'risparmiate');
});

test('ultron: filtro ffmpeg con partenza, dissolvenza e catena delle sovrapposizioni', () => {
  const { filtro, uscita } = filtroSovrapposizioni([{ at: 0.4, dur: 3.8 }, { at: 4.9, dur: 3.2 }], 1080, 1920);
  assert.equal(uscita, '[v1]');
  assert.match(filtro, /\[1:v\]scale=1080:1920,setpts=PTS-STARTPTS\+0\.4\/TB.*fade=t=out:st=3\.85:d=0\.35:alpha=1\[o0\]/);
  assert.match(filtro, /\[v0\]\[o1\]overlay=eof_action=pass:enable='between\(t,4\.9,8\.1\)'\[v1\]/);
});

test('ultron: si accende con «Motion graphic: sì» nello stile o nel brief', () => {
  assert.equal(vuoleMotion('Look: naturale\nMotion graphic: sì'), true);
  assert.equal(vuoleMotion('motion graphics: si'), true);
  assert.equal(vuoleMotion('Motion graphic: no'), false);
  assert.equal(vuoleMotion(''), false);
  assert.match(PROMPT([{ a: 0, b: 2, t: 'ciao' }], 10, ''), /\[0–2\] ciao/);
});

// ✨ Ultron 2 (18/11): gli spazi «animazione» lasciati dalla regia
test('spazi animazione: tenuti dentro il video, durata 1,5–4,5 s, al massimo 3', async () => {
  const { spaziValidi } = await import('./ultron.mjs');
  const s = spaziValidi([
    { at: 3, dur: 3.5, prompt: 'una cartella che si apre', testo: 'Dentro ECC' },
    { at: 34.5, dur: 4, prompt: 'troppo tardi' },
    { at: 10, dur: 9, testo: 'solo riserva' },
    { at: 20, dur: 1 },
    { at: 22, dur: 0.2, prompt: 'corta' }, { at: 25, prompt: 'quarta' }, { at: 28, prompt: 'quinta' },
  ], 35);
  assert.deepEqual(s.map((x) => x.at), [3, 10, 22]);
  assert.equal(s[1].dur, 4.5);
  assert.equal(s[2].dur, 1.5);
  assert.equal(s[1].prompt, '');
});
