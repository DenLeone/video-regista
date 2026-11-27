import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { creaFogli } from './fogli-video.mjs';

const ffmpegOk = !spawnSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' }).error;

test('fogli: un foglio ogni 15 fotogrammi e una copia leggera', { skip: !ffmpegOk }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fv-t-'));
  const src = path.join(dir, 's.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=s=640x1138:r=25:d=10', '-f', 'lavfi', '-i', 'sine=d=10', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', src]);
  const r = creaFogli({ src, out: path.join(dir, 'o'), passo: 0.5 });
  assert.equal(r.fotogrammi, 20);
  assert.equal(r.fogli.length, 2);
  for (const f of [...r.fogli, r.piccolo]) assert.ok(fs.statSync(f).size > 1000, f);
  assert.ok(fs.statSync(r.piccolo).size < 3e6);
  fs.rmSync(dir, { recursive: true, force: true });
});
