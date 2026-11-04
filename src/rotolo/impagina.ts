// Rotolo — impaginazione, camera ed eventi sonori di un documentario a piano sequenza.
// Puro TypeScript (niente React, niente import): lo usano sia Remotion (src/Rotolo.tsx) sia gli script
// sul PC/runner (pc/rotolo/*.mjs, con node --experimental-strip-types). Tutto è in coordinate del
// "mondo": il rotolo di carta va da x -1000 a 1000, y cresce verso il basso; lo schermo è 2160×3840.
//
// Il video si descrive in beats.json (vedi pc/rotolo/LEGGIMI.md): una lista di "beat", ognuno con i suoi
// elementi agganciati ai tempi delle parole. Qui si decide dove va ogni elemento e dove guarda la camera.

export type Elemento = {
  tipo: 'anno' | 'titolo' | 'kanji' | 'macchina' | 'nome' | 'foto' | 'ritaglio' | 'carte' | 'timbro' | 'schede' | 'grafico' | 'contatore' | 'schema' | 'cerchio';
  t?: number;               // secondo della parola che lo fa comparire (default: inizio del beat)
  testo?: string;           // anno, titolo, kanji, macchina, timbro
  sotto?: string;           // kanji: etichetta a macchina accanto; timbro: scritta sotto
  colore?: 'rosso';
  grande?: boolean;
  dur?: number;             // durata della scritta (anno, titolo, kanji)
  nome?: string; ruolo?: string; kanjiNome?: string;            // nome
  file?: string; files?: string[]; ar?: number; ars?: number[]; // foto, ritaglio, carte (ar = larghezza/altezza)
  bn?: boolean;             // foto in bianco e nero (default: sì per persona/luogo/documento)
  misura?: 'piccola' | 'media' | 'grande';
  lato?: 'sx' | 'dx';       // due elementi consecutivi con lati opposti stanno affiancati
  solo?: boolean;           // timbro: da solo, non appoggiato all'elemento prima
  sopra?: boolean;          // ritaglio: appoggiato sull'angolo dell'elemento prima (non occupa spazio)
  voci?: { kanji?: string; titolo: string; icona?: string; t?: number }[]; // schede
  croci?: number[];         // schede: quando barrare ogni voce
  timbroFinale?: { testo: string; sotto?: string; t: number };   // schede: timbro su tutto il gruppo
  etichette?: string[]; forma?: 'crollo' | 'crescita' | 'picco'; tCambio?: number; titoloGrafico?: string; // grafico
  valore?: number; prefisso?: string; etichetta?: string;        // contatore; etichetta anche: barra della card (foto, mondo tech)
  disegno?: 'pantografo';   // schema
  su?: number;              // cerchio: indice (nel beat) della foto da cerchiare
  cx?: number; cy?: number; // cerchio: punto nella foto, 0..1
  zoom?: boolean;           // cerchio: la camera ci entra dentro
  suffisso?: string;        // contatore: dopo il numero (es. " €")
};
// presentatore (video di Denis alla scrivania): intero = lui a tutto schermo, meta = lui sotto e grafica sopra,
// nascosto = solo grafica. Default: meta se il beat ha elementi, intero se è vuoto.
export type ModoLastra = 'intero' | 'meta' | 'nascosto';
export type Beat = { t: number; elementi: Elemento[]; presentatore?: ModoLastra };
export type Presentatore = { file: string; ar?: number; viso?: { t: number; x: number; y: number }[] };
export type Finale = { t: number; righe: { testo: string; t: number; rosso?: string }[]; timbro?: { testo: string; t: number }; presentatore?: ModoLastra };
export type Documento = {
  titolo: string;
  cartella: string;        // dentro public/, es. "collage/doc-nintendo"
  voce: string;            // file audio nella cartella
  durata: number;          // secondi
  fps?: number;
  mondo?: 'rotolo' | 'tech'; // aspetto: carta e inchiostro (default) o canvas tech scuro
  apertura?: Beat & { fino: number };  // mostrata in fondo al rotolo; poi la camera corre all'inizio
  beats: Beat[];
  presentatore?: Presentatore; // il video della persona: la voce è il suo audio
  finale?: Finale;
};

export type Posato = { el: Elemento; x: number; y: number; w: number; h: number; t: number; beat: number; id: string; rot: number; ospite?: Posato };
export type Chiave = [number, number, number, number]; // tempo, x, y, zoom
export type Evento = { t: number; suono: string; db: number; pan?: number; durata?: number; da?: number };
export type Impaginato = { posati: Posato[]; camera: Chiave[]; altezza: number; anni: [string, number][]; eventi: Evento[] };

const GAP = 90, GAP_BEAT = 320, LARGO = 1400;
const W = 2160, H = 3840;

const lungo = (s?: string) => (s || '').length;
const casuale = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return ((h >>> 0) % 1000) / 1000; };
const tra = (a: number, b: number, v: number) => Math.max(a, Math.min(b, v));

function bnDi(el: Elemento) {
  if (el.bn !== undefined) return el.bn;
  return /^(persona|luogo|documento)/i.test(el.file || '');
}
export const fotoBN = bnDi;

// corpo del testo: quello pensato per il tipo, ridotto se la scritta è troppo lunga per stare in LARGO
export function corpo(el: Elemento): number {
  const n = Math.max(1, lungo(el.tipo === 'nome' ? el.nome : el.testo));
  const base = el.tipo === 'anno' ? (el.grande === false ? 360 : 520) : el.tipo === 'titolo' ? (el.grande ? 300 : 235)
    : el.tipo === 'macchina' ? (el.grande ? 92 : 74) : el.tipo === 'nome' ? 132 : 100;
  const largo = el.tipo === 'anno' ? 0.62 : el.tipo === 'macchina' ? 0.64 : el.tipo === 'nome' ? 0.5 : 0.56;
  return Math.floor(Math.min(base, LARGO / (n * largo)));
}
// kanji con un'etichetta lunga: l'etichetta va sotto (accanto non ci sta)
export const kanjiSotto = (el: Elemento) => !!el.sotto && (el.sotto.length > 9 || (el.testo || '').length > 2);

// corpo di una riga del finale (testo a schermo, 2160 di larghezza)
export const corpoRiga = (testo: string) => Math.floor(Math.min(250, 1900 / (Math.max(1, testo.length) * 0.56)));

// misure di ingombro di ogni elemento (mondo)
// voci delle schede: altezza della card e passo tra una e l'altra
export const schedeDi = (mondo?: string) => (mondo === 'tech' ? { alt: 360, passo: 460 } : { alt: 560, passo: 700 });
const CARD_TECH = { pad: 24, testa: 64 }; // uguale a CARD in tech.tsx

// dove sta l'immagine dentro una foto posata (per cerchi e zoom)
export function areaImmagine(p: { x: number; y: number; w: number; h: number }, mondo?: string) {
  if (mondo === 'tech') { const iw = p.w - 2 * CARD_TECH.pad, ih = p.h - CARD_TECH.pad - CARD_TECH.testa; return { x0: p.x - p.w / 2 + CARD_TECH.pad, y0: p.y - p.h / 2 + CARD_TECH.testa, w: iw, h: ih }; }
  const iw = p.w * 0.91, ih = p.h - p.w * 0.09;
  return { x0: p.x - iw / 2, y0: p.y - ih / 2, w: iw, h: ih };
}

export function misura(el: Elemento, mondo?: string): { w: number; h: number } {
  switch (el.tipo) {
    case 'anno': { const s = corpo(el); return { w: Math.min(LARGO, lungo(el.testo) * 0.62 * s), h: s * 0.95 }; }
    case 'titolo': { const s = corpo(el); return { w: Math.min(LARGO, lungo(el.testo) * 0.56 * s), h: s * 1.05 }; }
    case 'kanji': return { w: 1300, h: kanjiSotto(el) ? 420 : 260 };
    case 'macchina': { const s = corpo(el); return { w: Math.min(LARGO, lungo(el.testo) * 0.64 * s), h: s * 1.3 }; }
    case 'nome': { const s = corpo(el); return { w: Math.min(LARGO, lungo(el.nome) * 0.5 * s), h: (el.ruolo ? 75 : 0) + s * 1.14 + (el.kanjiNome ? 85 : 0) }; }
    case 'foto': {
      const ar = el.ar || 1.4;
      let w = el.misura === 'piccola' ? 720 : el.misura === 'media' ? 1040 : 1320;
      if (ar < 0.85) w *= 0.7;
      if (mondo === 'tech') return { w, h: (w - 2 * CARD_TECH.pad) / ar + CARD_TECH.pad + CARD_TECH.testa };
      return { w, h: (w * 0.91) / ar + w * 0.09 };
    }
    case 'ritaglio': { const ar = el.ar || 1; const w = el.grande ? 1300 : 600; return { w, h: w / ar }; }
    case 'carte': { const n = (el.files || []).length || 1; const cw = n > 2 ? 540 : 620; return { w: Math.min(LARGO, cw + (n - 1) * cw * 0.7), h: cw / (el.ars?.[0] || 0.6) + 80 }; }
    case 'timbro': return { w: 500, h: el.grande ? 500 : 300 };
    case 'schede': { const n = (el.voci || []).length || 1; const sc = schedeDi(mondo); return { w: 980, h: n * sc.alt + (n - 1) * (sc.passo - sc.alt) }; }
    case 'grafico': return { w: 1400, h: 760 };
    case 'contatore': return { w: 1200, h: 340 };
    case 'schema': return { w: 1700, h: 650 };
    case 'cerchio': return { w: 0, h: 0 };
  }
}

const sovrapposto = (el: Elemento) => el.tipo === 'cerchio' || (el.tipo === 'timbro' && !el.solo) || (el.tipo === 'ritaglio' && !!el.sopra);

// ---------------------------------------------------------------- impaginazione
export function impagina(doc: Documento): Impaginato {
  const posati: Posato[] = [];
  const gruppi: { beat: number; top: number; bot: number; blocchi: Posato[][]; t: number }[] = [];
  let y = 700;

  const posaBeat = (b: Beat, ib: number) => {
    if (!b.elementi.length) return; // beat solo del presentatore: niente sul canvas
    const top = y;
    const blocchi: Posato[][] = [];
    let ultimo: Posato | undefined;
    const els = b.elementi;
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      const t = el.t ?? b.t;
      const id = `${ib}-${i}`;
      if (sovrapposto(el)) {
        const ospite = el.tipo === 'cerchio' ? posati.find((p) => p.id === `${ib}-${el.su ?? -1}`) || ultimo : ultimo;
        posati.push({ el, x: ospite?.x ?? 0, y: ospite?.y ?? y, w: 0, h: 0, t, beat: ib, id, rot: el.tipo === 'timbro' ? 6 + 6 * casuale(id) : 0, ospite });
        continue;
      }
      const m = misura(el, doc.mondo);
      const prossimo = els[i + 1];
      const affianca = el.lato && prossimo && prossimo.lato && prossimo.lato !== el.lato && !sovrapposto(prossimo);
      if (affianca) {
        const m2 = misura(prossimo, doc.mondo);
        const k = Math.min(1, 1320 / (m.w + m2.w + 80));
        const h = Math.max(m.h, m2.h) * k;
        const a: Posato = { el, x: el.lato === 'sx' ? -340 : 340, y: y + h / 2, w: m.w * k, h: m.h * k, t, beat: ib, id, rot: rotDi(el, id) };
        const id2 = `${ib}-${i + 1}`;
        const c: Posato = { el: prossimo, x: -a.x, y: y + h / 2, w: m2.w * k, h: m2.h * k, t: prossimo.t ?? b.t, beat: ib, id: id2, rot: rotDi(prossimo, id2) };
        posati.push(a, c); blocchi.push([a, c]); ultimo = c;
        y += h + GAP; i++;
        continue;
      }
      const p: Posato = { el, x: 0, y: y + m.h / 2, w: m.w, h: m.h, t, beat: ib, id, rot: rotDi(el, id) };
      posati.push(p); blocchi.push([p]); ultimo = p;
      y += m.h + GAP;
    }
    const bot = y - GAP;
    gruppi.push({ beat: ib, top, bot, blocchi, t: b.t });
    y += GAP_BEAT;
  };

  doc.beats.forEach((b, i) => posaBeat(b, i));
  let gApertura: typeof gruppi[number] | undefined;
  if (doc.apertura) { y += 300; posaBeat(doc.apertura, -1); gApertura = gruppi.pop(); }
  const altezza = y + 400;

  const anni: [string, number][] = posati.filter((p) => p.el.tipo === 'anno').map((p) => [p.el.testo || '', p.y]);
  if (gApertura) anni.push(['OGGI', (gApertura.top + gApertura.bot) / 2]);

  const camera = calcolaCamera(doc, gruppi, gApertura, altezza);
  const eventi = calcolaEventi(doc, posati, camera);
  return { posati, camera, altezza, anni, eventi };
}

function rotDi(el: Elemento, id: string) {
  const r = casuale(id) * 2 - 1;
  if (el.tipo === 'foto' || el.tipo === 'ritaglio') return r * 3;
  if (el.tipo === 'carte') return 0;
  if (el.tipo === 'schede') return 0;
  return 0;
}

// ---------------------------------------------------------------- camera
// hv: altezza di schermo libera per la grafica (con la lastra a metà ne resta metà)
const zFit = (w: number, h: number, max = 1.5, hv = H) => tra(0.45, max, Math.min((0.86 * W) / Math.max(w, 400), (0.7 * hv) / Math.max(h, 300)));

function calcolaCamera(doc: Documento, gruppi: { beat: number; top: number; bot: number; blocchi: Posato[][]; t: number }[], ap: { top: number; bot: number; blocchi: Posato[][] } | undefined, altezza: number): Chiave[] {
  type Fermata = { t: number; via: number; x: number; y: number; z: number };
  const fermate: Fermata[] = [];
  const fineStoria = doc.finale?.t ?? doc.durata;

  gruppi.forEach((g, gi) => {
    const succ = gruppi[gi + 1]?.t ?? fineStoria;
    const larg = Math.max(...g.blocchi.flat().map((p) => Math.abs(p.x) * 2 + p.w));
    const alt = g.bot - g.top;
    const hv = doc.presentatore && modoBeat(doc, g.beat) === 'meta' ? H * 0.5 : H;
    const zf = (w: number, h: number, max = 1.5) => zFit(w, h, max, hv);
    const zG = zf(larg, alt);
    const tBlocco = (bl: Posato[]) => Math.min(...bl.map((p) => p.t));
    const sovr = doc.beats[g.beat].elementi;
    // un gruppo che sta bene in un'inquadratura: una fermata sola
    const conSchede = g.blocchi.some((bl) => bl.some((p) => p.el.tipo === 'schede' && (p.el.voci || []).length > 1));
    if (!conSchede && (zG >= 1.15 || g.blocchi.length === 1)) {
      fermate.push({ t: g.t, via: succ, x: 0, y: (g.top + g.bot) / 2, z: zG });
    } else {
      // gruppo lungo: la camera visita i blocchi uno alla volta, ognuno sulla sua parola
      const bl = g.blocchi.map((b) => ({ b, t: Math.max(g.t, tBlocco(b)) })).sort((a, b) => a.t - b.t);
      bl.forEach((x, i) => {
        const yb = Math.min(...x.b.map((p) => p.y - p.h / 2)), yb2 = Math.max(...x.b.map((p) => p.y + p.h / 2));
        const lb = Math.max(...x.b.map((p) => Math.abs(p.x) * 2 + p.w));
        // le schede (lista lunga) si seguono voce per voce
        const sch = x.b.length === 1 && x.b[0].el.tipo === 'schede' ? x.b[0] : null;
        if (sch && sch.el.voci) {
          const n = sch.el.voci.length, top = sch.y - sch.h / 2;
          sch.el.voci.forEach((v, k) => {
            const tv = v.t ?? x.t;
            const tn = sch.el.voci![k + 1]?.t ?? bl[i + 1]?.t ?? succ;
            const sc = schedeDi(doc.mondo);
            fermate.push({ t: tv, via: tn, x: 0, y: top + k * sc.passo + sc.alt / 2, z: zf(1000, sc.alt + 340, 1.5) });
          });
          const tz = Math.min(...(sch.el.croci || [Infinity]), sch.el.timbroFinale?.t ?? Infinity);
          if (Number.isFinite(tz)) fermate.push({ t: tz - 0.1, via: bl[i + 1]?.t ?? succ, x: 0, y: sch.y, z: zf(1100, sch.h + 200, 1.1) });
          void n;
          return;
        }
        fermate.push({ t: x.t, via: bl[i + 1]?.t ?? succ, x: 0, y: (yb + yb2) / 2, z: zf(lb, yb2 - yb + 500) });
      });
    }
    // cerchio con zoom: la camera entra nel punto
    sovr.forEach((el, i) => {
      if (el.tipo !== 'cerchio' || !el.zoom) return;
      const host = g.blocchi.flat().find((p) => p.id === `${g.beat}-${el.su ?? -1}`);
      if (!host) return;
      const a = areaImmagine(host, doc.mondo);
      const px = a.x0 + (el.cx ?? 0.5) * a.w, py = a.y0 + (el.cy ?? 0.5) * a.h;
      const t = el.t ?? g.t;
      fermate.push({ t: t + 0.25, via: succ, x: px, y: py, z: 2.45 });
      void i;
    });
  });
  fermate.sort((a, b) => a.t - b.t);
  for (let i = 0; i < fermate.length; i++) fermate[i].via = Math.min(fermate[i].via, fermate[i + 1]?.t ?? fermate[i].via);

  const k: Chiave[] = [];
  const add = (t: number, x: number, y: number, z: number) => { if (!k.length || t > k[k.length - 1][0] + 0.12) k.push([t, x, y, z]); };

  // apertura: in fondo al rotolo, poi corsa all'indietro fino al primo beat
  const primo = fermate[0];
  if (ap && doc.apertura && primo) {
    const larg = Math.max(...ap.blocchi.flat().map((p) => Math.abs(p.x) * 2 + p.w));
    let ya = (ap.top + ap.bot) / 2, za = zFit(larg, ap.bot - ap.top, 1.45);
    const fino = doc.apertura.fino, arrivo = primo.t;
    if (za < 1.15 && ap.blocchi.length > 1) {
      // gancio lungo (es. tre prodotti): la camera li visita uno per uno, ognuno sulla sua parola
      const bl = ap.blocchi.map((b) => ({ b, t: Math.max(0, Math.min(...b.map((p) => p.t))) })).sort((a, b) => a.t - b.t);
      bl.forEach((x, i) => {
        const y0 = Math.min(...x.b.map((p) => p.y - p.h / 2)), y1 = Math.max(...x.b.map((p) => p.y + p.h / 2));
        const zb = zFit(Math.max(...x.b.map((p) => Math.abs(p.x) * 2 + p.w)), y1 - y0 + 500);
        const via = bl[i + 1] ? bl[i + 1].t - 0.35 : fino - 0.2;
        add(i === 0 ? 0 : x.t, 0, (y0 + y1) / 2 + (i === 0 ? 40 : 0), zb * (i === 0 ? 1.06 : 1));
        if (via - x.t > 0.5) add(via, 0, (y0 + y1) / 2 - 30, zb * 1.02);
        ya = (y0 + y1) / 2; za = zb;
      });
    } else {
      add(0, 0, ya + 40, za * 1.08);
      add(Math.max(0.3, fino - 0.2), 0, ya - 20, za);
    }
    add(fino + 0.1, 0, ya - 250, za * 0.8);
    const durCorsa = arrivo - fino;
    add(fino + durCorsa * 0.45, 0, ya - (ya - primo.y) * 0.22, 0.3);
    add(fino + durCorsa * 0.85, 0, primo.y + (ya - primo.y) * 0.08, 0.3);
  } else if (primo) {
    add(0, primo.x, primo.y - 300, primo.z * 0.9);
  }

  fermate.forEach((f, i) => {
    const prossima = fermate[i + 1];
    const viaggio = prossima ? tra(0.45, 1.1, Math.hypot(prossima.x - f.x, prossima.y - f.y) / 2600) : 0;
    add(f.t + 0.1, f.x, f.y, f.z);
    const uscita = prossima ? Math.max(f.t + 0.35, f.via - viaggio) : f.via;
    if (uscita - f.t > 0.6) add(uscita, f.x, f.y + 60, f.z * 1.025);
    // salto lungo: a metà strada la camera si allontana un po'
    if (prossima) {
      const dy = Math.abs(prossima.y - f.y), dt = prossima.t - uscita;
      if (dy > 2200 && dt > 1.0) add(uscita + dt * 0.5, (f.x + prossima.x) / 2, (f.y + prossima.y) / 2, tra(0.3, 0.85, H / (dy * 1.1)));
    }
  });

  // finale: indietro fino a vedere tutto il rotolo
  if (doc.finale) {
    const ult = k[k.length - 1];
    const t0 = doc.finale.t, yc = altezza / 2;
    add(t0 + 0.05, ult[1], ult[2], ult[3]);
    add(t0 + 1.0, 0, (ult[2] + yc) / 2, 0.24);
    add(t0 + 2.4, 0, yc + 100, tra(0.08, 0.5, (0.95 * H) / altezza));
    add(doc.durata + 0.1, 0, yc, tra(0.08, 0.5, (0.9 * H) / altezza));
  } else {
    const ult = k[k.length - 1];
    add(doc.durata + 0.1, ult[1], ult[2] + 80, ult[3] * 1.03);
  }
  return k;
}

// ---------------------------------------------------------------- lastra del presentatore
const VALORE: Record<ModoLastra, number> = { intero: 1, meta: 0.5, nascosto: 0 };
export function modoBeat(doc: Documento, i: number): ModoLastra {
  const b = i < 0 ? doc.apertura : doc.beats[i];
  return b?.presentatore ?? (b && b.elementi.length ? 'meta' : 'intero');
}
// tratti [inizio, modo]: la lastra cambia 0,2 s prima della parola, in 0,45 s
export function trattiLastra(doc: Documento): [number, ModoLastra][] {
  const tr: [number, ModoLastra][] = [[0, doc.apertura ? modoBeat(doc, -1) : 'intero']];
  doc.beats.forEach((b, i) => tr.push([Math.max(0, b.t - 0.2), modoBeat(doc, i)]));
  if (doc.finale) tr.push([doc.finale.t, doc.finale.presentatore ?? 'intero']);
  return tr.sort((a, b) => a[0] - b[0]);
}
export const DUR_LASTRA = 0.45;
// quanto schermo occupa la lastra (0 = niente, 0,5 = metà in basso, 1 = tutto)
export function lastra(doc: Documento, t: number, tratti = trattiLastra(doc)): number {
  if (!doc.presentatore) return 0;
  let i = 0;
  while (i + 1 < tratti.length && tratti[i + 1][0] <= t) i++;
  const cur = VALORE[tratti[i][1]], prima = i > 0 ? VALORE[tratti[i - 1][1]] : cur;
  const k = Math.max(0, Math.min(1, (t - tratti[i][0]) / DUR_LASTRA));
  const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  return prima + (cur - prima) * e;
}

// interpolazione cubica monotona (Fritsch–Carlson): passa per ogni chiave senza rimbalzi
export function monotona(xs: number[], ys: number[]) {
  const n = xs.length;
  if (n === 1) return () => ys[0];
  const d = xs.slice(0, -1).map((x, i) => (ys[i + 1] - ys[i]) / (xs[i + 1] - x));
  const m = xs.map((_, i) => (i === 0 || i === n - 1 ? 0 : d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2));
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) { const q = 3 / Math.sqrt(s); m[i] = q * a * d[i]; m[i + 1] = q * b * d[i]; }
  }
  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

export function creaCamera(chiavi: Chiave[], colpi: number[]) {
  const ts = chiavi.map((c) => c[0]);
  const cx = monotona(ts, chiavi.map((c) => c[1]));
  const cy = monotona(ts, chiavi.map((c) => c[2]));
  const cz = monotona(ts, chiavi.map((c) => Math.log(c[3])));
  return (t: number) => {
    let x = cx(t), y = cy(t);
    const z = Math.exp(cz(t));
    const a = 5 / z; // camera a mano, in px di schermo
    x += a * (Math.sin(t * 0.83) + 0.6 * Math.sin(t * 1.91 + 1.3));
    y += a * (Math.sin(t * 0.71 + 2.1) + 0.6 * Math.sin(t * 1.57 + 0.4));
    let rot = 0.18 * Math.sin(t * 0.37) + 0.08 * Math.sin(t * 1.13 + 0.7);
    for (const c of colpi) {
      const q = t - c;
      if (q > 0 && q < 0.35) { const e = Math.exp(-q * 14) * Math.sin(q * 70); y += (14 / z) * e; rot += 0.25 * e; }
    }
    return { x, y, z, rot };
  };
}

// istanti dei timbri (la camera sobbalza)
export function colpiDi(p: Posato[], doc: Documento) {
  const c = p.filter((q) => q.el.tipo === 'timbro').map((q) => q.t + 0.12);
  p.forEach((q) => { if (q.el.timbroFinale) c.push(q.el.timbroFinale.t + 0.12); });
  if (doc.finale?.timbro) c.push(doc.finale.timbro.t + 0.12);
  return c;
}

// ---------------------------------------------------------------- suoni
// I nomi dei suoni sono le cartelle di "12 · Risorse/SFX — regista" (una cartella = un suono).
export const SUONI = {
  foto: '01 Carta/caduta foto', fruscio: '01 Carta/fruscio', leggera: '01 Carta/caduta leggera',
  carte: '02 Carte da gioco/schiocco', timbro: '03 Timbri e colpi/timbro', sordo: '03 Timbri e colpi/colpo sordo',
  pennello: '04 Scrittura/pennello', pennarello: '04 Scrittura/pennarello', matita: '04 Scrittura/matita',
  tasto: '04 Scrittura/macchina da scrivere tasto', whooshLento: '05 Movimento/whoosh lento', whooshVeloce: '05 Movimento/whoosh veloce',
  reverse: '05 Movimento/reverse', clic: '06 Meccanico/clic', ingranaggio: '06 Meccanico/ingranaggio', pop: '07 Digitale/pop',
  tick: '07 Digitale/tick contatore', hit: '08 Cinematico/hit', boom: '08 Cinematico/boom', subdrop: '08 Cinematico/sub drop',
  stanza: '09 Ambiente/stanza', musica: '10 Musica/giappone',
};

// mondo tech: stessi momenti, suoni digitali
export const SUONI_TECH: typeof SUONI = {
  ...SUONI,
  foto: '07 Digitale/pop', fruscio: '05 Movimento/swish corto', leggera: '07 Digitale/pop', carte: '07 Digitale/pop',
  timbro: '03 Timbri e colpi/impatto forte', sordo: '08 Cinematico/sub drop', pennello: '05 Movimento/swish corto',
  pennarello: '06 Meccanico/scatto', matita: '05 Movimento/riser', tasto: '07 Digitale/clic interfaccia', musica: '10 Musica/tech',
};
export const suoniDi = (doc: { mondo?: string }) => (doc.mondo === 'tech' ? SUONI_TECH : SUONI);

export const DUR_CADUTA = 0.6;
export const CPS = 28; // lettere al secondo della macchina da scrivere

function calcolaEventi(doc: Documento, posati: Posato[], camera: Chiave[]): Evento[] {
  const ev: Evento[] = [];
  const pan = (x: number) => tra(-0.5, 0.5, x / 1600);
  const S = suoniDi(doc);
  const tech = doc.mondo === 'tech';
  const ogniTasto = tech ? 3 : 1; // in tech un clic ogni 3 lettere, non una raffica
  for (const p of posati) {
    const { el, t } = p;
    const atterra = t + DUR_CADUTA * 0.42;
    switch (el.tipo) {
      case 'foto': case 'ritaglio':
        ev.push({ t: atterra, suono: S.foto, db: -5, pan: pan(p.x) }, { t: t - 0.05, suono: S.fruscio, db: -22, pan: pan(p.x) }); break;
      case 'carte':
        (el.files || []).forEach((_, i) => ev.push({ t: t + i * 0.3 + DUR_CADUTA * 0.4, suono: S.carte, db: -7, pan: pan(p.x + (i - 1) * 400) })); break;
      case 'timbro':
        ev.push({ t: t + 0.12, suono: S.timbro, db: el.grande ? -1 : tech ? -6 : -4 }, { t: t + 0.12, suono: S.sordo, db: -12 }); break;
      case 'anno': case 'titolo': case 'kanji':
        ev.push({ t, suono: S.pennello, db: -13, durata: (el.dur ?? 0.7) + 0.15 });
        if (el.tipo === 'kanji' && el.sotto) [...el.sotto].forEach((c, i) => { if (c !== ' ') ev.push({ t: t + 0.1 + i / CPS, suono: S.tasto, db: -17 }); });
        break;
      case 'macchina':
        [...(el.testo || '')].forEach((c, i) => { if (c !== ' ' && i % ogniTasto === 0) ev.push({ t: t + i / (tech ? 32 : CPS), suono: S.tasto, db: tech ? -20 : -17 }); }); break;
      case 'nome':
        ev.push({ t: t - 0.05, suono: S.fruscio, db: -24 }); break;
      case 'schede':
        (el.voci || []).forEach((v) => ev.push({ t: (v.t ?? t) + DUR_CADUTA * 0.42, suono: S.foto, db: -5 }, { t: v.t ?? t, suono: S.fruscio, db: -20 }));
        (el.croci || []).forEach((c) => ev.push({ t: c, suono: S.pennarello, db: -9, durata: 0.2, da: 0.1 }, { t: c + 0.12, suono: S.pennarello, db: -9, durata: 0.2, da: 0.5 }));
        if (el.timbroFinale) ev.push({ t: el.timbroFinale.t + 0.12, suono: S.timbro, db: -1 }, { t: el.timbroFinale.t + 0.12, suono: S.hit, db: -12 });
        break;
      case 'grafico': {
        const tc = el.tCambio ?? t + 2;
        ev.push({ t, suono: S.matita, db: -18, durata: Math.max(0.5, tc - t), da: 3 });
        if ((el.forma ?? 'crollo') === 'crollo') ev.push({ t: tc, suono: S.subdrop, db: -9 });
        break;
      }
      case 'contatore': ev.push({ t, suono: S.tick, db: -10, durata: 1.3 }); break;
      case 'schema':
        ev.push({ t, suono: S.matita, db: -16, durata: 0.9, da: 8 });
        for (let i = 0; i < 9; i++) ev.push({ t: t + 0.75 + i * 0.17, suono: S.clic, db: -12 });
        break;
      case 'cerchio': ev.push({ t, suono: S.pennarello, db: -8, durata: 0.55 }); break;
    }
  }
  // corse della camera: whoosh quando la velocità supera una soglia
  const cam = creaCamera(camera, []);
  let prima = cam(0), corsa = -10;
  for (let t = 0.05; t < doc.durata; t += 0.05) {
    const c = cam(t);
    const v = Math.hypot(c.x - prima.x, c.y - prima.y) * c.z / 0.05; // px di schermo al secondo
    if (v > 9000 && t - corsa > 2.2) { ev.push({ t: t - 0.25, suono: v > 30000 ? S.whooshVeloce : S.whooshLento, db: v > 30000 ? -6 : -10 }); corsa = t; }
    prima = c;
  }
  if (doc.presentatore) {
    const tr = trattiLastra(doc);
    for (let i = 1; i < tr.length; i++) if (tr[i][1] !== tr[i - 1][1]) ev.push({ t: tr[i][0], suono: S.fruscio, db: -14 });
  }
  if (doc.apertura) ev.push({ t: doc.apertura.fino - 0.05, suono: S.reverse, db: -8 });
  if (doc.beats[0]?.elementi[0]?.tipo === 'anno') ev.push({ t: doc.beats[0].elementi[0].t ?? doc.beats[0].t, suono: S.hit, db: -10 });
  if (doc.finale) {
    ev.push({ t: doc.finale.t, suono: S.whooshLento, db: -7 });
    if (doc.finale.righe[0]) ev.push({ t: doc.finale.righe[0].t - 0.05, suono: S.boom, db: -7 });
    if (doc.finale.timbro) ev.push({ t: doc.finale.timbro.t, suono: S.timbro, db: -3 }, { t: doc.finale.timbro.t, suono: S.subdrop, db: -10 });
  }
  return ev.sort((a, b) => a.t - b.t);
}
