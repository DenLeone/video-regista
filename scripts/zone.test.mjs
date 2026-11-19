import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { ZONA, dentroZona, topInZona, REGOLA_ZONE } from './zone.mjs';
import { postoFascia, testaInAlto } from './viso-zone.mjs';
import { FASCIA } from './bdm.mjs';

test('zone: dentro/fuori, tasti di Instagram, cimitero', () => {
  assert.equal(dentroZona(160, 1200, 760, 120), true); // sottotitoli
  assert.equal(dentroZona(160, 1200, 800, 120), false); // finisce a 960, sotto y 970: tasti
  assert.equal(dentroZona(60, 300, 960, 200), true); // in alto si arriva a 1020
  assert.equal(dentroZona(100, 1500, 300, 60), false); // cimitero
  assert.equal(dentroZona(100, 120, 300, 60), false); // sopra la zona
  assert.equal(topInZona(100), 240);
  assert.equal(topInZona(1500, 200), 1330);
  assert.match(REGOLA_ZONE, /y 240–1530/);
});

test('zone: le posizioni fisse cambiate stanno dentro', () => {
  const testo = fs.readFileSync(new URL('../src/testo.ts', import.meta.url), 'utf8');
  const lato = +/SICURA = \{ lato: (\d+)/.exec(testo)[1];
  assert.equal(dentroZona(lato, 1240, 1080 - 2 * lato, 120), true, 'sottotitoli larghi quanto SICURA');
  const sopra = fs.readFileSync(new URL('../src/SchermateSopra.tsx', import.meta.url), 'utf8');
  const a = /const AREA = \{ top: (\d+), bottom: (\d+), left: (\d+), larghezza: (\d+)/.exec(sopra).slice(1).map(Number);
  assert.equal(dentroZona(a[2], a[0], a[3], a[1] - a[0]), true, 'schermate sopra la testa');
  assert.ok(FASCIA.verticale.y >= ZONA.sicura.y0, 'fascia di Ultron');
  assert.equal(dentroZona(64, 1452, 300, 40), true, 'firma');
  assert.equal(dentroZona(60, 360, 360, 480) && dentroZona(1080 - 60 - 360, 360, 360, 480), true, 'inserti laterali');
});

test('Ultron: la fascia sta tra la zona sicura e la testa, mai sopra la faccia', () => {
  const f = FASCIA.verticale;
  // testa bassa (top capelli a 1100): fascia grande quanto la zona sicura permette (960 px di larghezza)
  const largo = postoFascia({ testa: 1100, w: 1080, h: 1920, f });
  assert.deepEqual(largo, { x: 60, y: 240, sw: 960, sh: 622, scala: 0.89 });
  assert.ok(largo.y + largo.sh <= 1100 - 30);
  // testa a metà (top a 700): più piccola, centrata, sopra la testa
  const medio = postoFascia({ testa: 700, w: 1080, h: 1920, f });
  assert.ok(medio.y + medio.sh <= 670 && medio.scala < 0.89 && medio.x + medio.sw / 2 === 540);
  // testa troppo in alto: niente animazione
  assert.equal(postoFascia({ testa: 450, w: 1080, h: 1920, f }), null);
  // 4K verticale: stesse proporzioni
  const k4 = postoFascia({ testa: 2200, w: 2160, h: 3840, f });
  assert.equal(k4.y, 480);
  // testa più alta nel tempo dell'animazione
  const punti = [{ t: 0, y: 0.5, s: 0.1 }, { t: 1, y: 0.4, s: 0.1 }, { t: 5, y: 0.2, s: 0.1 }];
  assert.equal(Math.round(testaInAlto(punti, 0, 1.5, 1920)), Math.round((0.4 - 0.075) * 1920));
  assert.equal(testaInAlto([{ t: 0, y: null, s: null }], 0, 2, 1920), null);
});
