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
  // con pochi secondi in comune (clip corte) una coincidenza è facile: serve un picco molto più netto
  const comune = (Math.min(a.length, b.length - k) - Math.max(0, -k)) * HOP;
  const affidabile = comune >= 10 ? best >= 0.2 && spicco >= 1.4 : comune >= 4 && best >= 0.35 && spicco >= 2;
  return { offset: +(k * HOP).toFixed(3), punteggio: +best.toFixed(3), spicco: +spicco.toFixed(2), affidabile };
}

// ---------- frasi ----------
// I tagli si fanno SOLO nelle pause vere dell'audio. Prima le frasi nascevano dai
// confini tra le parole di Whisper (tempi sbagliati di qualche decimo): su Wave3 e
// Cuffie p30i il 30–40% dei bordi cadeva in mezzo al parlato e, saltando o
// riordinando le frasi, le parole restavano mozzate. Nel parlato di Denis ci sono
// ~60 pause ≥ 100 ms al minuto: bastano per frasi da 1,5–5 s che finiscono sempre in una pausa.
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

// tratti sotto soglia lunghi almeno `min` s (un picco fino a 30 ms, es. un click, non interrompe la pausa)
function trovaPause(db, soglia, min) {
  const out = [], toll = Math.round(0.03 / HOP);
  let a = -1, ultimo = -1;
  for (let i = 0; i <= db.length; i++) {
    const sil = i < db.length && db[i] <= soglia;
    if (sil) { if (a < 0) a = i; ultimo = i; continue; }
    if (a >= 0 && (i === db.length || i - ultimo > toll)) {
      if ((ultimo - a + 1) * HOP >= min) out.push({ da: a * HOP, a: (ultimo + 1) * HOP });
      a = -1;
    }
  }
  return out;
}

const finePeriodo = (testo) => /[.!?…]$/.test(testo);

// parole: [{w, s, e}] nel tempo dell'audio principale. Restituisce frasi di circa
// 1,5–5 s con inizio/fine del taglio (dentro le pause, con un respiro) e testo.
// pausaMax: oltre questa pausa una frase non continua (0,8 s; nella modalità discorso 0,5 s, così i
// silenzi tra un pensiero e l'altro escono dal video)
export function frasi(parole, db, durata, { maxDur = 5, minDur = 1.2, pausaMin = 0.1, pausaMax = 0.8 } = {}) {
  if (!parole.length) return [];
  const { fondo, voce } = sogliaVoce(db);
  const soglia = fondo + (voce - fondo) * 0.35;
  const w = parole.map((p) => ({ w: String(p.w).trim(), s: p.s, e: Math.max(p.e, p.s + 0.05) })).filter((x) => x.w);

  // 1) gruppi di voce tra due pause vere (ai bordi del file una "pausa" infinita)
  const pause = [{ da: -Infinity, a: 0 }, ...trovaPause(db, soglia, pausaMin), { da: durata, a: Infinity }];
  let gruppi = [];
  for (let k = 0; k < pause.length - 1; k++) {
    const da = Math.max(0, pause[k].a), a = Math.min(durata, pause[k + 1].da);
    if (a - da >= 0.05) gruppi.push({ da, a, prima: pause[k], dopo: pause[k + 1], parole: [] });
  }
  // 2) parole nei gruppi secondo l'inizio (Whisper a volte anticipa di poco: 0,25 s di tolleranza);
  //    una parola che cade in una pausa lunga va al gruppo più vicino, se non è troppo lontano
  for (const p of w) {
    let g = gruppi.find((x) => p.s >= x.da - 0.25 && p.s < x.a);
    if (!g) {
      const vicino = gruppi.reduce((m, x) => { const d = Math.min(Math.abs(p.s - x.da), Math.abs(p.s - x.a)); return d < m.d ? { d, x } : m; }, { d: Infinity, x: null });
      if (vicino.d <= 0.6) g = vicino.x;
    }
    if (g) g.parole.push(p);
  }
  // gruppi senza parole che iniziano lì ma dentro la durata di una parola di Whisper: è la fine di
  // quella parola o la parola dopo con il tempo sbagliato (AI, 26/10: "ufficio che" tenuto 0,36 s,
  // il "che" vero 1 s dopo in un gruppo "vuoto" buttato via → parole mozzate o sparite). Si uniscono
  // al gruppo prima se la pausa è breve, sennò a quello dopo
  // Se è staccato da tutti e due, resta un gruppo suo e si porta dietro la parola che lo copre di più
  const dentro = (p, g) => Math.min(p.e, g.a) - Math.max(p.s, g.da);
  for (let k = 0; k < gruppi.length; k++) {
    const g = gruppi[k];
    if (g.parole.length) continue;
    const coprenti = w.filter((p) => dentro(p, g) > 0.05);
    if (!coprenti.length) continue;
    const prima = gruppi[k - 1], dopo = gruppi[k + 1];
    if (prima?.parole.length && g.da - prima.a <= pausaMax) { prima.a = g.a; prima.dopo = g.dopo; gruppi.splice(k--, 1); continue; }
    if (dopo && dopo.da - g.a <= pausaMax) { dopo.da = g.da; dopo.prima = g.prima; gruppi.splice(k--, 1); continue; }
    const p = coprenti.reduce((m, x) => (dentro(x, g) > dentro(m, g) ? x : m));
    const casa = gruppi.find((x) => x.parole.includes(p));
    if (casa && casa.parole.length > 1 && dentro(p, g) > dentro(p, casa)) { casa.parole = casa.parole.filter((x) => x !== p); g.parole = [p]; }
    else g.voce = true; // la parola resta dov'è (non si ripete nel testo), ma l'audio si tiene
  }
  // gruppi senza parole: rumore (mani, oggetti), respiri, "ehm" → fuori
  gruppi = gruppi.filter((g) => g.parole.length || g.voce);
  // 3) un gruppo lunghissimo senza pause (raro): si divide sul punto più silenzioso tra due parole
  const spezza = (g) => {
    if (g.a - g.da <= 8 || g.parole.length < 4) return [g];
    let best = null;
    for (let i = 1; i < g.parole.length - 1; i++) {
      const lo = Math.min(g.parole[i - 1].e, g.parole[i].s), hi = Math.max(g.parole[i - 1].e, g.parole[i].s);
      const pt = puntoSilenzio(db, lo - 0.15, hi + 0.15);
      if (pt.t > g.da + 1 && pt.t < g.a - 1 && (!best || pt.db < best.db)) best = { ...pt, i };
    }
    if (!best) return [g];
    const taglio = { da: best.t, a: best.t };
    return [...spezza({ da: g.da, a: best.t, prima: g.prima, dopo: taglio, parole: g.parole.slice(0, best.i) }),
      ...spezza({ da: best.t, a: g.a, prima: taglio, dopo: g.dopo, parole: g.parole.slice(best.i) })];
  };
  gruppi = gruppi.flatMap(spezza);

  // 4) gruppi uniti in frasi scegliendo i punti di taglio migliori (programmazione dinamica):
  //    conviene tagliare su pause lunghe e a fine periodo, frasi intorno ai 3 s, oltre maxDur si
  //    paga caro; mai unire attraverso una pausa > pausaMax (resterebbero secondi di vuoto nella frase)
  const n = gruppi.length;
  const pausaDopo = gruppi.map((g, j) => (j < n - 1 ? gruppi[j + 1].da - g.a : Infinity));
  const costoConfine = (j) => {
    if (j === n - 1) return 0;
    const ultima = gruppi[j].parole[gruppi[j].parole.length - 1]?.w || '';
    const forza = Math.min(1, pausaDopo[j] / 0.4) + (finePeriodo(ultima) ? 0.7 : /[,;:]$/.test(ultima) ? 0.3 : 0);
    return 2.5 * Math.max(0, 1 - forza);
  };
  const costoFrase = (i, j) => {
    for (let k = i; k < j; k++) if (pausaDopo[k] > pausaMax) return Infinity;
    const d = gruppi[j].a - gruppi[i].da;
    if (d > 9 && i < j) return Infinity;
    return 0.15 * (d - 3) ** 2 + (d > maxDur ? 4 * (d - maxDur) : 0) + (d < minDur ? 1.5 * (minDur - d) : 0);
  };
  const best = new Float64Array(n + 1).fill(Infinity), da = new Int32Array(n + 1);
  best[0] = 0;
  for (let j = 0; j < n; j++) {
    for (let i = j; i >= 0; i--) {
      const c = best[i] + costoFrase(i, j) + costoConfine(j);
      if (c < best[j + 1]) { best[j + 1] = c; da[j + 1] = i; }
      if (gruppi[j].a - gruppi[i].da > 9) break;
    }
  }
  const unite = [];
  for (let j = n; j > 0; j = da[j]) unite.unshift(gruppi.slice(da[j], j));

  // 5) bordi: un respiro dentro la pausa (attacco 0,1 s, coda 0,15 s), mai oltre metà pausa.
  //    Niente strette verso i tempi di Whisper: sbagliano proprio ai bordi e tornerebbero a mozzare le parole.
  return unite.map((gr, k) => {
    const primo = gr[0], ultimo = gr[gr.length - 1];
    const inizio = Math.max(0, primo.da - Math.min(0.1, (primo.prima.a - primo.prima.da) / 2));
    // coda 0,2 s: le finali sussurrate di Denis stanno sotto la soglia della voce
    const fine = Math.min(durata, ultimo.a + Math.min(0.2, (ultimo.dopo.a - ultimo.dopo.da) / 2));
    return {
      id: `F${String(k + 1).padStart(3, '0')}`,
      inizio: +inizio.toFixed(3), fine: +fine.toFixed(3),
      testo: gr.flatMap((g) => g.parole.map((x) => x.w)).join(' '),
    };
  });
}
