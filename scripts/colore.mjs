// Colore del girato: lettura dei file (ffprobe), conversione tecnica a Rec.709 (HDR, I-Log)
// e misure di luminosità/saturazione. Usato dal montaggio (regista.mjs) e dal laboratorio del look
// (laboratorio.mjs), così le prove partono dalla stessa immagine che vede il montaggio.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { tagsPiatti } from './sorgenti.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const run = (cmd, args, opts = {}) => String(execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1 << 28, ...opts }) ?? '');

// fotogrammi al secondo da "30000/1001"
const fps = (r) => {
  const [n, d] = String(r || '').split('/').map(Number);
  return n > 0 && d > 0 ? n / d : 0;
};

export function probe(file) {
  const j = JSON.parse(run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file]));
  const v = j.streams.find((s) => s.codec_type === 'video');
  const a = j.streams.find((s) => s.codec_type === 'audio');
  let w = v?.width ?? 0, h = v?.height ?? 0;
  const rot = Math.abs(Number(v?.tags?.rotate ?? v?.side_data_list?.find((s) => s.rotation !== undefined)?.rotation ?? 0));
  if (rot === 90 || rot === 270) [w, h] = [h, w];
  const colore = v ? { trc: v.color_transfer, primaries: v.color_primaries, matrix: v.color_space, pix: v.pix_fmt } : null;
  // fps reali: avg_frame_rate (r_frame_rate può essere il massimo di un file a fps variabili)
  const f = v ? Math.round((fps(v.avg_frame_rate) || fps(v.r_frame_rate)) * 100) / 100 : 0;
  return { durata: Number(j.format.duration), w, h, fps: f, audio: Boolean(a), video: Boolean(v), tags: tagsPiatti(j), colore };
}

// HDR (iPhone in HLG/Dolby Vision, clip PQ) → Rec.709: senza conversione i colori escono slavati
export const HDR = ['arib-std-b67', 'smpte2084'];
// I-Log (Insta360): girato piatto, si riporta a colori normali con la LUT tecnica ufficiale
// Insta360 (I-Log → Rec709 BT1886). Il "look" (caldo, contrasto) lo aggiunge poi lo stile.
export const LUT_ILOG = path.join(ROOT, 'lut', 'Luna_I-Log_to_Rec709_BT1886_s33_v2.cube');
export const perFiltro = (p) => p.replace(/\\/g, '/').replace(/:/g, '\\:');
// I-Log con esposizione automatica: la Insta protegge il cielo e dopo la LUT i medi restano bassi
// (Giacca autunnale, 18/10: luminosità media 0,22–0,30). `alza` = curva che porta la media
// misurata della clip (da) verso ESPOSIZIONE_LOG (a), lasciando fermi nero e bianco
export const ESPOSIZIONE_LOG = 0.4;

export function filtroTecnico(c) {
  if (c?.log) return `lut3d=file='${perFiltro(LUT_ILOG)}':interp=tetrahedral${c.alza ? `,curves=master='0/0 ${c.alza.da}/${c.alza.a} 1/1'` : ''},format=yuv420p`;
  if (!c || !HDR.includes(c.trc)) return 'format=yuv420p';
  return `zscale=tin=${c.trc}:pin=${c.primaries || 'bt2020'}:min=${c.matrix || 'bt2020nc'}:t=linear:npl=100,format=gbrpf32le,`
    + 'zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p';
}

// luminosità e saturazione medie (scala 8 bit) di alcuni fotogrammi, dopo il filtro `filtro`.
// Tarate sul test I-Log del 18/10: I-Log originale saturazione ~3 (girato normale 13–19);
// convertito con la LUT ma esposto poco, luminosità ~37 (un prodotto in luce scura ~60)
export function statisticheColore(file, durata, filtro = 'null', tmpDir = path.join(ROOT, 'work')) {
  fs.mkdirSync(tmpDir, { recursive: true });
  const tmp = path.join(tmpDir, `statistiche-${process.pid}.txt`);
  const v = [0.25, 0.5, 0.75].map((q) => {
    try {
      fs.rmSync(tmp, { force: true });
      run('ffmpeg', ['-y', '-v', 'error', '-ss', (durata * q).toFixed(2), '-i', file, '-frames:v', '1', '-vf',
        `scale=270:-2,${filtro},format=yuv420p,signalstats,metadata=print:file='${perFiltro(tmp)}'`, '-f', 'null', '-']);
      const t = fs.readFileSync(tmp, 'utf8');
      return { y: Number(/YAVG=([\d.]+)/.exec(t)?.[1]), sat: Number(/SATAVG=([\d.]+)/.exec(t)?.[1]) };
    } catch { return null; }
  }).filter((x) => x && Number.isFinite(x.y) && Number.isFinite(x.sat));
  fs.rmSync(tmp, { force: true });
  if (!v.length) return null;
  return { y: v.reduce((a, x) => a + x.y, 0) / v.length, sat: v.reduce((a, x) => a + x.sat, 0) / v.length };
}

// I-Log: la Insta360 non lo scrive nei metadati (test del 18/10: bt709, 10 bit e basta).
// Si riconosce da 10 bit + colori spentissimi; "i-Log" nel brief lo forza, "senza i-Log" lo esclude.
// Con I-Log imposta info.colore.log e, se dopo la LUT resta scuro, info.colore.alza.
// Risultato: { iLog, riconosciuto (dai colori, non dal brief), scuro, luce (0–1 dopo la LUT) }
export function riconosciLog(src, info, disp, brief = '', tmpDir) {
  const noLog = /\b(senza|no)\s+i-?log\b/i.test(brief);
  let iLog = !noLog && (/\bi-?log\b/i.test(Object.values(info.tags).join(' ')) || (disp === 'insta' && /\bi-?log\b/i.test(brief)));
  let riconosciuto = false, sat = null;
  if (!iLog && !noLog && disp === 'insta' && /10/.test(info.colore?.pix || '') && !HDR.includes(info.colore?.trc)) {
    const st = statisticheColore(src, info.durata, 'null', tmpDir);
    if (st && st.sat < 6) { iLog = true; riconosciuto = true; sat = st.sat; }
  }
  if (!iLog || !info.colore) return { iLog: false };
  info.colore.log = true;
  const dopo = statisticheColore(src, info.durata, filtroTecnico(info.colore).replace(/,format=yuv420p$/, ''), tmpDir);
  let luce = null;
  if (dopo) {
    luce = Math.max(0.02, (dopo.y - 16) / 219); // luminosità media 0–1 dopo la LUT
    // al massimo ~1 stop in più: oltre si vede solo rumore
    if (luce < ESPOSIZIONE_LOG - 0.03) info.colore.alza = { da: +luce.toFixed(3), a: +Math.min(ESPOSIZIONE_LOG, luce * 2).toFixed(3) };
  }
  return { iLog: true, riconosciuto, sat, luce, scuro: luce !== null && luce < 0.12 };
}

// ---------- look chiari: esposizione del soggetto portata a "ben esposto" ----------
// Moero air (Narrativo, 20/10): girato I-Log al chiuso, dopo la LUT tecnica il volto restava al
// buio ("sono stra scuro, così non è pubblicabile"): in controluce col cielo chiaro, pelle a 0,14.
// La schiarita I-Log guarda la media di tutta l'immagine; qui contano il centro, dove sta il
// soggetto, verso `obiettivo`, e il volto (la pelle nella parte alta) verso `obiettivoPelle`: in
// controluce il volto è molto più scuro del centro (giacca bianca, cielo) e sale per conto suo.
// Al massimo ×`guadagno` (oltre si vede il rumore), ombre alzate meno (radice del guadagno: niente
// grigio slavato), neri a terra, bianchi spenti su. Se il pezzo va già bene: null.
// Tarata sulle prove di Manifestazioni (20/10, scelto da Denis il "chiaro caldo": centro 0,5)
export function curvaChiara(m, { obiettivo = 0.48, obiettivoPelle = 0.33, guadagno = 2.2 } = {}) {
  if (!m) return null;
  const punti = [[0, 0]];
  if (m.nero > 0.02) punti.push([m.nero, m.nero * (1 - 0.6 * rampa(m.nero, 0.02, 0.06))]);
  let medio = m.medio;
  if (m.medio < obiettivo) medio = Math.min(m.medio * guadagno, m.medio + (obiettivo - m.medio) * rampa(obiettivo - m.medio, 0, 0.04));
  else medio = m.medio + 0.6 * (0.58 - m.medio) * rampa(m.medio, 0.62, 0.7);
  const pelle = m.pelle != null && m.pelle < obiettivoPelle && m.pelle < m.medio - 0.04
    ? [m.pelle, Math.min(m.pelle * guadagno, obiettivoPelle)] : null;
  const cambiaMedio = Math.abs(medio - m.medio) > 0.008 && m.medio > 0.03;
  if (cambiaMedio || pelle) {
    const [x, y] = pelle || [m.medio, medio];
    const ombra = x * 0.4;
    if (ombra > punti[punti.length - 1][0] + 0.03) punti.push([ombra, ombra * Math.sqrt(y / x)]);
    if (pelle) punti.push(pelle);
    if (cambiaMedio) punti.push([m.medio, Math.max(medio, pelle ? pelle[1] + 0.03 : 0)]);
  }
  const suBianchi = rampa(m.bianco, 0.88, 0.75) * rampa(m.bianco - m.medio, 0.06, 0.12);
  if (suBianchi > 0) punti.push([m.bianco, m.bianco + suBianchi * 0.6 * (0.93 - m.bianco)]);
  punti.push([1, 1]);
  const buoni = [punti[0]];
  for (const q of punti.slice(1)) {
    const u = buoni[buoni.length - 1];
    if (q[0] - u[0] >= 0.03 && q[1] > u[1]) buoni.push(q);
  }
  if (buoni[buoni.length - 1][0] !== 1) buoni[buoni.length - 1] = [1, 1];
  if (buoni.length <= 2) return null;
  return buoni.map(([x, y]) => `${x.toFixed(3)}/${y.toFixed(3)}`).join(' ');
}

// ---------- 12K Quality: esposizione adattata a ogni pezzo ----------
// La LUT del look (lut/12k.cube) si aspetta un'immagine "normale": soggetto a metà luce, neri
// veri, bianchi pieni. Il girato di Denis va dal controluce nuvoloso (Giacca autunnale, I-Log
// scuro) alla scrivania con le luci RGB (980): la v1 scuriva tutto allo stesso modo e i volti
// finivano nel buio. Qui si misura ogni pezzo (già convertito) e si corregge con una curva solo
// dove serve (curvaEsposizione): neri sollevati giù, soggetto al buio su, bianchi spenti su.

// luma 0–1 di un fotogramma rimpicciolito: { tutto, centro, pelle }. `pelle`: i punti color pelle
// (Cb/Cr a gamma limitata) nella parte alta e centrale, dove nei verticali sta il volto
function lumaFotogramma(file, t, filtro) {
  const w = 96, h = 170, n = w * h;
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-ss', Math.max(0, t).toFixed(3), '-i', file, '-frames:v', '1',
    '-vf', `scale=${w}:${h}:flags=area,${filtro || 'null'},format=yuv444p`, '-f', 'rawvideo', '-'], { maxBuffer: 1 << 24, stdio: ['ignore', 'pipe', 'ignore'] });
  if (buf.length < 3 * n) return null;
  const tutto = [], centro = [], pelle = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      // il segnale è a gamma limitata (16–235)
      const v = Math.min(1, Math.max(0, (buf[i] - 16) / 219));
      tutto.push(v);
      // ellisse centrale un po' alta: dove stanno volto e prodotto nei verticali
      const dx = (x - w / 2) / (w * 0.32), dy = (y - h * 0.45) / (h * 0.3);
      if (dx * dx + dy * dy <= 1) centro.push(v);
      const cb = buf[n + i], cr = buf[2 * n + i];
      if (Math.abs(x - w / 2) < w * 0.3 && y > h * 0.05 && y < h * 0.6 && cb >= 83 && cb <= 127 && cr >= 132 && cr <= 168 && v > 0.03 && v < 0.95) pelle.push(v);
    }
  }
  return { tutto, centro, pelle, n };
}

const percentile = (ordinati, p) => ordinati[Math.min(ordinati.length - 1, Math.max(0, Math.round(p * (ordinati.length - 1))))];

// misura di un pezzo [start, start+dur] dopo la conversione tecnica, sui fotogrammi ai punti `dove`
// `pelle`: luma mediana del volto (null se la pelle è meno dello 0,6% dell'immagine: niente persona)
export function misuraPezzo(file, start, dur, filtroTec, dove = [0.2, 0.5, 0.8]) {
  const tutto = [], centro = [], pelle = [];
  let punti = 0;
  for (const q of dove) {
    try {
      const m = lumaFotogramma(file, start + dur * q, filtroTec.replace(/,?format=yuv420p$/, ''));
      if (m) { tutto.push(...m.tutto); centro.push(...m.centro); pelle.push(...m.pelle); punti += m.n; }
    } catch { /* fotogramma illeggibile: si usa il resto */ }
  }
  if (tutto.length < 100) return null;
  tutto.sort((a, b) => a - b);
  centro.sort((a, b) => a - b);
  pelle.sort((a, b) => a - b);
  const conPelle = pelle.length >= punti * 0.006;
  return { nero: percentile(tutto, 0.02), bianco: percentile(tutto, 0.985), medio: percentile(centro, 0.5), medioTutto: percentile(tutto, 0.5),
    pelle: conPelle ? percentile(pelle, 0.5) : null, quotaPelle: +(pelle.length / Math.max(1, punti)).toFixed(4) };
}

// curva di correzione (punti per il filtro curves di ffmpeg) o null se il pezzo va già bene.
// Il look 12K è scuro di suo (negli esempi metà dell'immagine sta sotto 0,15): la correzione non
// porta tutto a "esposizione normale" (prima prova: immagini slavate), sistema solo i difetti:
// neri sollevati (girato piatto, foschia), soggetto davvero sottoesposto, bianchi spenti.
// Ogni correzione entra in rampa, senza scalini: con le soglie secche due pezzi dello stesso volto
// misurati 0,19 e 0,21 uscivano uno schiarito (0,27) e uno no, e la luce saltava al taglio
const rampa = (x, da, a) => Math.min(1, Math.max(0, (x - da) / (a - da))); // 0 in `da`, 1 in `a`
export function curvaEsposizione(m, obiettivo = 0.32) {
  if (!m) return null;
  const punti = [[0, 0]];
  // neri sollevati: giù, quasi a zero (pieno da 0,05)
  if (m.nero > 0.03) punti.push([m.nero, m.nero * (1 - 0.7 * rampa(m.nero, 0.03, 0.05))]);
  // soggetto al buio (pieno sotto 0,2, niente da 0,26) su verso l'obiettivo, bruciato (da 0,62,
  // pieno da 0,68) giù verso 0,5: al 60% della distanza
  let medio = m.medio + 0.6 * (obiettivo - m.medio) * rampa(m.medio, 0.26, 0.2) + 0.6 * (0.5 - m.medio) * rampa(m.medio, 0.62, 0.68);
  medio = Math.min(m.medio * 1.8, Math.max(m.medio * 0.8, medio));
  if (Math.abs(medio - m.medio) > 0.008 && m.medio > 0.03) {
    // le ombre restano ferme sotto metà del soggetto: si schiarisce il soggetto, non il buio
    if (medio > m.medio && m.medio * 0.45 > punti[punti.length - 1][0] + 0.03) punti.push([m.medio * 0.45, m.medio * 0.45]);
    punti.push([m.medio, medio]);
  }
  // bianchi molto spenti (I-Log al buio, controluce sbagliato): un po' su. Non di più: negli esempi
  // le luci restano sotto 0,9 e alzarle in una scena scura la rende slavata (prova 980, 20/10)
  const suBianchi = rampa(m.bianco, 0.56, 0.5) * rampa(m.bianco - m.medio, 0.06, 0.1);
  if (suBianchi > 0) punti.push([m.bianco, m.bianco + suBianchi * (Math.min(0.75, m.bianco + 0.4 * (0.75 - m.bianco)) - m.bianco)]);
  punti.push([1, 1]);
  // monotona e con punti distanti: altrimenti la spline di ffmpeg rimbalza
  const buoni = [punti[0]];
  for (const p of punti.slice(1)) {
    const u = buoni[buoni.length - 1];
    if (p[0] - u[0] >= 0.03 && p[1] > u[1]) buoni.push(p);
  }
  if (buoni[buoni.length - 1][0] !== 1) buoni[buoni.length - 1] = [1, 1];
  if (buoni.length <= 2) return null;
  return buoni.map(([x, y]) => `${x.toFixed(3)}/${y.toFixed(3)}`).join(' ');
}
