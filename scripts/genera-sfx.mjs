// Effetti sonori degli stili, sintetizzati da zero (nessun file scaricato:
// niente diritti, sempre uguali, ritoccabili qui). Uscita: public/sfx/*.wav
// (48 kHz mono, picco −3 dBFS). Il volume finale lo decide il montaggio in base
// al livello della voce. Uso: node scripts/genera-sfx.mjs
//
// riser       apertura: sale metallico durante la tavola iniziale e chiude con uno "shing"
// ui_in       parola chiave che compare: blip digitale veloce
// ui_conferma parola chiave piena (sponsor, esito): due toni di conferma
// glitch      flicker sui tagli: crepitio che segue il lampeggio fotogramma per fotogramma
// strappo     flicker con la carta strappata: strappo di carta
// whoosh      (Cinematico) titolo che entra: soffio d'aria morbido, picco a 0,3 s
// impatto     (Cinematico) primo titolo: colpo basso profondo con coda, da trailer

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 48000;
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sfx');
const FPS = 30;

// rumore deterministico (stesso suono a ogni generazione)
let seme = 12345;
const rnd = () => ((seme = (seme * 1103515245 + 12345) % 2147483648) / 2147483648) * 2 - 1;

// filtro passa-banda (biquad RBJ) con frequenza che può cambiare nel tempo
function passaBanda(x, freq, q = 1.2) {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const f = typeof freq === 'function' ? freq(i / SR) : freq;
    const w = (2 * Math.PI * Math.min(f, SR * 0.45)) / SR, alpha = Math.sin(w) / (2 * q), a0 = 1 + alpha;
    const b0 = alpha / a0, b2 = -alpha / a0, a1 = (-2 * Math.cos(w)) / a0, a2 = (1 - alpha) / a0;
    const v = b0 * x[i] + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

// riverbero leggero (4 comb + 2 all-pass, Schroeder): dà "spazio" e brillantezza metallica
function riverbero(x, mix = 0.25, coda = 0.75) {
  const out = Float32Array.from(x);
  const combs = [1557, 1617, 1491, 1422].map((d) => ({ d, b: new Float32Array(d), i: 0 }));
  const aps = [225, 556].map((d) => ({ d, b: new Float32Array(d), i: 0 }));
  for (let n = 0; n < x.length; n++) {
    let s = 0;
    for (const c of combs) { const v = c.b[c.i]; c.b[c.i] = x[n] + v * coda; c.i = (c.i + 1) % c.d; s += v; }
    s /= combs.length;
    for (const a of aps) { const v = a.b[a.i]; const u = s + v * 0.5; a.b[a.i] = u; a.i = (a.i + 1) % a.d; s = v - u * 0.5; }
    out[n] = x[n] * (1 - mix) + s * mix * 2;
  }
  return out;
}

const vuoto = (sec) => new Float32Array(Math.round(sec * SR));
const somma = (dst, src, da = 0, g = 1) => { const o = Math.round(da * SR); for (let i = 0; i < src.length && o + i < dst.length; i++) dst[o + i] += src[i] * g; return dst; };

// sinusoide con frequenza che cambia nel tempo (fase integrata) e inviluppo
function tono(sec, freq, inv) {
  const y = vuoto(sec); let fase = 0;
  for (let i = 0; i < y.length; i++) {
    const t = i / SR;
    fase += (2 * Math.PI * (typeof freq === 'function' ? freq(t) : freq)) / SR;
    y[i] = Math.sin(fase) * inv(t);
  }
  return y;
}

// colpo metallico: parziali inarmoniche (rapporti da campana) che decadono a velocità diverse
function metallo(sec, base, decad = 0.5) {
  const y = vuoto(sec);
  [[1, 1], [2.76, 0.6], [5.4, 0.35], [8.93, 0.2], [13.34, 0.12]].forEach(([r, a], k) => {
    somma(y, tono(sec, base * r, (t) => a * Math.exp(-t / (decad / (1 + k * 0.6))) * Math.min(1, t / 0.002)));
  });
  return y;
}

function riser() {
  const T = 1.6, picco = 0.34; // lo "shing" cade quando la tavola iniziale sparisce (fotogramma 10)
  const y = vuoto(T);
  // salita: rumore filtrato con la banda che sale + glissando metallico (ring modulation)
  const sale = (t) => (t < picco ? (t / picco) ** 2 : 0);
  const n = new Float32Array(Math.round(picco * SR) + 200).map(() => rnd());
  somma(y, passaBanda(n, (t) => 500 * 12 ** Math.min(1, t / picco), 3).map((v, i) => v * sale(i / SR) * 0.9));
  somma(y, tono(picco + 0.01, (t) => 220 * 8 ** Math.min(1, t / picco), sale).map((v, i) => v * Math.sin((2 * Math.PI * 1370 * i) / SR) * 0.35));
  // arrivo: shing metallico + colpo basso morbido
  somma(y, metallo(T - picco, 1180, 0.55), picco, 0.55);
  somma(y, tono(0.35, (t) => 70 - 30 * t, (t) => Math.exp(-t / 0.08) * Math.min(1, t / 0.004)), picco, 0.6);
  return riverbero(y, 0.3, 0.8);
}

function uiIn() {
  const y = vuoto(0.32);
  // chirp in salita + secondo blip più acuto, timbro "digitale" (un filo di onda quadra)
  const quadra = (f, inv) => tono(0.07, f, inv).map((v) => Math.tanh(v * 2.2) * 0.8);
  somma(y, quadra((t) => 700 + 2600 * (t / 0.06), (t) => Math.min(1, t / 0.003) * Math.exp(-t / 0.035)), 0, 0.7);
  somma(y, quadra(2350, (t) => Math.min(1, t / 0.002) * Math.exp(-t / 0.025)), 0.075, 0.45);
  // micro click di "dati"
  const n = new Float32Array(Math.round(0.012 * SR)).map((_, i) => rnd() * Math.exp(-i / (SR * 0.003)));
  somma(y, passaBanda(n, 5200, 2), 0.13, 0.5);
  return riverbero(y, 0.18, 0.6);
}

function uiConferma() {
  const y = vuoto(0.6);
  const nota = (f) => tono(0.3, f, (t) => Math.min(1, t / 0.004) * Math.exp(-t / 0.09));
  somma(y, nota(1318.5), 0, 0.6);   // mi
  somma(y, nota(1760), 0.085, 0.6); // la
  somma(y, metallo(0.4, 2637, 0.12), 0.085, 0.12);
  return riverbero(y, 0.25, 0.7);
}

// lo stesso andamento del flicker visivo (BlueprintFlicker), un valore per fotogramma
const LAMPEGGIO = [1, 0.35, 0.95, 0.6, 0.15, 0.85, 0.4, 0.1, 0.55, 0.05, 0.3, 0];

function glitch() {
  const y = vuoto(LAMPEGGIO.length / FPS + 0.05);
  const n = y.map(() => rnd());
  const crepitio = passaBanda(n, 3200, 0.7);
  for (let i = 0; i < y.length; i++) {
    const t = i / SR, fr = Math.floor(t * FPS), dentro = (t * FPS) % 1;
    const a = (LAMPEGGIO[fr] ?? 0) * (dentro < 0.6 ? 1 : 0.25);
    // crepitio + ronzio a 100 Hz "elettrico" + qualche scoppiettio
    y[i] = crepitio[i] * a * 0.8 + Math.sign(Math.sin(2 * Math.PI * 100 * t)) * a * 0.12 + (Math.abs(n[i]) > 0.995 ? n[i] * a * 0.4 : 0);
  }
  return y;
}

function strappo() {
  const T = 0.42; // le strisce di carta attraversano lo schermo in 10 fotogrammi
  const y = vuoto(T);
  const n = y.map(() => rnd());
  // grana dello strappo: rumore a scatti (fibre che si rompono), banda che scende
  let g = 0;
  const grani = n.map((v, i) => { if (i % 90 === 0) g = (rnd() + 1) / 2 < 0.7 ? 0.4 + ((rnd() + 1) / 2) * 0.6 : 0.1; return v * g; });
  const f = passaBanda(grani, (t) => 4200 - 2600 * (t / T), 0.9);
  for (let i = 0; i < y.length; i++) {
    const t = i / SR;
    y[i] = f[i] * Math.min(1, t / 0.015) * (t < 0.33 ? 1 : Math.exp(-(t - 0.33) / 0.03));
  }
  return riverbero(y, 0.12, 0.5);
}

function whoosh() {
  const T = 0.85, picco = 0.3; // il titolo è entrato del tutto ~0,1 s dopo il picco
  const inv = (t) => (t < picco ? (t / picco) ** 2 : Math.exp(-(t - picco) / 0.13));
  // due strati di rumore con la banda che sale e poi ridiscende: aria che passa
  const banda = (k) => (t) => (t < picco ? 380 * (6.5 * k) ** (t / picco) : 2470 * k * Math.exp(-(t - picco) / 0.35) + 700 * k);
  const n1 = vuoto(T).map(() => rnd()), n2 = vuoto(T).map(() => rnd());
  const a = passaBanda(n1, banda(1), 1.4), b = passaBanda(n2, banda(0.62), 0.9);
  const y = vuoto(T);
  for (let i = 0; i < y.length; i++) y[i] = (a[i] * 0.7 + b[i] * 0.5) * inv(i / SR);
  return riverbero(y, 0.22, 0.7);
}

function impatto() {
  const T = 1.8;
  const y = vuoto(T);
  // sub che scende di tono (70 → 40 Hz) + "corpo" a 110 Hz + soffio filtrato sull'attacco
  somma(y, tono(T, (t) => 40 + 30 * Math.exp(-t / 0.12), (t) => Math.min(1, t / 0.006) * Math.exp(-t / 0.5)), 0, 1);
  somma(y, tono(0.6, 110, (t) => Math.min(1, t / 0.004) * Math.exp(-t / 0.09)), 0, 0.35);
  const n = new Float32Array(Math.round(0.4 * SR)).map((_, i) => rnd() * Math.exp(-i / (SR * 0.07)));
  somma(y, passaBanda(n, 260, 0.6), 0, 0.5);
  return riverbero(y, 0.35, 0.85);
}

function salva(nome, y) {
  let picco = 0; for (const v of y) picco = Math.max(picco, Math.abs(v));
  const g = picco > 0 ? 10 ** (-3 / 20) / picco : 1;
  // dissolvenza di 5 ms in coda: niente click
  const fine = Math.round(0.005 * SR);
  const buf = Buffer.alloc(44 + y.length * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + y.length * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(y.length * 2, 40);
  for (let i = 0; i < y.length; i++) {
    const coda = i > y.length - fine ? (y.length - i) / fine : 1;
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, y[i] * g * coda)) * 32767), 44 + i * 2);
  }
  fs.writeFileSync(path.join(DIR, `${nome}.wav`), buf);
  console.log(`${nome}.wav ${(y.length / SR).toFixed(2)} s`);
}

fs.mkdirSync(DIR, { recursive: true });
salva('riser', riser());
salva('ui_in', uiIn());
salva('ui_conferma', uiConferma());
salva('glitch', glitch());
seme = 777;
salva('strappo', strappo());
seme = 4242;
salva('whoosh', whoosh());
salva('impatto', impatto());
