import assert from 'node:assert/strict';
import { regolaStile } from './regolatore.mjs';

const clip = (d, extra = {}) => ({ file: 'a.mp4', start: 0, end: d, ...extra });
const img = (continua = false) => ({ file: 'i.jpg', tipo: 'immagine', ...(continua ? { continua } : {}) });

// bianco e nero: solo il primo momento breve
{
  const p = { clips: [clip(6, { bn: true }), clip(3, { bn: true }), clip(2, { bn: true })] };
  const r = regolaStile(p, { biancoNero: 'uno' });
  assert.deepEqual(p.clips.map((c) => Boolean(c.bn)), [false, true, false]);
  assert.equal(r.bn, 2);
}
// inserti di lato: uno ogni 10 s
{
  const p = { clips: [clip(2, { inserto: img() }), clip(3, { inserto: img() }), clip(6), clip(2, { inserto: img() })] };
  regolaStile(p, { cornice: 'laterale' });
  assert.deepEqual(p.clips.map((c) => Boolean(c.inserto)), [true, false, false, true]);
}
// pezzi che continuano la stessa scheda: tenuti fino a ~4 s
{
  const p = { clips: [clip(2, { inserto: img() }), clip(2, { inserto: img(true) }), clip(2, { inserto: img(true) })] };
  regolaStile(p, { cornice: 'laterale' });
  assert.deepEqual(p.clips.map((c) => Boolean(c.inserto)), [true, true, false]);
}
// altri stili: niente cambia
{
  const p = { clips: [clip(2, { inserto: img(), bn: true }), clip(2, { inserto: img(), bn: true })] };
  regolaStile(p, { cornice: 'scheda', biancoNero: 'momenti' });
  assert.ok(p.clips.every((c) => c.inserto && c.bn));
}
console.log('regolatore ok');
