import assert from 'node:assert/strict';
import { test } from 'node:test';
import { leggiInvio, perLApp, pulisciStato, VECCHIO_DOPO_MS } from '../src/squadra-stato';

test('pulisciStato: tiene solo i campi ammessi e taglia', () => {
  const s = pulisciStato({ agenti: { a: { stato: 'lavora', cosa: 'x' } }, lavori: Array.from({ length: 9 }, () => ({ id: 'L', testo: 'x'.repeat(300), nota: 'n', prodotti: Array.from({ length: 12 }, () => ({ nome: 'p' })) })),
    adesso: Array.from({ length: 30 }, () => ({ testo: '{"frase":"privata"}', min: 99999 })), passi: ['a'], altro: 1 })!;
  assert.deepEqual(s.agenti, { a: { stato: 'lavora' } });
  assert.equal(s.lavori.length, 6);
  assert.equal(s.lavori[0].prodotti.length, 8);
  assert.equal(s.lavori[0].testo.length, 90);
  assert.equal(s.adesso.length, 12);
  assert.equal(s.adesso[0].testo, ''); // un JSON non è un testo da mostrare
  assert.equal(s.adesso[0].min, 10000);
  assert.ok(!('altro' in s) && !('nota' in s.lavori[0]));
});

test('pulisciStato / leggiInvio: roba che non è uno stato', () => {
  for (const x of [null, undefined, 'testo', 5, [1], []]) assert.equal(pulisciStato(x), null);
  assert.deepEqual(pulisciStato({}), { agenti: {}, lavori: [], adesso: [], passi: [] });
  const r = leggiInvio({ quando: 'non è una data', stato: {} }, 1_000);
  assert.ok(r.ok && r.salvato.ricevuto === 1_000 && r.salvato.quando === new Date(1_000).toISOString());
  assert.equal(leggiInvio({}).ok, false);
});

test('perLApp: vecchio dopo 45 minuti, assente se non c\'è', () => {
  assert.deepEqual(perLApp(undefined), { presente: false });
  const s = { quando: 'q', ricevuto: 1_000_000, stato: pulisciStato({})! };
  assert.equal((perLApp(s, 1_000_000 + 1000) as { vecchio: boolean }).vecchio, false);
  assert.equal((perLApp(s, 1_000_000 + VECCHIO_DOPO_MS + 1) as { vecchio: boolean }).vecchio, true);
});
