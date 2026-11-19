import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tempoBattitura, codiceTesto, filtroVetrina } from './vetrina.mjs';

test('vetrina: battitura tra 1,6 e 4 s, prompt al sicuro nel codice, scena che parte dopo il prompt', () => {
  assert.equal(tempoBattitura('ciao'), 1.6);
  assert.equal(tempoBattitura('x'.repeat(500)), 4);
  const c = codiceTesto('Un "vinile" </script> che gira', 10);
  assert.match(c, /text: "Un \\"vinile\\" \\u003c\/script> che gira"/);
  assert.doesNotMatch(c, /<\/script>/);
  assert.match(c, /P\.typewriter\('#pr'/);
  const f = filtroVetrina({ tScena: 4.8, durata: 12 });
  assert.match(f, /\[2:v\]scale=860:558,setpts=PTS-STARTPTS\+4\.8\/TB\[s\]/);
  assert.match(f, /scale=860:558,.*overlay=60:820/s);
});
