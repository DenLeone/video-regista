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
