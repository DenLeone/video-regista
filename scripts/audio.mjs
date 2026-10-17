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

// Caratteristica robusta a microfoni diversi: energia (o movimento) meno la sua
// media mobile su 1 s (conta il "ritmo", non il livello assoluto), normalizzata.
// `alSecondo` = campioni al secondo (200 per l'inviluppo a 5 ms, 30 per i fotogrammi).
export function normalizza(v, alSecondo = 1 / HOP) {
  const n = v.length, w = Math.round(0.5 * alSecondo);
  const pref = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) pref[i + 1] = pref[i] + v[i];
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - w), b = Math.min(n, i + w + 1);
    x[i] = Math.max(-20, Math.min(20, v[i] - (pref[b] - pref[a]) / (b - a)));
  }
  let m = 0; for (const val of x) m += val; m /= n;
  let s = 0; for (let i = 0; i < n; i++) { x[i] -= m; s += x[i] * x[i]; }
  s = Math.sqrt(s / n) || 1;
  for (let i = 0; i < n; i++) x[i] /= s;
  return x;
}

// Correlazione di b rispetto ad a per ogni spostamento k (b[t+k] allineato con a[t]),
// media sulla parte sovrapposta. valori[k + a.length - 1]; -Infinity se si sovrappongono troppo poco.
export function correlazione(a, b, minSovrapp) {
  let n = 1; while (n < a.length + b.length) n <<= 1;
  const ar = new Float64Array(n), ai = new Float64Array(n), br = new Float64Array(n), bi = new Float64Array(n);
  ar.set(a); br.set(b);
  fft(ar, ai); fft(br, bi);
  for (let i = 0; i < n; i++) { // conj(A) * B
    const r = ar[i] * br[i] + ai[i] * bi[i], im = ar[i] * bi[i] - ai[i] * br[i];
    ar[i] = r; ai[i] = im;
  }
  fft(ar, ai, true);
  const valori = new Float64Array(a.length + b.length - 1);
  for (let k = -(a.length - 1); k < b.length; k++) {
    const sovrapp = Math.min(a.length, b.length - k) - Math.max(0, -k);
    valori[k + a.length - 1] = sovrapp < minSovrapp ? -Infinity : ar[(k + n) % n] / sovrapp;
  }
  return valori;
}

// L'audio di questa camera è solo fruscio o silenzio? (microfono esterno spento,
// audio disattivato): inutile per sincronizzare, serve la sincronizzazione visiva.
export const audioMuto = (db) => { const { fondo, voce } = sogliaVoce(db); return voce < -55 || voce - fondo < 8; };

// Dove sta "altro" rispetto a "principale"? Restituisce offset in secondi
// (tempo in altro = tempo in principale + offset) e un punteggio 0..1.
// Le registrazioni devono sovrapporsi per almeno il 40% della più corta (min 10 s):
// con sovrapposizioni di pochi secondi una coincidenza casuale vinceva sul vero allineamento.
export function sincronizza(dbPrincipale, dbAltro) {
  const a = normalizza(dbPrincipale), b = normalizza(dbAltro);
  const corta = Math.min(a.length, b.length);
  const v = correlazione(a, b, Math.min(corta, Math.max(Math.round(10 / HOP), Math.floor(corta * 0.4))));
  let best = -Infinity, bestI = 0;
  for (let i = 0; i < v.length; i++) if (v[i] > best) { best = v[i]; bestI = i; }
  // secondo picco lontano almeno 1 s: misura quanto il primo "spicca"
  const lontano = Math.round(1 / HOP);
  let secondo = -Infinity;
  for (let i = 0; i < v.length; i++) if (Math.abs(i - bestI) > lontano && v[i] > secondo) secondo = v[i];
  const spicco = secondo > 0 ? best / secondo : (best > 0 ? 10 : 0);
  const k = bestI - (a.length - 1);
  return { offset: +(k * HOP).toFixed(3), punteggio: +best.toFixed(3), spicco: +spicco.toFixed(2), affidabile: best >= 0.2 && spicco >= 1.4 };
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

// la pausa più lunga sotto soglia dentro [t0, t1] (ignora picchi brevi fino a 120 ms), se dura almeno `min` s
function silenzioInterno(db, t0, t1, soglia, min) {
  const n = db.length, a = t2i(t0, n), b = t2i(t1, n), tolleranza = Math.round(0.12 / HOP);
  let best = null, inizio = -1, ultimoSilenzio = -1;
  const chiudi = () => {
    if (inizio >= 0 && (ultimoSilenzio - inizio + 1) * HOP >= min && (!best || ultimoSilenzio - inizio > best.b - best.a)) best = { a: inizio, b: ultimoSilenzio };
  };
  for (let i = a; i <= b; i++) {
    if (db[i] <= soglia) { if (inizio < 0) inizio = i; ultimoSilenzio = i; }
    else if (inizio >= 0 && i - ultimoSilenzio > tolleranza) { chiudi(); inizio = -1; }
  }
  chiudi();
  return best ? { da: best.a * HOP, a: (best.b + 1) * HOP } : null;
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
  // unisci i pezzetti troppo corti al vicino col confine più debole, ma mai attraverso
  // una pausa lunga: "Queste sono… (7 s di mani sul tavolo) …queste sono le Anker"
  // diventava una frase di 10 s; la falsa partenza resta da sola e l'AI la scarta
  const pausaTra = (g, h) => w[h[0]].s - w[g[1]].e;
  for (let i = 0; i < gruppi.length; i++) {
    if (gruppi.length < 2 || dur(gruppi[i]) >= minDur) continue;
    const okPrima = i > 0 && pausaTra(gruppi[i - 1], gruppi[i]) < 1;
    const okDopo = i < gruppi.length - 1 && pausaTra(gruppi[i], gruppi[i + 1]) < 1;
    if (!okPrima && !okDopo) continue;
    const forzaPrima = okPrima ? confini[gruppi[i - 1][1]].forza : Infinity;
    const forzaDopo = okDopo ? confini[gruppi[i][1]].forza : Infinity;
    if (forzaPrima <= forzaDopo) { gruppi[i - 1][1] = gruppi[i][1]; gruppi.splice(i, 1); }
    else { gruppi[i + 1][0] = gruppi[i][0]; gruppi.splice(i, 1); }
    i--;
  }

  const costruisci = ([a, b]) => {
    let taglioIn = a === 0 ? puntoSilenzio(db, Math.max(0, w[0].s - 0.4), w[0].s).t : confini[a - 1].t;
    let taglioOut = b === w.length - 1 ? puntoSilenzio(db, w[b].e, Math.min(durata, w[b].e + 0.5)).t : confini[b].t;
    // dopo una pausa lunga il punto più silenzioso può stare secondi prima della prima parola
    // e i rumori (mani, prodotto) sembrano voce: il taglio resta vicino alle parole
    if (taglioIn < w[a].s - 0.45) taglioIn = puntoSilenzio(db, Math.max(a > 0 ? w[a - 1].e : 0, w[a].s - 0.45), w[a].s).t;
    if (taglioOut > w[b].e + 0.5) taglioOut = puntoSilenzio(db, w[b].e, Math.min(b < w.length - 1 ? w[b + 1].s : durata, w[b].e + 0.5)).t;
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
    if (Math.min(gapPrima, gapDopo) > 1) continue; // isolato: resta com'è
    const j = gapPrima <= gapDopo ? i - 1 : i + 1;
    const unito = costruisci([Math.min(out[i].a, out[j].a), Math.max(out[i].b, out[j].b)]);
    out.splice(Math.min(i, j), 2, unito);
    i = Math.max(-1, Math.min(i, j) - 1);
  }
  // silenzi lunghi DENTRO una frase (Whisper "stira" una parola sopra una pausa:
  // "in-ear" lunga 3 s di cui 2 di silenzio): la frase si divide lì e la pausa sparisce
  const divise = [];
  const coda = [...out];
  while (coda.length) {
    const f = coda.shift();
    const run = silenzioInterno(db, f.inizio + 0.15, f.fine - 0.15, soglia, 0.7);
    if (!run) { divise.push(f); continue; }
    const meta = (run.da + run.a) / 2;
    let k = f.a - 1;
    while (k < f.b && w[k + 1].s < meta) k++;
    // un pezzo senza parole è rumore (mani, oggetti) o un "ehm": si scarta
    const pezzi = [{ a: f.a, b: k, inizio: f.inizio, fine: run.da + 0.1 }, { a: k + 1, b: f.b, inizio: run.a - 0.06, fine: f.fine }];
    coda.unshift(...pezzi.filter((x) => x.b >= x.a && x.fine - x.inizio >= 0.3));
  }
  out = divise;
  return out.map((f, k) => ({
    id: `F${String(k + 1).padStart(3, '0')}`,
    inizio: +f.inizio.toFixed(3), fine: +f.fine.toFixed(3),
    testo: w.slice(f.a, f.b + 1).map((x) => x.w).join(' '),
  }));
}
