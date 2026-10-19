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
