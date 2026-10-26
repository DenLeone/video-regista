import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BUDGET_STILE_MS, MODELLI_PREDEFINITI, descriviFallimento, messaggioStudioFallito, riprovaStessoModello, tempoChiamata,
} from '../../scripts/studia-stile.mjs';

test('lo studio del video intero ha Pro, Flash, 2.5 Flash e Flash Lite', () => {
  assert.deepEqual(MODELLI_PREDEFINITI, [
    'gemini-pro-latest', 'gemini-flash-latest', 'gemini-2.5-flash', 'gemini-flash-lite-latest',
  ]);
});

test('Flash ha più di 5 minuti e quattro scadenze di fila restano nel budget', () => {
  assert.equal(tempoChiamata('gemini-flash-latest', 0), 8 * 60 * 1000);
  assert.ok(tempoChiamata('gemini-flash-latest', 0) > 5 * 60 * 1000);
  let trascorso = 0;
  let somma = 0;
  for (const modello of MODELLI_PREDEFINITI) {
    const ms = tempoChiamata(modello, trascorso);
    somma += ms;
    trascorso += ms;
  }
  assert.ok(somma <= BUDGET_STILE_MS);
  assert.ok(somma <= 16 * 60 * 1000);
  assert.equal(tempoChiamata('gemini-flash-lite-latest', BUDGET_STILE_MS), 0);
});

test('un timeout non riprova lo stesso modello e il testo per Denis è in italiano', () => {
  const e = new Error('The operation was aborted due to timeout');
  e.name = 'TimeoutError';
  assert.equal(descriviFallimento('gemini-flash-latest', e, 0), 'gemini-flash-latest: tempo scaduto');
  assert.equal(riprovaStessoModello({ status: 0, errore: e, tentativo: 1 }), false);
  assert.equal(riprovaStessoModello({ status: 429, tentativo: 1 }), true);
  assert.equal(riprovaStessoModello({ status: 429, tentativo: 2 }), false);
  assert.equal(riprovaStessoModello({ status: 503, tentativo: 1 }), true);
  assert.equal(descriviFallimento('gemini-pro-latest', null, 429), 'gemini-pro-latest: limite di richieste');
  assert.equal(descriviFallimento('gemini-2.5-flash', new Error('fetch failed'), 0), 'gemini-2.5-flash: rete verso Gemini interrotta');
  const msg = messaggioStudioFallito([
    'gemini-pro-latest: limite di richieste',
    'gemini-flash-latest: tempo scaduto',
  ]);
  assert.match(msg, /^nessun modello ha scritto lo stile \(/);
  assert.equal(msg.includes('aborted due to timeout'), false);
  assert.equal(msg.includes('tempo scaduto'), true);
});
