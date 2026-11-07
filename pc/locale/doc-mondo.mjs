// Stile Documentario: dalle scene (regia) al mondo e alla camera della composizione Documentario (src/documentario).
//   node pc/locale/doc-mondo.mjs <scene.json> <parole-pulite.json> <uscita props.json> --cartella documentario/<slug> [--fps 29.97]
// scene.json: { tema, scene: [ { da, a, modo: 'tu' } | { da, a, eroi: [ {tipo, …, parola?} ], eventi?: [ {tipo, parola, …} ], finale? } ] }
// - le parole ("parola": "esplodono") diventano tempi: la prima parola del parlato che comincia così dentro la scena
// - le posizioni non le decide l'AI: ogni scena è un gruppo in una cella del mondo, le celle in fila a serpentina
// - camera: arriva sul protagonista poco dopo l'inizio della scena, scivola piano verso la scena dopo, nelle scene
//   "tu" entra nella stampa di Denis finché il video riempie lo schermo (con un 6% di margine: mai il bordo in vista)
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opz = (k, d = '') => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const [fileScene, fileParole, uscita] = args;
if (!uscita) { console.error('uso: node pc/locale/doc-mondo.mjs <scene.json> <parole-pulite.json> <props.json> --cartella documentario/<slug>'); process.exit(1); }
const CART = opz('--cartella');
const FPS = Number(opz('--fps', 30000 / 1001));
const doc = JSON.parse(fs.readFileSync(fileScene, 'utf8'));
const parole = JSON.parse(fs.readFileSync(fileParole, 'utf8'));
const DURATA = +(opz('--durata') || (parole.at(-1).e + 0.3)).toFixed(3);

const VISTA = 1600;                 // px del mondo in larghezza a zoom 1
const ASPETTO = 16 / 9;             // schermo verticale
const BORDO_TU = 0.04;              // come in src/documentario/Documentario.tsx
const MARGINE_TU = 1.06;            // il video di Denis un 6% più grande dello schermo
// celle strette: ai bordi dell'inquadratura si vedono i vicini attenuati (con 2600×3400 ogni oggetto sembrava una slide)
const CELLA = { w: 1700, h: 2350 }, COLONNE = 3;

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
function tempo(parola, da, a) {
  if (typeof parola === 'number') return parola;
  const n = norm(parola);
  const w = parole.find((p) => p.s >= da - 0.6 && p.s <= a + 0.2 && norm(p.w).startsWith(n));
  if (!w) { console.log(`[doc-mondo] parola "${parola}" non trovata tra ${da} e ${a}: uso l'inizio della scena`); return da; }
  return w.s;
}

// misure tipiche per tipo di protagonista (px del mondo)
const MISURE = {
  foto: [1150, 1350], documento: [1200, 1560], frase: [1300, 1750], curva: [1300, 1100], acronimo: [1300, 1250],
  contatore: [1450, 760], cartellino: [1450, 560], parola: [1450, 430], tu: [1000, 1000 * (1 - 2 * BORDO_TU) * ASPETTO / (1 - 2 * BORDO_TU)],
};
// stampa "tu": il rettangolo interno (video) è 9:16
MISURE.tu = [1000, (1000 * (1 - 2 * BORDO_TU)) * ASPETTO + 1000 * 2 * BORDO_TU];

const casuale = (() => { let s = 12345; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
const oggetti = [], eventi = [], camera = [];
const cella = (k) => {
  const riga = Math.floor(k / COLONNE), col = riga % 2 ? COLONNE - 1 - (k % COLONNE) : k % COLONNE;
  return { x: CELLA.w * (col + 0.5) + (casuale() - 0.5) * 160, y: CELLA.h * (riga + 0.5) + (casuale() - 0.5) * 160 };
};
const zoomPer = (w, h, quota = 0.82) => Math.min((VISTA * quota) / w, (VISTA * ASPETTO * quota * 0.86) / h);
const centro = (o) => ({ x: o.x + o.w / 2, y: o.y + o.h / 2 });

let k = 0;
const scene = doc.scene.map((s, i) => ({ ...s, i }));
const ids = {};
for (const s of scene) {
  if (s.finale?.ancora) { s.oggetti = []; continue; }
  const c = cella(k++);
  s.centro = c;
  if (s.modo === 'tu') {
    const [w, h] = MISURE.tu;
    const o = { id: `tu${s.i}`, tipo: 'tu', x: c.x - w / 2, y: c.y - h / 2, w, h, rot: (casuale() - 0.5) * 6, entra: Math.max(0, s.da - 2.5),
      video: `${CART}/tu.mp4`, fermo: `${CART}/tu-fermo.jpg`, vivo: [[s.da, s.a]], eroe: [[s.da - 0.4, s.a + 0.2]] };
    oggetti.push(o); s.oggetti = [o];
    continue;
  }
  const n = s.eroi.length;
  s.oggetti = s.eroi.map((e, j) => {
    let [w, h] = e.misure || MISURE[e.tipo] || [1200, 1200];
    // scene "a fermate" (regia automatica): ogni protagonista ha la sua cella e la camera viaggia dall'uno all'altro
    if (s.fermate) {
      const cc = j === 0 ? c : cella(k++);
      const t = tempo(e.parola ?? s.da, s.da, s.a);
      const o = { id: e.id || `s${s.i}e${j}`, tipo: e.tipo, x: cc.x - w / 2, y: cc.y - h / 2, w, h, rot: e.rot ?? (casuale() - 0.5) * 7, entra: Math.max(0, j === 0 ? s.da + 0.25 : t - 0.35) };
      return completa(o, e, s, t);
    }
    // più protagonisti nella stessa scena: impilati (2) o a griglia 2×2 (3–4), più piccoli
    const f = n === 1 ? 1 : n === 2 ? 0.86 : 0.62;
    w *= f; h *= f;
    let x = c.x - w / 2, y = c.y - h / 2;
    if (n === 2) y = c.y + (j === 0 ? -h - 60 : 60);
    if (n >= 3) { x = c.x + (j % 2 ? 40 : -w - 40); y = c.y + (j < 2 ? -h - 40 : 40); }
    const t = tempo(e.parola ?? s.da, s.da, s.a);
    const o = { id: e.id || `s${s.i}e${j}`, tipo: e.tipo, x, y, w, h, rot: e.rot ?? (casuale() - 0.5) * 7, entra: Math.max(0, n === 1 || n >= 3 ? s.da + 0.25 + (n >= 3 ? j * 0.22 : 0) : j === 0 ? s.da + 0.25 : t - 0.15) };
    return completa(o, e, s, t);
  });
  function completa(o, e, s, t) {
    if (e.id) ids[e.id] = o.id;
    for (const c2 of ['titolo', 'sotto', 'righe', 'modo', 'valore']) if (e[c2] !== undefined) o[c2] = e[c2];
    if (e.file) o.foto = `${CART}/${e.file}`;
    if (e.scrivi) o.scrivi = [tempo(e.scrivi, s.da, s.a), tempo(e.scrivi, s.da, s.a) + 0.6];
    if (e.tipo === 'frase') {
      const testo = e.testo.split(/\s+/);
      const t0 = tempo(e.via ?? s.da, s.da, s.a), passo = e.passo ?? 0.42;
      o.parole = testo.map((w2, q) => ({ w: w2, t: e.modo === 'sequenza' ? t0 + q * passo : 0 }));
      if (e.fili) o.fili = e.fili.map(([a, b, p]) => [a, b, tempo(p, s.da, s.a)]);
      if (e.sbiadisci) o.sbiadisci = { t: tempo(e.sbiadisci.parola, s.da, s.a), fino: e.sbiadisci.fino };
    }
    if (e.tipo === 'curva') o.t0 = tempo(e.esplode, s.da, s.a);
    if (e.tipo === 'acronimo') o.lettere = e.lettere.map((l) => ({ l: l.l, resto: l.resto, t: tempo(l.parola, s.da, s.a) }));
    if (e.tipo === 'contatore') { o.t0 = tempo(e.da, s.da, s.a); o.t1 = tempo(e.a, s.da, s.a) + 0.4; }
    o._t = t;
    oggetti.push(o);
    return o;
  }
  // protagonista: dalla sua parola alla parola del protagonista dopo (o alla fine della scena)
  s.oggetti.forEach((o, j) => { o.eroe = [[j === 0 ? s.da : o._t, j + 1 < n ? s.oggetti[j + 1]._t : s.a]]; });
  for (const ev of s.eventi || []) {
    const bersaglio = s.oggetti[ev.su ?? 0];
    const t = tempo(ev.parola, s.da, s.a);
    const { parola, su, ...resto } = ev;
    eventi.push({ ...resto, t, oggetto: bersaglio.id });
  }
}

// camera
const bbox = (os) => {
  const x0 = Math.min(...os.map((o) => o.x)), y0 = Math.min(...os.map((o) => o.y)), x1 = Math.max(...os.map((o) => o.x + o.w)), y1 = Math.max(...os.map((o) => o.y + o.h));
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
};
const chiave = (t, x, y, zoom, rot = 0) => camera.push({ t: +t.toFixed(3), x: Math.round(x), y: Math.round(y), zoom: +zoom.toFixed(4), rot: +rot.toFixed(2) });
for (const [i, s] of scene.entries()) {
  const dopo = scene[i + 1];
  const verso = dopo ? dopo.centro : s.centro;
  if (s.modo === 'tu') {
    const o = s.oggetti[0], c = centro(o);
    const z = (VISTA / (o.w * (1 - 2 * BORDO_TU))) * MARGINE_TU;
    // dentro la stampa: ferma (la stampa è ruotata: la camera ruota con lei)
    const intera = zoomPer(o.w, o.h, 0.9);
    // la stampa intera sulla scrivania, poi la camera ci entra (~0,7 s) e ruota con lei (rotazione del mondo opposta)
    chiave(s.da - 0.75, c.x, c.y, intera, -o.rot * 0.4);
    chiave(s.da, c.x, c.y, z, -o.rot);
    chiave(Math.max(s.da + 0.2, s.a - 0.12), c.x, c.y, z * 1.015, -o.rot);
    chiave(s.a + 0.6, c.x, c.y, intera * 1.05, -o.rot * 0.4);
    continue;
  }
  const daTu = scene[i - 1]?.modo === 'tu';
  const arrivo = s.da + (daTu ? 1.25 : 0.35), partenza = Math.max(arrivo + 0.3, s.a - (dopo?.modo === 'tu' ? 0.95 : 0.35));
  if (s.finale) {
    // finale: sul protagonista, poi la camera si allontana su tutto il mondo mentre i fili collegano tutto
    const o = s.finale.ancora ? oggetti.find((x) => x.id === ids[s.finale.ancora]) : s.oggetti[0], c = centro(o);
    o.eroe = [...(o.eroe || []), [s.da, s.a + 1]];
    chiave(arrivo, c.x, c.y, zoomPer(o.w, o.h));
    const tf = tempo(s.finale.parola, s.da, s.a);
    chiave(tf, c.x, c.y, zoomPer(o.w, o.h) * 0.8);
    // indietro fino a vedere tre celle in larghezza attorno al protagonista: i fili escono dall'inquadratura verso il resto
    const zf = VISTA / (CELLA.w * 3.1);
    chiave(Math.min(s.a + 0.2, tf + 3.2), c.x, c.y + CELLA.h * 0.3, zf);
    chiave(DURATA, c.x, c.y + CELLA.h * 0.3, zf * 1.03);
    const verso2 = oggetti.filter((x) => x.tipo !== 'tu' && x.id !== o.id).map((x) => x.id);
    eventi.push({ tipo: 'fili', t: tf, oggetto: o.id, verso: verso2, passo: Math.min(0.25, 2.4 / verso2.length) });
    continue;
  }
  if (s.oggetti.length >= 3 && !s.fermate) {
    const b = bbox(s.oggetti), z = zoomPer(b.w, b.h, 0.9);
    chiave(arrivo, b.x, b.y, z);
    chiave(partenza, b.x + (verso.x - b.x) * 0.03, b.y + (verso.y - b.y) * 0.03, z * 1.04);
    continue;
  }
  s.oggetti.forEach((o, j) => {
    const c = centro(o), z = zoomPer(o.w, o.h);
    const prossimo = s.oggetti[j + 1];
    // a fermate: arriva mentre l'oggetto si posa e riparte ~0,6 s prima del prossimo; nella stessa cella più lento
    const t0 = j === 0 ? arrivo : o._t + (s.fermate ? 0.15 : 0.3);
    const fine = prossimo ? prossimo._t - (s.fermate ? 0.6 : 0.25) : partenza;
    const v = s.fermate && prossimo ? centro(prossimo) : verso;
    chiave(t0, c.x, c.y, z);
    // nelle pause la camera scivola piano verso dove andrà dopo
    if (fine > t0 + 0.4) chiave(fine, c.x + (v.x - c.x) * 0.04, c.y + (v.y - c.y) * 0.04, z * 1.05);
  });
}
camera.sort((a, b) => a.t - b.t);
// prima chiave a 0 e chiavi troppo vicine fuse
if (camera[0].t > 0) camera.unshift({ ...camera[0], t: 0 });
const pulita = camera.filter((c, i) => i === 0 || c.t - camera[i - 1].t > 0.05);

for (const o of oggetti) delete o._t;
const mondo = { w: CELLA.w * COLONNE, h: CELLA.h * Math.ceil(k / COLONNE), tema: doc.tema || 'archivio' };
const props = { durata: DURATA, fps: FPS, voce: `${CART}/voce.wav`, vista: VISTA, mondo, camera: pulita, oggetti, eventi };
fs.writeFileSync(uscita, JSON.stringify(props, null, 1));
// suoni (pc/rotolo/suoni.py): carta che cade, pennarello, timbro, macchina da scrivere, whoosh nei viaggi e nei tuffi
// dentro la stampa di Denis, tick del contatore; letto: archivio + musica documentario
if (opz('--eventi')) {
  const S = { foto: '01 Carta/caduta foto', carta: '01 Carta/caduta leggera', pennarello: '04 Scrittura/pennarello', timbro: '03 Timbri e colpi/timbro',
    tasto: '04 Scrittura/macchina da scrivere tasto', lento: '05 Movimento/whoosh lento', veloce: '05 Movimento/whoosh veloce', swish: '05 Movimento/swish corto',
    tick: '07 Digitale/tick contatore', riser: '05 Movimento/riser', hit: '08 Cinematico/hit', fruscio: '01 Carta/fruscio' };
  const ev = [];
  for (const o of oggetti) {
    if (o.entra > 0.1) ev.push({ t: o.entra + 0.25, suono: o.tipo === 'foto' || o.tipo === 'tu' ? S.foto : S.carta, db: -13 });
    if (o.tipo === 'frase' && o.modo === 'sequenza') o.parole.forEach((p) => ev.push({ t: p.t, suono: S.tasto, db: -19 }));
    if (o.tipo === 'frase' && o.modo === 'fili') (o.fili || []).forEach(([, , t]) => ev.push({ t, suono: S.fruscio, db: -14, durata: 0.6 }));
    if (o.tipo === 'curva') ev.push({ t: o.t0 - 0.9, suono: S.riser, db: -18, durata: 0.9 }, { t: o.t0, suono: S.hit, db: -10 });
    if (o.tipo === 'acronimo') o.lettere.forEach((l) => ev.push({ t: l.t, suono: S.tasto, db: -14 }));
    if (o.tipo === 'contatore') ev.push({ t: o.t0, suono: S.tick, db: -12, durata: Math.max(0.5, o.t1 - o.t0) });
  }
  for (const e of eventi) {
    if (e.tipo === 'timbro') ev.push({ t: e.t, suono: S.timbro, db: -6 });
    else if (e.tipo === 'fili') ev.push({ t: e.t, suono: S.lento, db: -10 });
    else ev.push({ t: e.t, suono: S.pennarello, db: -12, durata: 0.7 });
  }
  // tuffi nella stampa e viaggi veloci della camera
  for (const s of scene.filter((x) => x.modo === 'tu')) ev.push({ t: s.da - 0.6, suono: S.veloce, db: -11 }, { t: s.a, suono: S.swish, db: -14 });
  ev.sort((a, b) => a.t - b.t);
  fs.writeFileSync(opz('--eventi'), JSON.stringify({ durata: DURATA, letto: { stanza: '09 Ambiente/archivio', musica: '10 Musica/documentario' }, eventi: ev.filter((e) => e.t >= 0) }, null, 1));
}

const tu = scene.filter((s) => s.modo === 'tu').reduce((x, s) => x + s.a - s.da, 0);
console.log(`[doc-mondo] ${scene.length} scene, ${oggetti.length} oggetti, ${eventi.length} eventi, ${pulita.length} chiavi di camera; Denis in camera ${(100 * tu / DURATA).toFixed(0)}% → ${uscita}`);
