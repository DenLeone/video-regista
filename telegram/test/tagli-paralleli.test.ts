import assert from 'node:assert/strict';
import { test } from 'node:test';
import { confrontaTagliParalleli, ffmpegDiProva } from '../../scripts/prova-tagli.mjs';

const SENZA_FFMPEG = 'ffmpeg con libx264 non è nel PATH';
// Il tsc del progetto vede solo test(nome, funzione). Node accetta anche { skip }.
const prova = test as unknown as (nome: string, opzioni: { skip?: string | boolean }, corpo: () => Promise<void>) => void;

prova('i tagli in parallelo coincidono con quelli uno alla volta', { skip: ffmpegDiProva() ? false : SENZA_FFMPEG }, async () => {
  const dir = await confrontaTagliParalleli();
  assert.equal(typeof dir, 'string');
});
