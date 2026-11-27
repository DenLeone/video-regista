// 🎙️ Voce pulita (27/11): solo se chiesta, DeepFilterNet se c'è, altrimenti il filtro di ffmpeg; la durata non cambia
// (labbra a tempo), una volta sola per file, mai un errore. ffmpeg vero (senza ffmpeg la prova si salta), DeepFilterNet finto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { azzeraDeepFilter, chiedeVocePulita, pulisciVoce, volumeFinale } from './voce-pulita.mjs';
import { leggiStile } from './stile-su-misura.mjs';

const conFfmpeg = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();
const run = (cmd, args, opts = {}) => String(execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts }) ?? '');
const durata = (f) => Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).trim());
// RMS in dB di un tratto (astats scrive su stderr; l'ultima riga è il totale dei canali)
const rms = (f, da, a) => Number([...spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', f, '-af', `atrim=${da}:${a},astats`, '-f', 'null', '-'], { encoding: 'utf8' }).stderr.matchAll(/RMS level dB: (-?[\d.]+)/g)].at(-1)?.[1]);
// voce finta (un tono da 1 a 3 s) sopra un rumore rosa costante, 6 s a 44,1 kHz stereo (come una camera)
function sporco(dir) {
  const f = path.join(dir, 'a.voce.wav');
  run('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=f=220:d=2,volume=0.25', '-f', 'lavfi', '-i', 'anoisesrc=d=6:c=pink:a=0.02',
    '-filter_complex', '[0:a]adelay=1000|1000,apad=whole_dur=6[v];[v][1:a]amix=inputs=2:duration=longest:normalize=0', '-ar', '44100', '-ac', '2', f]);
  return f;
}

test('si accende solo se chiesta: «Voce: pulita» nel brief o nello stile', () => {
  assert.equal(chiedeVocePulita('Stile: Kal. Voce: pulita'), true);
  assert.equal(chiedeVocePulita('voce pulita, musica bassa'), true);
  assert.equal(chiedeVocePulita('Stile: Kal. Musica: sì'), false);
  assert.equal(chiedeVocePulita('la voce è già pronta'), false);
  assert.equal(leggiStile('Nome: X\nVoce: pulita', 'X').grafica.voce, 'pulita');
  assert.equal(leggiStile('Nome: X\nVoce: podcast', 'X').grafica.voce, 'podcast'); // il podcast resta com'era
  assert.equal(leggiStile('Nome: X', 'X').grafica.voce, undefined);
});

test('senza DeepFilterNet: il filtro di ffmpeg toglie rumore e livella la voce a −17 LUFS (mono), la durata resta', { skip: !conFfmpeg && 'senza ffmpeg' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voce-pulita-'));
  const vecchio = process.env.DEEPFILTER_BIN;
  try {
    process.env.DEEPFILTER_BIN = path.join(dir, 'non-esiste');
    azzeraDeepFilter();
    const f = sporco(dir);
    const snr = () => rms(f, 1.2, 2.8) - rms(f, 3.5, 5.5); // voce sopra il rumore, in dB
    const prima = { snr: snr(), durata: durata(f) };
    const log = [];
    assert.equal(pulisciVoce(f, { run, log: (t) => log.push(t), dir }), 'ffmpeg');
    assert.ok(snr() - prima.snr >= 3, `la voce deve stare sopra il rumore di almeno 3 dB in più (da ${prima.snr.toFixed(1)} a ${snr().toFixed(1)})`);
    const v = volumeFinale(f);
    assert.ok(v && Math.abs(v.lufs + 17) <= 1, `volume ${v?.lufs} LUFS invece di circa −17`);
    assert.ok(Math.abs(durata(f) - prima.durata) < 0.01, 'la durata non cambia');
    assert.equal(pulisciVoce(f, { run, log: () => {}, dir }), null); // una volta sola
    assert.ok(log.some((t) => /non disponibile/.test(t)));
  } finally {
    if (vecchio === undefined) delete process.env.DEEPFILTER_BIN; else process.env.DEEPFILTER_BIN = vecchio;
    azzeraDeepFilter();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('con DeepFilterNet: lo chiama con il ritardo compensato e rimette la durata di prima', { skip: !conFfmpeg && 'senza ffmpeg' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voce-pulita-'));
  const vecchio = process.env.DEEPFILTER_BIN;
  try {
    // DeepFilterNet finto: come quello vero scrive <out-dir>/<stesso nome>, qui 40 ms più corto (il ritardo compensato)
    const finto = path.join(dir, 'deep-filter');
    fs.writeFileSync(finto, `#!/bin/sh\n[ "$1" = "--version" ] && exit 0\necho "$@" > "${dir}/argomenti"\nfor a; do f="$a"; done\nwhile [ "$1" != "-o" ]; do shift; done\nffmpeg -v error -y -i "$f" -ss 0.04 "$2/$(basename "$f")"\n`, { mode: 0o755 });
    process.env.DEEPFILTER_BIN = finto;
    azzeraDeepFilter();
    const f = sporco(dir);
    const prima = durata(f);
    assert.equal(pulisciVoce(f, { run, log: () => {}, dir }), 'deepfilter');
    assert.match(fs.readFileSync(path.join(dir, 'argomenti'), 'utf8'), /--compensate-delay --atten-lim-db 30 -o /);
    assert.ok(Math.abs(durata(f) - prima) < 0.01, `durata ${durata(f)} invece di ${prima}`);
    assert.equal(fs.readFileSync(`${f}.pulita`, 'utf8'), 'deepfilter');
  } finally {
    if (vecchio === undefined) delete process.env.DEEPFILTER_BIN; else process.env.DEEPFILTER_BIN = vecchio;
    azzeraDeepFilter();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('volumeFinale: misura LUFS e picco del video finito, senza cambiarlo', { skip: !conFfmpeg && 'senza ffmpeg' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'volume-'));
  try {
    const f = sporco(dir);
    const prima = fs.readFileSync(f);
    const v = volumeFinale(f);
    assert.ok(v && v.lufs < -20 && v.lufs > -45 && Number.isFinite(v.picco), JSON.stringify(v));
    assert.ok(prima.equals(fs.readFileSync(f)), 'il file non si tocca');
    assert.equal(volumeFinale(path.join(dir, 'non-esiste.mp4')), null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
