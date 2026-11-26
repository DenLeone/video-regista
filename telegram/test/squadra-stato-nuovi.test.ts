import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pulisciStato } from '../src/squadra-stato';

test('pronti e stili: solo i campi ammessi, origini inventate diventano «manuale»', () => {
  const s = pulisciStato({
    pronti: [{ nome: 'Fifine AM8 2', stile: 'Ultra', percorso: 'x' }, { nome: '' }, ...Array.from({ length: 20 }, (_, i) => ({ nome: `P${i}` }))],
    stili: [{ nome: 'Wes A · m1', origine: 'mutazione', genitore: 'Wes A', versioni: 2, promossa: 1, voto: 7, segreto: 'sk-X' }, { nome: 'X', origine: 'inventata', versioni: 99999, voto: 'boh' }, { nome: '' }],
  })!;
  assert.equal(s.pronti.length, 10);
  assert.deepEqual(s.pronti[0], { nome: 'Fifine AM8 2', stile: 'Ultra' });
  assert.deepEqual(s.stili[0], { nome: 'Wes A · m1', origine: 'mutazione', genitore: 'Wes A', famiglia: '', etichetta: '', versioni: 2, promossa: true, voto: 7 });
  assert.equal(s.stili[1].origine, 'manuale');
  assert.equal(s.stili[1].versioni, 999);
  assert.equal(s.stili[1].voto, null);
  assert.ok(!JSON.stringify(s).includes('sk-X'));
  assert.equal(s.stili.length, 2);
  assert.deepEqual(pulisciStato({})!.pronti, []);
});
