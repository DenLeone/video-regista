// Analisi di una cartella di girato sul PC di Denis (video YouTube lunghi, 30/10): tutto in locale,
// niente upload. Per ogni video: durata, camera, data e ora, orientamento, luogo (GPS dell'iPhone →
// nome del posto), se Denis parla e cosa dice (Whisper sulla scheda video) e un foglio di 6 fotogrammi.
// Esce C:\regista\work\pc\<nome>\materiale.md (+ .json e fogli\), il riassunto da cui l'AI costruisce il
// racconto; se c'è Google Drive (G:) ne mette una copia in 30 · Sviluppo/video-regista/pc/<nome>, così
// lo legge anche il regista nel cloud.
//   node pc\analizza.mjs "E:\Backup Iphone\Ottobre\Austria" [--senza-trascrizione]
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const cartella = process.argv[2];
const SENZA_TRASCRIZIONE = process.argv.includes('--senza-trascrizione');
if (!cartella || !fs.existsSync(cartella)) { console.error('uso: node pc/analizza.mjs "<cartella>"'); process.exit(1); }
// i risultati sul PC, mai nella cartella del girato (spesso un disco di backup in sola lettura)
const OUT = path.join(ROOT, 'work', 'pc', path.basename(path.resolve(cartella)));
const FOGLI = path.join(OUT, 'fogli');
const TRASCR = path.join(OUT, 'trascrizioni');
for (const d of [OUT, FOGLI, TRASCR]) fs.mkdirSync(d, { recursive: true });
// fogli e trascrizioni si salvano col NOME DEL FILE, che non cambia: i numeri V001… seguono l'ordine
// delle clip e scivolano se ne aggiungi o togli una (30/10: trascrizioni finite sulle clip sbagliate).
// Quelli vecchi salvati per numero non sono affidabili: via.
const chiave = (file) => file.replace(/[^\w.-]+/g, '_');
for (const d of [FOGLI, TRASCR]) for (const f of fs.readdirSync(d)) if (/^V\d{3}\.(json|jpg)$/.test(f)) fs.rmSync(path.join(d, f));
const log = (...a) => console.log('[analizza]', ...a);

const VIDEO = /\.(mov|mp4|m4v|mts|avi|mkv|insv)$/i;
const FOTO = /\.(heic|heif|jpe?g|png|dng)$/i;
function elenco(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return elenco(p);
    return [p];
  });
}

// ---------- metadati ----------
function probe(file) {
  const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { encoding: 'utf8', maxBuffer: 1 << 24 }));
  const v = (j.streams || []).find((s) => s.codec_type === 'video');
  const a = (j.streams || []).find((s) => s.codec_type === 'audio');
  const tag = { ...(j.format?.tags || {}), ...(v?.tags || {}) };
  const t = (k) => Object.entries(tag).find(([x]) => x.toLowerCase() === k)?.[1];
  const rot = Math.abs(Number(v?.side_data_list?.find((s) => s.rotation !== undefined)?.rotation ?? t('rotate') ?? 0)) % 180 === 90;
  const [w, h] = rot ? [v?.height, v?.width] : [v?.width, v?.height];
  const [fn, fd] = String(v?.avg_frame_rate || '0/1').split('/').map(Number);
  const iso = t('com.apple.quicktime.location.iso6709') || t('location');
  const m = iso && /([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)/.exec(iso);
  return {
    durata: Number(j.format?.duration) || 0, w, h, orient: (h || 0) > (w || 0) ? 'verticale' : 'orizzontale',
    fps: fd ? Math.round((fn / fd) * 100) / 100 : 0, hdr: /arib-std-b67|smpte2084/.test(v?.color_transfer || ''),
    data: t('com.apple.quicktime.creationdate') || t('creation_time') || null,
    camera: [t('com.apple.quicktime.make'), t('com.apple.quicktime.model')].filter(Boolean).join(' ') || t('encoder') || null,
    gps: m ? { lat: Number(m[1]), lon: Number(m[2]) } : null, audio: Boolean(a),
  };
}

// nome del posto dalle coordinate (OpenStreetMap, una richiesta al secondo, cache per ~1 km)
const FILE_LUOGHI = path.join(OUT, 'luoghi.json');
const cacheLuoghi = new Map(fs.existsSync(FILE_LUOGHI) ? Object.entries(JSON.parse(fs.readFileSync(FILE_LUOGHI, 'utf8'))) : []);
async function luogo(gps) {
  if (!gps) return null;
  const k = `${gps.lat.toFixed(2)},${gps.lon.toFixed(2)}`;
  if (cacheLuoghi.has(k)) return cacheLuoghi.get(k);
  let nome = null;
  try {
    await new Promise((ok) => setTimeout(ok, 1100));
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&accept-language=it&lat=${gps.lat}&lon=${gps.lon}`,
      { headers: { 'user-agent': 'video-regista (Denis, uso personale)' }, signal: AbortSignal.timeout(10_000) });
    const j = await r.json();
    const a = j.address || {};
    nome = [a.attraction || a.tourism || a.leisure || a.natural || a.road, a.village || a.town || a.city || a.municipality, a.state].filter(Boolean).join(', ') || j.display_name || null;
  } catch { /* senza rete: solo le coordinate */ }
  cacheLuoghi.set(k, nome);
  return nome;
}

// 6 fotogrammi distribuiti sul video in una striscia: si salta a ogni punto (-ss prima di -i) invece di
// decodificare tutto il file, con la scheda video quando c'è (4K HEVC dell'iPhone: da minuti a secondi)
function foglio(file, durata, uscita) {
  if (fs.existsSync(uscita)) return;
  const punti = Array.from({ length: 6 }, (_, k) => Math.max(0, (durata * (k + 0.5)) / 6 - 0.05));
  const args = ['-v', 'error', '-y'];
  for (const t of punti) args.push('-hwaccel', 'auto', '-ss', t.toFixed(2), '-i', file);
  const filtro = punti.map((_, k) => `[${k}:v:0]scale=-2:320,format=yuvj420p,setsar=1[f${k}]`).join(';')
    + `;${punti.map((_, k) => `[f${k}]`).join('')}hstack=inputs=6`;
  const r = spawnSync('ffmpeg', [...args, '-filter_complex', filtro, '-frames:v', '1', '-q:v', '5', uscita], { stdio: 'ignore' });
  if (r.status !== 0 || !fs.existsSync(uscita)) {
    // riserva: il modo lento ma sicuro
    spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-vf', `fps=1/${Math.max(0.2, durata / 6).toFixed(3)},scale=-2:320,tile=6x1`, '-frames:v', '1', '-q:v', '5', uscita], { stdio: 'ignore' });
  }
}

// ---------- via ----------
log(`leggo ${cartella}…`);
const tutti = elenco(cartella).sort();
const video = tutti.filter((f) => VIDEO.test(f));
const foto = tutti.filter((f) => FOTO.test(f));
log(`${video.length} video e ${foto.length} foto in ${cartella} → risultati in ${OUT}`);
const voci = [];
for (const [i, file] of video.entries()) {
  try { voci.push({ file: path.relative(cartella, file), ...probe(file) }); } catch (e) { log(`${path.basename(file)}: illeggibile (${String(e.message).split('\n')[0]})`); }
  process.stdout.write(`\r[analizza] metadati ${i + 1}/${video.length}`);
}
console.log('');
// in ordine di ripresa: V001 è il primo girato
voci.sort((a, b) => String(a.data || '').localeCompare(String(b.data || '')) || a.file.localeCompare(b.file));
voci.forEach((v, i) => {
  v.id = `V${String(i + 1).padStart(3, '0')}`;
  v.chiave = chiave(v.file);
  foglio(path.join(cartella, v.file), v.durata, path.join(FOGLI, `${v.chiave}.jpg`));
  process.stdout.write(`\r[analizza] fogli dei fotogrammi ${i + 1}/${voci.length}`);
});
console.log('');

log('luoghi dalle coordinate GPS…');
for (const v of voci) v.luogo = await luogo(v.gps);
fs.writeFileSync(FILE_LUOGHI, JSON.stringify(Object.fromEntries(cacheLuoghi)));

// trascrizione di tutti i video con audio, modello caricato una volta sola
if (!SENZA_TRASCRIZIONE) {
  const py = process.platform === 'win32' ? path.join(ROOT, '.venv', 'Scripts', 'python.exe') : path.join(ROOT, '.venv', 'bin', 'python');
  const lavori = voci.filter((v) => v.audio && !fs.existsSync(path.join(TRASCR, `${v.chiave}.json`)))
    .map((v) => ({ file: path.join(cartella, v.file), uscita: path.join(TRASCR, `${v.chiave}.json`) }));
  if (lavori.length) {
    log(`trascrivo ${lavori.length} video sulla scheda video…`);
    const lista = path.join(OUT, 'lavori-trascrizione.json');
    fs.writeFileSync(lista, JSON.stringify(lavori));
    spawnSync(py, [path.join(ROOT, 'pc', 'trascrivi.py'), '--lista', lista], { stdio: 'inherit' });
  }
}
for (const v of voci) {
  const f = path.join(TRASCR, `${v.chiave}.json`);
  const parole = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : [];
  v.testo = parole.map((p) => p.w).join('').replace(/\s+/g, ' ').trim();
  // parla davvero: almeno ~1 parola ogni 2 secondi (Whisper a volte "sente" parole nel rumore)
  v.parla = parole.length >= Math.max(4, v.durata / 2);
}

// ---------- riassunto ----------
const ora = (d) => (d ? new Date(d).toLocaleString('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '?');
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const totale = voci.reduce((a, v) => a + v.durata, 0);
const parlati = voci.filter((v) => v.parla);
const giorni = [...new Set(voci.map((v) => (v.data ? new Date(v.data).toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' }) : '?')))];
const md = [
  `# Materiale: ${path.basename(cartella)}`,
  '',
  `${voci.length} video (${mmss(totale)} in tutto), ${parlati.length} con Denis che parla (${mmss(parlati.reduce((a, v) => a + v.durata, 0))}), ${foto.length} foto. Giorni: ${giorni.join(', ')}.`,
  `Camere: ${[...new Set(voci.map((v) => v.camera || '?'))].join(', ')}. Nel piano indica le clip col NOME DEL FILE (es. UMXH7108.MP4). Fogli dei fotogrammi in fogli/<nome file>.jpg.`,
  '',
  ...voci.map((v) => [
    `## ${v.file} · ${ora(v.data)} · ${mmss(v.durata)} · ${v.orient}${v.fps >= 50 ? ` · ${Math.round(v.fps)} fps (rallentatore)` : ''}${v.luogo ? ` · ${v.luogo}` : v.gps ? ` · ${v.gps.lat.toFixed(4)}, ${v.gps.lon.toFixed(4)}` : ''}`,
    `${v.id}${v.camera ? ` · ${v.camera}` : ''}${Math.max(v.w || 0, v.h || 0) < 2160 ? ' · EXPORT (data non affidabile)' : ''}`,
    v.parla ? `PARLA: «${v.testo.slice(0, 1200)}»` : v.testo ? `(audio d'ambiente, qualche parola: «${v.testo.slice(0, 120)}»)` : '(senza parlato)',
    '',
  ].join('\n')),
].join('\n');
fs.writeFileSync(path.join(OUT, 'materiale.md'), md);
fs.writeFileSync(path.join(OUT, 'materiale.json'), JSON.stringify({ cartella, foto: foto.map((f) => path.relative(cartella, f)), video: voci }, null, 1));
log(`fatto: ${path.join(OUT, 'materiale.md')}`);

// copia su Google Drive per il regista nel cloud (solo testo e fogli, mai i video)
const drive = process.env.DRIVE_LOCALE || 'G:/Il mio Drive';
if (fs.existsSync(drive)) {
  const dest = path.join(drive, '30 · Sviluppo', 'video-regista', 'pc', path.basename(cartella));
  fs.mkdirSync(path.join(dest, 'fogli'), { recursive: true });
  for (const f of ['materiale.md', 'materiale.json']) fs.copyFileSync(path.join(OUT, f), path.join(dest, f));
  for (const f of fs.readdirSync(FOGLI)) fs.copyFileSync(path.join(FOGLI, f), path.join(dest, 'fogli', f));
  // i tempi parola per parola: servono per tagliare le frasi (piccoli, solo testo)
  fs.mkdirSync(path.join(dest, 'trascrizioni'), { recursive: true });
  for (const f of fs.readdirSync(TRASCR)) fs.copyFileSync(path.join(TRASCR, f), path.join(dest, 'trascrizioni', f));
  log(`copia su Drive: ${dest}`);
}
