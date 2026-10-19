// Laboratorio del look (workflow laboratorio.yml): prove di colore e nitidezza sul girato vero,
// senza montare niente. Legge una ricetta (lab/<nome>.json) e mette i risultati su Drive.
//
// Le sorgenti si scaricano una alla volta nel disco grande del runner (LAB_SCARICO) e si cancellano
// appena finite. Lo streaming da Drive (rclone serve http) restava appeso per decine di minuti.
//
// Ricetta:
// {
//   "uscita": "03 · Social — Risorse/Stili/12K Quality/_laboratorio/catalogo",
//   "catalogo": { "cartelle": ["98 - Fatti/980"], "max": 8 },      // fogli con tutti i video
//   "fotogrammi": [{ "file": "98 - Fatti/980/IMG_1.MOV", "tempi": [2.5, 7] }],
//   "varianti": [{ "id": "A", "filtro": "lut3d=file=lut/12k.cube" }], // applicate a ogni fotogramma
//   "clip": [{ "file": "...", "da": 3, "dur": 4, "variante": "A" }]   // pezzi brevi in mp4
// }
// I fotogrammi escono già convertiti come nel montaggio (HDR → SDR, I-Log → Rec709): "<n>-base.jpg"
// è il punto di partenza del look, "<n>-<variante>.jpg" il risultato.

import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { filtroTecnico, probe, riconosciLog } from './colore.mjs';
import { VIDEO_EXT, dispositivo } from './sorgenti.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const REMOTE = process.env.REGISTA_REMOTE || 'gdrive';
const OUT = path.join(ROOT, 'work', 'lab');
const SCARICO = process.env.LAB_SCARICO || path.join(ROOT, 'work', 'lab-in');
const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';

const log = (...a) => console.log('[lab]', ...a);
// ogni comando ha un tempo massimo: uno bloccato non deve fermare tutto il giro
const run = (cmd, args, opts = {}) => String(execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1 << 28, timeout: 15 * 60 * 1000, ...opts }) ?? '');
// versione asincrona: i fotogrammi di una striscia si estraggono insieme
const runA = (cmd, args) => new Promise((ok, ko) => execFile(cmd, args, { maxBuffer: 1 << 26, timeout: 5 * 60 * 1000 }, (e, out, err) => (e ? ko(new Error(`${e.message}\n${err}`)) : ok(out))));
// a gruppi di n alla volta
async function aGruppi(voci, n, fn) {
  const coda = [...voci];
  await Promise.all(Array.from({ length: n }, async () => { while (coda.length) await fn(coda.shift()); }));
}
let uscitaDrive = null;
const carica = () => { if (uscitaDrive) run('rclone', ['copy', OUT, `${REMOTE}:${uscitaDrive}`, '--exclude', 'tmp/**']); };
const pulito = (t) => String(t).replace(/[^\w.-]+/g, '_').slice(0, 60);
const testo = (t) => String(t).replace(/[\\':%,]/g, ' ');

// sorgente: scaricata + conversione tecnica come nel montaggio
const sorgenti = new Map();
function sorgente(file) {
  if (sorgenti.has(file)) return sorgenti.get(file);
  const u = path.join(SCARICO, `${sorgenti.size}-${pulito(path.basename(file))}`);
  if (!fs.existsSync(u)) {
    const t0 = Date.now();
    run('rclone', ['copyto', `${REMOTE}:${file}`, u, '--multi-thread-streams', '4']);
    log(`scaricato ${file} (${(fs.statSync(u).size / 1e6).toFixed(0)} MB, ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
  const info = probe(u);
  const disp = dispositivo(path.basename(file), info.tags);
  const lg = riconosciLog(u, info, disp, '', path.join(OUT, 'tmp'));
  const s = { file, u, info, disp, iLog: lg.iLog, tecnico: filtroTecnico(info.colore) };
  const hdr = info.colore?.trc && /arib|2084/.test(info.colore.trc);
  s.riga = `${file} · ${disp} · ${info.w}x${info.h} · ${info.fps} fps · ${info.colore?.pix || '?'} ${info.colore?.trc || ''}`
    + `${lg.iLog ? ` · I-Log${info.colore.alza ? ` (schiarita ${info.colore.alza.da}→${info.colore.alza.a})` : ''}` : hdr ? ' · HDR' : ''} · ${info.durata.toFixed(1)} s`;
  sorgenti.set(file, s);
  return s;
}

// un fotogramma al tempo t, convertito, alla misura del montaggio (verticale 1080, orizzontale 1920)
const argsFotogramma = (s, t, out, extra = '') => ['-y', '-v', 'error', '-ss', Math.max(0, t).toFixed(3), '-i', s.u, '-frames:v', '1',
  '-vf', `scale='if(gt(iw,ih),1920,1080)':-2:flags=lanczos,${s.tecnico.replace(/,?format=yuv420p$/, '') || 'null'}${extra ? `,${extra}` : ''}`, '-q:v', '2', out];
const fotogramma = (s, t, out, extra) => run('ffmpeg', argsFotogramma(s, t, out, extra));
const fotogrammaA = (s, t, out, extra) => runA('ffmpeg', argsFotogramma(s, t, out, extra));

// il file scaricato si cancella se le altre parti della ricetta non lo usano
function libera(file, ric) {
  const serve = [...(ric.fotogrammi || []), ...(ric.clip || [])].some((v) => v.file === file);
  const s = sorgenti.get(file);
  if (s && !serve) fs.rmSync(s.u, { force: true });
}

async function catalogo(ric) {
  const { cartelle = [], max = 8 } = ric.catalogo;
  const righe = [];
  for (const cartella of cartelle) {
    let files;
    try {
      files = JSON.parse(run('rclone', ['lsjson', `${REMOTE}:${cartella}`, '--files-only', '-R', '--max-depth', '2']))
        .filter((f) => VIDEO_EXT.includes(path.extname(f.Name).toLowerCase()) && !/FINALE|PROVA \d+s|^_/i.test(f.Name) && !/(^|\/)_/.test(f.Path))
        .sort((a, b) => b.Size - a.Size).slice(0, max);
    } catch (e) { righe.push(`${cartella}: non letta (${e.message.split('\n')[0]})`); continue; }
    const strisce = new Map();
    await aGruppi(files, 2, async (f) => {
      const file = `${cartella}/${f.Path}`;
      try {
        const s = sorgente(file);
        righe.push(`${s.riga} · ${(f.Size / 1e6).toFixed(0)} MB`);
        const n = `${pulito(path.basename(cartella))}-${pulito(path.parse(f.Name).name)}`;
        // striscia di 6 fotogrammi, ognuno dentro un quadrato 200x200, più uno grande a metà
        // (punto di partenza per le prove del look)
        const tmp = Array.from({ length: 6 }, (_, k) => path.join(OUT, 'tmp', `${n}-${k}.jpg`));
        await Promise.all([
          ...tmp.map((o, k) => fotogrammaA(s, s.info.durata * (k + 0.5) / 6, o, 'scale=200:200:force_original_aspect_ratio=decrease,pad=200:200:(ow-iw)/2:(oh-ih)/2')),
          fotogrammaA(s, s.info.durata / 2, path.join(OUT, `${n}-meta.jpg`)),
        ]);
        const striscia = path.join(OUT, 'tmp', `${n}-striscia.jpg`);
        await runA('ffmpeg', ['-y', '-v', 'error', ...tmp.flatMap((o) => ['-i', o]), '-filter_complex',
          `${tmp.map((_, k) => `[${k}]`).join('')}hstack=${tmp.length},pad=iw:ih+28:0:28:black,drawtext=fontfile=${FONT}:text='${testo(s.riga.replace(`${cartella}/`, ''))}':x=6:y=6:fontsize=16:fontcolor=white`,
          '-q:v', '3', striscia]);
        strisce.set(f.Path, striscia);
      } catch (e) { righe.push(`${file}: errore ${e.message.split('\n')[0]}`); }
      libera(file, ric);
    });
    const ordinate = files.map((f) => strisce.get(f.Path)).filter(Boolean);
    for (let i = 0; i < ordinate.length; i += 10) {
      const parte = ordinate.slice(i, i + 10);
      run('ffmpeg', ['-y', '-v', 'error', ...parte.flatMap((o) => ['-i', o]), '-filter_complex',
        parte.length > 1 ? `${parte.map((_, k) => `[${k}]`).join('')}vstack=${parte.length}` : 'null', '-q:v', '3',
        path.join(OUT, `catalogo-${pulito(path.basename(cartella))}-${i / 10 + 1}.jpg`)]);
    }
    fs.writeFileSync(path.join(OUT, 'catalogo.txt'), `${righe.join('\n')}\n`);
    carica();
    log(`${cartella}: ${ordinate.length} video`);
  }
}

function fotogrammiEVarianti(ric) {
  const varianti = ric.varianti || [];
  let n = 0;
  for (const voce of ric.fotogrammi || []) {
    const s = sorgente(voce.file);
    log(s.riga);
    for (const t of voce.tempi || [s.info.durata / 2]) {
      n++;
      const nome = `${String(n).padStart(2, '0')}-${pulito(path.parse(voce.file).name)}-${String(t).replace('.', ',')}s`;
      const base = path.join(OUT, `${nome}-base.jpg`);
      fotogramma(s, t, base);
      const fatti = [base];
      for (const v of varianti) {
        const o = path.join(OUT, `${nome}-${pulito(v.id)}.jpg`);
        try {
          fotogramma(s, t, o, v.filtro.replace(/lut\//g, `${ROOT}/lut/`));
          fatti.push(o);
        } catch (e) { log(`variante ${v.id} su ${nome}: ${e.message.split('\n')[0]}`); }
      }
      // confronto affiancato (540 di larghezza l'uno) con il nome della variante
      const nomi = ['base', ...varianti.map((v) => v.id)];
      run('ffmpeg', ['-y', '-v', 'error', ...fatti.flatMap((o) => ['-i', o]), '-filter_complex',
        `${fatti.map((_, k) => `[${k}]scale=540:-2,drawtext=fontfile=${FONT}:text='${testo(nomi[k])}':x=12:y=12:fontsize=28:fontcolor=white:box=1:boxcolor=black@0.5[v${k}]`).join(';')};`
        + `${fatti.map((_, k) => `[v${k}]`).join('')}${fatti.length > 1 ? `hstack=${fatti.length}` : 'null'}`,
        '-q:v', '3', path.join(OUT, `${nome}-confronto.jpg`)]);
    }
  }
}

function clip(ric) {
  const varianti = Object.fromEntries((ric.varianti || []).map((v) => [v.id, v]));
  for (const c of ric.clip || []) {
    const s = sorgente(c.file);
    const v = c.variante ? varianti[c.variante] : null;
    const out = path.join(OUT, `clip-${pulito(path.parse(c.file).name)}-${c.da}s-${pulito(c.variante || 'base')}.mp4`);
    run('ffmpeg', ['-y', '-v', 'error', '-ss', String(c.da), '-i', s.u, '-t', String(c.dur || 4),
      '-vf', `scale='if(gt(iw,ih),1920,1080)':-2:flags=lanczos,${s.tecnico.replace(/,?format=yuv420p$/, '') || 'null'}${v ? `,${v.filtro.replace(/lut\//g, `${ROOT}/lut/`)}` : ''},format=yuv420p`,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-an', '-movflags', '+faststart',
      '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', out]);
  }
}

async function main() {
  const file = process.env.RICETTA || 'lab/ricetta.json';
  const ric = JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  if (!ric.uscita) throw new Error('la ricetta non dice dove mettere i risultati (uscita)');
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'tmp'), { recursive: true });
  uscitaDrive = ric.uscita;
  fs.mkdirSync(SCARICO, { recursive: true });
  if (ric.fotogrammi) { fotogrammiEVarianti(ric); carica(); }
  if (ric.clip) { clip(ric); carica(); }
  if (ric.catalogo) await catalogo(ric);
  fs.rmSync(path.join(OUT, 'tmp'), { recursive: true, force: true });
  const elenco = [...sorgenti.values()].map((s) => s.riga).join('\n');
  if (elenco) fs.writeFileSync(path.join(OUT, 'sorgenti.txt'), `${elenco}\n`);
  carica();
  log(`risultati in ${ric.uscita}: ${fs.readdirSync(OUT).length} file`);
}

main().catch((e) => { console.error(e); process.exit(1); });
