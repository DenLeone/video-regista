import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { ZONA, dentroZona, topInZona, REGOLA_ZONE } from './zone.mjs';
import { postoFascia, visoNelTempo } from './viso-zone.mjs';
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

test('Ultron: tre posti (sopra la testa, accanto, petto), sempre in zona e mai sulla faccia', () => {
  const f = FASCIA.verticale;
  const sulViso = (p, v) => !(p.y + p.sh <= v.alto || p.y >= v.basso || p.x + p.sw <= v.sx || p.x >= v.dx);
  const inZona = (p) => dentroZona(p.x, p.y, p.sw, p.sh);
  // testa bassa: sopra la testa, grande
  const basso = { alto: 1100, basso: 1500, sx: 380, dx: 700 };
  const a = postoFascia({ viso: basso, w: 1080, h: 1920, f });
  assert.equal(a.posto, 'sopra'); assert.equal(a.y, 240); assert.ok(a.scala >= 0.85 && inZona(a) && !sulViso(a, basso));
  // testa a metà (come Skill): sopra, rimpicciolita ma ≥ 60%
  const meta = { alto: 750, basso: 1150, sx: 380, dx: 700 };
  const b = postoFascia({ viso: meta, w: 1080, h: 1920, f });
  assert.equal(b.posto, 'sopra'); assert.ok(b.scala >= 0.6 && b.y + b.sh <= 720 && inZona(b));
  // testa in alto: sopra non c'è spazio → petto, sotto il mento e sopra i sottotitoli
  const alta = { alto: 300, basso: 640, sx: 380, dx: 700 };
  const c = postoFascia({ viso: alta, w: 1080, h: 1920, f });
  assert.equal(c.posto, 'petto'); assert.ok(c.y >= 670 && c.y + c.sh <= 1190 && inZona(c) && !sulViso(c, alta));
  // testa in alto e spostata a sinistra, petto occupato da un viso grande: accanto, a destra
  const lato = { alto: 260, basso: 1180, sx: 60, dx: 380 };
  const d = postoFascia({ viso: lato, w: 1080, h: 1920, f });
  assert.equal(d.posto, 'accanto'); assert.ok(d.x >= 410 && inZona(d) && !sulViso(d, lato));
  // faccia enorme al centro: nessun posto
  assert.equal(postoFascia({ viso: { alto: 250, basso: 1500, sx: 100, dx: 980 }, w: 1080, h: 1920, f }), null);
  // 4K: stesse proporzioni
  assert.equal(postoFascia({ viso: { alto: 2200, basso: 3000, sx: 760, dx: 1400 }, w: 2160, h: 3840, f }).y, 480);
  // ingombro del viso nel tempo dell'animazione
  const v = visoNelTempo([{ t: 0, x: 0.5, y: 0.5, s: 0.1 }, { t: 1, x: 0.4, y: 0.4, s: 0.1 }, { t: 5, x: 0.5, y: 0.2, s: 0.1 }], 0, 1.5, 1080, 1920);
  assert.equal(Math.round(v.alto), Math.round((0.4 - 0.075) * 1920));
  assert.equal(Math.round(v.basso), Math.round((0.5 + 0.06) * 1920));
  assert.equal(visoNelTempo([{ t: 0, y: null }], 0, 2, 1080, 1920), null);
});
