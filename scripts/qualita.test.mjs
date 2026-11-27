import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QUALITA } from './qualita.mjs';

test('qualità del finale: 40 Mbps, preset lento, master quasi senza perdite', () => {
  assert.equal(QUALITA.videoBitrate, '40M');
  assert.equal(QUALITA.maxRate, '44M');
  assert.equal(QUALITA.buffer, '88M');
  assert.equal(QUALITA.x264Preset, 'slow');
  assert.equal(QUALITA.masterCrf, '12');
  assert.equal(QUALITA.audio, '320k');
});
