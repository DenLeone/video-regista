import assert from 'node:assert/strict';
import { test } from 'node:test';
import { testoErroreModello } from '../../scripts/studia-stile.mjs';

test('il timeout di Gemini arriva in italiano', () => {
  const e = new Error('The operation was aborted due to timeout');
  e.name = 'TimeoutError';
  assert.equal(testoErroreModello('gemini-flash-latest', e), 'gemini-flash-latest: tempo scaduto');
  assert.equal(testoErroreModello('gemini-2.5-flash', e).includes('aborted'), false);
});
