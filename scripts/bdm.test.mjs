import assert from 'node:assert/strict';
import { test } from 'node:test';
import { estraiCodice, giudica, pagina, usa3D, GUIDA } from './bdm.mjs';

const BUONO = "M.el('div', { id: 'a', cls: 'abs row h2', text: 'CIAO', style: { top: '200px' } });\nadd(P.enter('#a', { t: 0.2 }));";

test('bdm: dal testo di Claude prende solo il codice, e rifiuta quello che rompe il render', () => {
  assert.equal(estraiCodice(`Ecco:\n\`\`\`js\n${BUONO}\n\`\`\`\nfine`), BUONO);
  assert.throws(() => estraiCodice('niente'), /nessun codice/);
  assert.throws(() => estraiCodice(`\`\`\`js\n${BUONO}\nconst x = Math.random();\n\`\`\``), /Math\.random/);
  assert.throws(() => estraiCodice(`\`\`\`js\n${BUONO}\nadd(P.flash(1));\n\`\`\``), /P\.flash/);
  assert.throws(() => estraiCodice(`\`\`\`js\n<script>${BUONO}</script>\n\`\`\``), /HTML/);
});

test('bdm: pagina trasparente, 3D solo se la scena usa M3 (con importmap e M3.boot)', () => {
  const p2 = pagina(BUONO, { w: 1080, h: 700, dur: 3, tre: usa3D(BUONO) });
  assert.match(p2, /M\.META = \{ width: 1080, height: 700, fps: 30, duration: 3 \}/);
  assert.match(p2, /M\.boot\(\)/);
  assert.doesNotMatch(p2, /importmap/);
  const c3 = "const c = M3.card({ ui: 'grafico', w: 500, h: 300 });\nM3.anim(c, [{ t: 0, z: -500 }, { t: 1, z: 0 }]);";
  assert.equal(usa3D(c3), true);
  const p3 = pagina(c3, { w: 1080, h: 700, dur: 3, tre: true });
  assert.match(p3, /importmap/); assert.match(p3, /M3\.init\(\{[^}]*bg: null/); assert.match(p3, /M3\.boot\(\)/);
  assert.match(GUIDA({ w: 1080, h: 700, dur: 3, media: ['logo.png'] }), /assets\/logo\.png/);
});

test('bdm: le prove bocciano errori, fascia vuota o piena, scena ferma, testi fuori o sovrapposti', () => {
  const base = { errori: [], coperture: [0.1, 0.2, 0.2, 0.2, 0.2, 0.1], uguali: false, rettangoli: [[{ x: 100, y: 100, w: 600, h: 90, n: 5 }]], w: 1080, h: 700 };
  assert.equal(giudica(base), null);
  assert.match(giudica({ ...base, errori: ['ReferenceError: x'] }), /errore JavaScript/);
  assert.match(giudica({ ...base, coperture: [0, 0, 0, 0, 0, 0] }), /vuota/);
  assert.match(giudica({ ...base, coperture: [0.2, 0.95, 0.2, 0.2, 0.2, 0.2] }), /colore pieno/);
  assert.match(giudica({ ...base, uguali: true }), /non si muove/);
  assert.match(giudica({ ...base, rettangoli: [[{ x: 100, y: 640, w: 600, h: 90, n: 5 }]] }), /esce dalla fascia/);
  assert.equal(giudica({ ...base, rettangoli: [[{ x: 100, y: -20, w: 600, h: 90, n: 5 }]] }), null); // sta uscendo: va bene
  assert.match(giudica({ ...base, rettangoli: [[{ x: 100, y: 100, w: 600, h: 90, n: 5 }, { x: 150, y: 120, w: 500, h: 90, n: 4 }]] }), /sovrappongono/);
});
