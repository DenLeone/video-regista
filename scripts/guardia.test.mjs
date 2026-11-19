import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { controlla } from './guardia.mjs';
import { giudicaClaude, giudicaGemini } from './guardia-chiavi.mjs';

test('guardia: file importanti troncati o cancellati, il resto no', () => {
  const righe = { '.github/workflows/regista.yml': [730, 166], 'telegram/src/index.ts': [2620, 2], 'scripts/ultron.mjs': [200, 150], 'README.md': [400, 10], 'scripts/piccolo.mjs': [40, 5] };
  const cambi = [...Object.keys(righe).map((file) => ({ stato: 'M', file })), { stato: 'D', file: 'scripts/bdm.mjs' }, { stato: 'D', file: 'docs/vecchio.md' }];
  const p = controlla(cambi, { prima: (f) => righe[f][0], dopo: (f) => righe[f][1] });
  assert.deepEqual(p, ['✂️ .github/workflows/regista.yml: da 730 a 166 righe', '✂️ telegram/src/index.ts: da 2620 a 2 righe', '🗑 scripts/bdm.mjs: cancellato']);
});

test('guardia: avvisa solo quando Denis deve fare qualcosa', () => {
  assert.deepEqual(giudicaClaude({ status: 0, stdout: '{"result":"OK"}' }), { ok: true });
  assert.equal(giudicaClaude({ status: 1, stdout: '{"is_error":true,"result":"Claude AI usage limit reached"}' }).limite, true);
  assert.equal(giudicaClaude({ status: 1, stdout: '{"is_error":true,"result":"Invalid API key · Please run /login"}' }).scaduto, true);
  assert.equal(giudicaGemini(200).ok, true);
  assert.equal(giudicaGemini(429).limite, true);
  assert.equal(giudicaGemini(403).rifiutata, true);
});

test('guardia: giro vero su un repo finto (troncato → esce 1, «guardia: ok» → passa)', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'guardia-'));
  const g = (...a) => execFileSync('git', a, { cwd: d, encoding: 'utf8' });
  g('init', '-q'); g('config', 'user.email', 'a@b'); g('config', 'user.name', 'prova');
  fs.mkdirSync(path.join(d, 'scripts'));
  fs.writeFileSync(path.join(d, 'scripts', 'x.mjs'), Array.from({ length: 100 }, (_, i) => `const a${i} = ${i};`).join('\n'));
  g('add', '.'); g('commit', '-qm', 'uno');
  fs.writeFileSync(path.join(d, 'scripts', 'x.mjs'), 'const a = 1;\n');
  g('commit', '-qam', 'due');
  const script = path.resolve('scripts/guardia.mjs');
  const r = (msg) => { try { execFileSync(process.execPath, [script, 'HEAD~1', 'HEAD'], { cwd: d, encoding: 'utf8', env: { ...process.env, NOTIFY_URL: '' } }); return 0; } catch (e) { return e.status; } };
  assert.equal(r(), 1);
  g('commit', '-q', '--amend', '-m', 'due\n\nguardia: ok');
  assert.equal(r(), 0);
});
