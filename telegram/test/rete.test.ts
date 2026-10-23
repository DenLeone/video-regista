import assert from 'node:assert/strict';
import { test } from 'node:test';
import { comandiScaricoR2, stimaConfronto } from '../../scripts/rete.mjs';

test('lo scarico da R2 non tocca Drive e tiene tanti trasferimenti', () => {
  const cmd = comandiScaricoR2({ id: 'a'.repeat(32), bucket: 'regista-inbox', dest: '/mnt/regista/in' });
  assert.equal(cmd.includes('gdrive'), false);
  assert.ok(cmd.includes('--transfers'));
  assert.equal(cmd[cmd.indexOf('--transfers') + 1], '16');
  assert.ok(cmd.includes('manifest.json'));
  assert.equal(cmd[1].startsWith('r2:regista-inbox/inbox/'), true);
});

test('su 8 GB il telefono risparmia molto più del runner', () => {
  const s = stimaConfronto(8000);
  assert.ok(s.telefono.risparmio > 2 * 3600);
  assert.ok(s.telefono.risparmio > s.runner.risparmio * 5);
  assert.ok(s.telefono.r2 != null && s.telefono.drive != null && s.telefono.r2 < s.telefono.drive);
});
