import assert from 'node:assert/strict';
import { test } from 'node:test';
import { confrontaTagliParalleli } from '../../scripts/prova-tagli.mjs';

test('i tagli in parallelo coincidono con quelli uno alla volta', async () => {
  const dir = await confrontaTagliParalleli();
  assert.equal(typeof dir, 'string');
});
