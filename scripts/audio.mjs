// Analisi audio senza dipendenze: inviluppo di energia, sincronizzazione tra
// camere (correlazione via FFT) e divisione del parlato in frasi con i tagli
// agganciati ai silenzi veri. I tempi parola di Whisper sono spesso sbagliati
// di qualche decimo (parole accavallate o lunghe 2-3 s): da soli tagliano a
// metà parola, quindi qui vengono sempre corretti con l'audio.

import { execFileSync } from 'node:child_process';

export const HOP = 0.005; // un valore di inviluppo ogni 5 ms
const SR = 16000;
const N_HOP = Math.round(SR * HOP);

// ---------- inviluppo ----------
export function inviluppo(file) {
  let pcm;
  try {
    pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-map', '0:a:0', '-ac', '1', '-ar', String(SR), '-f', 's16le', '-'],
      { maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch { return null; } // nessuna traccia audio
  const n = Math.floor(pcm.length / 2 / N_HOP);
  if (n < 10) return null;
  const db = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < N_HOP; j++) { const v = pcm.readInt16LE((i * N_HOP + j) * 2) / 32768; s += v * v; }
    db[i] = 10 * Math.log10(s / N_HOP + 1e-10);
  }
  return db;
}

const percentile = (arr, p) => { const a = Float32Array.from(arr).sort(); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };

// soglia "c'è voce": un terzo della distanza tra rumore di fondo e parlato
export function sogliaVoce(db) {
  const fondo = percentile(db, 0.1), voce = percentile(db, 0.95);
  return { fondo, voce, soglia: fondo + (voce - fondo) * 0.3, haVoce: voce - fondo > 15 && voce > -45 };
}

// ---------- FFT (radix 2, sul posto) ----------
function fft(re, im, inversa = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (2 * Math.PI / len) * (inversa ? 1 : -1);
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const a = i + j, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
  if (inversa) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

// Caratteristica robusta a microfoni diversi: energia in dB meno la sua media
// mobile su 1 s (conta il "ritmo" del suono, non il volume assoluto).
function caratteristica(db) {
  const n = db.length, w = Math.round(0.5 / HOP);
  const pref = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) pref[i + 1] = pref[i] + db[i];
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - w), b = Math.min(n, i + w + 1);
    x[i] = Math.max(-20, Math.min(20, db[i] - (pref[b] - pref[a]) / (b - a)));
  }
  let m = 0; for (const v of x) m += v; m /= n;
  let s = 0; for (let i = 0; i < n; i++) { x[i] -= m; s += x[i] * x[i]; }
  s = Math.sqrt(s / n) || 1;
  for (let i = 0; i < n; i++) x[i] /= s;
  return x;
}

// Dove sta "altro" rispetto a "principale"? Restituisce offset in secondi
// (tempo in altro = tempo in principale + offset) e un punteggio 0..1.
export function sincronizza(dbPrincipale, dbAltro) {
  const a = caratteristica(dbPrincipale), b = caratteristica(dbAltro);
  let n = 1; while (n < a.length + b.length) n <<= 1;
  const ar = new Float64Array(n), ai = new Float64Array(n), br = new Float64Array(n), bi = new Float64Array(n);
  ar.set(a); br.set(b);
  fft(ar, ai); fft(br, bi);
  for (let i = 0; i < n; i++) { // conj(A) * B
    const r = ar[i] * br[i] + ai[i] * bi[i], im = ar[i] * bi[i] - ai[i] * br[i];
    ar[i] = r; ai[i] = im;
  }
  fft(ar, ai, true);
  const minSovrapp = Math.min(Math.round(10 / HOP), Math.floor(Math.min(a.length, b.length) * 0.5));
  // lag k: b[t+k] allineato con a[t]
  const punteggio = (k) => {
    const sovrapp = Math.min(a.length, b.length - k) - Math.max(0, -k);
    if (sovrapp < minSovrapp) return -Infinity;
    return ar[(k + n) % n] / sovrapp;
  };
  let best = -Infinity, bestK = 0;
  for (let k = -(a.length - 1); k < b.length; k++) { const p = punteggio(k); if (p > best) { best = p; bestK = k; } }
  // secondo picco lontano almeno 1 s: misura quanto il primo "spicca"
  const lontano = Math.round(1 / HOP);
  let secondo = -Infinity;
  for (let k = -(a.length - 1); k < b.length; k++) if (Math.abs(k - bestK) > lontano) { const p = punteggio(k); if (p > secondo) secondo = p; }
  const spicco = secondo > 0 ? best / secondo : (best > 0 ? 10 : 0);
  return { offset: +(bestK * HOP).toFixed(3), punteggio: +best.toFixed(3), spicco: +spicco.toFixed(2), affidabile: best >= 0.2 && spicco >= 1.4 };
}

// ---------- frasi ----------
const t2i = (t, n) => Math.max(0, Math.min(n - 1, Math.round(t / HOP)));

// punto più silenzioso in [t0, t1] (media su 40 ms)
function puntoSilenzio(db, t0, t1) {
  const n = db.length, w = 4;
  let a = t2i(Math.min(t0, t1), n), b = t2i(Math.max(t0, t1), n);
  if (b - a < 1) b = Math.min(n - 1, a + 1);
  let best = Infinity, bestI = a;
  for (let i = a; i <= b; i++) {
    let s = 0, c = 0;
    for (let j = Math.max(0, i - w); j <= Math.min(n - 1, i + w); j++) { s += db[j]; c++; }
    if (s / c < best) { best = s / c; bestI = i; }
  }
  return { t: bestI * HOP, db: best };
}

// quanto silenzio continuo (sotto soglia) c'è intorno a t
function durataSilenzio(db, t, soglia) {
  const n = db.length; const i0 = t2i(t, n);
  if (db[i0] > soglia) return 0;
  let a = i0, b = i0;
  while (a > 0 && db[a - 1] <= soglia) a--;
  while (b < n - 1 && db[b + 1] <= soglia) b++;
  return (b - a + 1) * HOP;
}

// inizio/fine reali della voce dentro [t0, t1]
function confiniVoce(db, t0, t1, soglia) {
  const n = db.length; const a = t2i(t0, n), b = t2i(t1, n), min = 6; // 30 ms sopra soglia
  let inizio = null, fine = null;
  for (let i = a, c = 0; i <= b; i++) { c = db[i] > soglia ? c + 1 : 0; if (c >= min) { inizio = (i - min + 1) * HOP; break; } }
  for (let i = b, c = 0; i >= a; i--) { c = db[i] > soglia ? c + 1 : 0; if (c >= min) { fine = (i + min) * HOP; break; } }
  return inizio != null && fine != null && fine > inizio ? { inizio, fine } : null;
}

const fineFrase = (w) => /[.!?…]$/.test(w) ? 2 : /[,;:]$/.test(w) ? 1 : 0;

// parole: [{w, s, e}] nel tempo dell'audio principale. Restituisce frasi brevi
// (circa 0,8–4 s) con: inizio/fine del taglio, testo, parole.
export function frasi(parole, db, durata, { maxDur = 4, minDur = 0.7 } = {}) {
  if (!parole.length) return [];
  const { soglia } = sogliaVoce(db);
  const w = parole.map((p) => ({ w: String(p.w).trim(), s: p.s, e: Math.max(p.e, p.s + 0.05) }));

  // confine tra parola i e i+1: punto di taglio nel silenzio e quanto è "forte"
  const confini = [];
  for (let i = 0; i < w.length - 1; i++) {
    const lo = Math.min(w[i].e, w[i + 1].s), hi = Math.max(w[i].e, w[i + 1].s);
    const p = puntoSilenzio(db, lo - 0.15, hi + 0.15);
    const sil = durataSilenzio(db, p.t, soglia);
    const pausa = Math.max(0, w[i + 1].s - w[i].e);
    confini.push({ i, t: p.t, forza: fineFrase(w[i].w) + Math.min(3, sil * 8) + Math.min(2, pausa * 4), silenzio: sil });
  }

  // 1) spezza sui confini forti; 2) spezza ancora le frasi troppo lunghe sul confine migliore
  let gruppi = [[0, w.length - 1]];
  const dentro = (a, b) => confini.filter((c) => c.i >= a && c.i < b);
  gruppi = gruppi.flatMap(([a, b]) => {
    const tagli = dentro(a, b).filter((c) => c.forza >= 3 && c.silenzio >= 0.08).map((c) => c.i);
    const out = []; let s = a;
    for (const t of tagli) { out.push([s, t]); s = t + 1; }
    out.push([s, b]);
    return out;
  });
  const dur = ([a, b]) => w[b].e - w[a].s;
  for (let giro = 0; giro < 20; giro++) {
    let cambiato = false;
    gruppi = gruppi.flatMap((g) => {
      if (dur(g) <= maxDur || g[1] - g[0] < 3) return [g];
      const cand = dentro(g[0] + 1, g[1] - 1); // almeno 2 parole per parte
      if (!cand.length) return [g];
      const c = cand.reduce((x, y) => (y.forza > x.forza ? y : x));
      cambiato = true;
      return [[g[0], c.i], [c.i + 1, g[1]]];
    });
    if (!cambiato) break;
  }
  // unisci i pezzetti troppo corti al vicino col confine più debole
  for (let i = 0; i < gruppi.length; i++) {
    if (gruppi.length < 2 || dur(gruppi[i]) >= minDur) continue;
    const forzaPrima = i > 0 ? confini[gruppi[i - 1][1]].forza : Infinity;
    const forzaDopo = i < gruppi.length - 1 ? confini[gruppi[i][1]].forza : Infinity;
    if (forzaPrima <= forzaDopo) { gruppi[i - 1][1] = gruppi[i][1]; gruppi.splice(i, 1); }
    else { gruppi[i + 1][0] = gruppi[i][0]; gruppi.splice(i, 1); }
    i--;
  }

  const costruisci = ([a, b]) => {
    const taglioIn = a === 0 ? puntoSilenzio(db, Math.max(0, w[0].s - 0.4), w[0].s).t : confini[a - 1].t;
    const taglioOut = b === w.length - 1 ? puntoSilenzio(db, w[b].e, Math.min(durata, w[b].e + 0.5)).t : confini[b].t;
    // tolgo i silenzi lunghi ai bordi lasciando un piccolo respiro
    const v = confiniVoce(db, taglioIn, taglioOut, soglia);
    const inizio = v ? Math.max(taglioIn, v.inizio - 0.06) : taglioIn;
    const fine = v ? Math.min(taglioOut, v.fine + 0.1) : taglioOut;
    return { a, b, inizio, fine: Math.max(fine, inizio + 0.2) };
  };
  let out = gruppi.map(costruisci);
  // frammenti sotto mezzo secondo (misurati sull'audio vero): uniti al vicino più attaccato
  for (let i = 0; i < out.length && out.length > 1; i++) {
    if (out[i].fine - out[i].inizio >= 0.45) continue;
    const gapPrima = i > 0 ? out[i].inizio - out[i - 1].fine : Infinity;
    const gapDopo = i < out.length - 1 ? out[i + 1].inizio - out[i].fine : Infinity;
    const j = gapPrima <= gapDopo ? i - 1 : i + 1;
    const unito = costruisci([Math.min(out[i].a, out[j].a), Math.max(out[i].b, out[j].b)]);
    out.splice(Math.min(i, j), 2, unito);
    i = Math.max(-1, Math.min(i, j) - 1);
  }
  return out.map((f, k) => ({
    id: `F${String(k + 1).padStart(3, '0')}`,
    inizio: +f.inizio.toFixed(3), fine: +f.fine.toFixed(3),
    testo: w.slice(f.a, f.b + 1).map((x) => x.w).join(' '),
  }));
}
