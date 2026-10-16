// Regista automatico: prende UNA cartella da "97 - Editare" su Drive che contiene
// un file VAI, prepara il materiale, fa decidere il montaggio a Claude,
// renderizza con Remotion e rimette il risultato su Drive in "98 - Fatti".
//
// Requisiti nell'ambiente (GitHub Actions o PC):
//   rclone configurato con un remote chiamato "gdrive" (account denisnusinovic)
//   ffmpeg / ffprobe nel PATH
//   GROQ_API_KEY            trascrizione Whisper
//   CLAUDE_CODE_OAUTH_TOKEN Claude Code con l'abbonamento (comando `claude`)
//   NOTIFY_URL (opzionale)  POST JSON a fine lavoro (es. Worker Cloudflare -> email)

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const REMOTE = process.env.REGISTA_REMOTE || 'gdrive';
const IN_DIR = '97 - Editare';
const OUT_DIR = '98 - Fatti';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const WORK = path.join(ROOT, 'work');
const MEDIA = path.join(ROOT, 'public', 'media');
const VIDEO_EXT = ['.mp4', '.mov', '.m4v', '.mkv', '.webm'];
const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.heic', '.webp'];

const log = (...a) => console.log('[regista]', ...a);
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1 << 28, ...opts }).toString();
const rclone = (...args) => run('rclone', args);
const remote = (...parts) => `${REMOTE}:${parts.join('/')}`;
const isVai = (name) => path.parse(name).name.toUpperCase() === 'VAI';

// ---------- 1. trova la cartella da fare ----------
function trovaCartella() {
  // avvio da Telegram/manuale con cartella esplicita: VAI non obbligatorio
  if (process.env.CARTELLA) {
    const nome = process.env.CARTELLA;
    const files = JSON.parse(rclone('lsjson', remote(IN_DIR, nome), '--files-only'));
    const vai = files.find((f) => isVai(f.Name));
    return { nome, files, vai: vai ? vai.Name : null };
  }
  const dirs = JSON.parse(rclone('lsjson', remote(IN_DIR), '--dirs-only'))
    .map((d) => d.Name)
    .sort();
  for (const d of dirs) {
    const files = JSON.parse(rclone('lsjson', remote(IN_DIR, d), '--files-only'));
    const vai = files.find((f) => isVai(f.Name));
    if (vai) return { nome: d, files, vai: vai.Name };
  }
  return null;
}

// ---------- 2. scarica e prepara ----------
function probe(file) {
  const j = JSON.parse(run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file]));
  const v = j.streams.find((s) => s.codec_type === 'video');
  const a = j.streams.find((s) => s.codec_type === 'audio');
  let w = v?.width ?? 0, h = v?.height ?? 0;
  const rot = Math.abs(Number(v?.tags?.rotate ?? v?.side_data_list?.find((s) => s.rotation !== undefined)?.rotation ?? 0));
  if (rot === 90 || rot === 270) [w, h] = [h, w];
  return { durata: Number(j.format.duration), w, h, audio: Boolean(a) };
}

function haParlato(file) {
  // stima grossolana: se il volume massimo è sotto -45 dB consideriamo la clip muta
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-af', 'volumedetect', '-vn', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /max_volume:\s*(-?[\d.]+) dB/.exec(r.stderr || '');
  return m ? Number(m[1]) > -45 : false;
}

async function trascrivi(file) {
  const mp3 = file.replace(/\.[^.]+$/, '.audio.mp3');
  run('ffmpeg', ['-y', '-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '48k', mp3]);
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(mp3)]), path.basename(mp3));
  form.append('model', 'whisper-large-v3');
  form.append('language', 'it');
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');
  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }, body: form,
  });
  if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return (j.words || []).map((w) => ({ w: w.word, s: +w.start.toFixed(2), e: +w.end.toFixed(2) }));
}

function proxy(src, dst) {
  // proxy 1080p H.264: Remotion decodifica molto più in fretta che dal 4K
  run('ffmpeg', ['-y', '-v', 'error', '-i', src, '-vf', "scale='if(gt(iw,ih),1920,1080)':-2", '-c:v', 'libx264',
    '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', dst]);
}

function fotogrammi(src, nome, durata) {
  const n = Math.min(10, Math.max(3, Math.round(durata / 2)));
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = ((i + 0.5) * durata) / n;
    const jpg = path.join(WORK, 'frames', `${nome}_${t.toFixed(1)}s.jpg`);
    run('ffmpeg', ['-y', '-v', 'error', '-ss', String(t), '-i', src, '-frames:v', '1', '-vf', 'scale=360:-2', jpg]);
    out.push(path.relative(ROOT, jpg).replace(/\\/g, '/'));
  }
  return out;
}

// ---------- 3. Claude decide il montaggio ----------
function chiediPiano() {
  const prompt = fs.readFileSync(path.join(ROOT, 'scripts', 'prompt-regista.md'), 'utf8');
  const r = spawnSync('claude', ['-p', prompt, '--allowedTools', 'Read,Write', '--output-format', 'text'], {
    cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], timeout: 30 * 60 * 1000,
  });
  if (r.status !== 0) throw new Error(`claude terminato con codice ${r.status}`);
  log('Claude:', (r.stdout || '').slice(-1500));
  const piano = JSON.parse(fs.readFileSync(path.join(WORK, 'piano.json'), 'utf8'));
  validaPiano(piano);
  return piano;
}

function validaPiano(p) {
  const err = (m) => { throw new Error(`piano.json non valido: ${m}`); };
  if (!Array.isArray(p.clips) || p.clips.length === 0) err('nessuna clip');
  for (const c of p.clips) {
    if (!fs.existsSync(path.join(MEDIA, c.file))) err(`file inesistente ${c.file}`);
    if (!(c.end > c.start)) err(`clip ${c.file} con end <= start`);
  }
  if (!p.tavola || !p.soggetto) err('manca tavola/soggetto');
  p.keywords ??= [];
  p.flickers ??= [];
}

// ---------- 4. render ----------
function renderizza(out) {
  // Il primo render a volte fallisce per un errore transitorio del compositor
  // (visto nel test del 16/10): fino a 3 tentativi.
  for (let tentativo = 1; ; tentativo++) {
    try {
      run('npx', ['remotion', 'render', 'src/index.ts', 'Blueprint', out, `--props=${path.join(WORK, 'piano.json')}`,
        '--codec=h264', '--crf=20', '--concurrency=100%'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
      return;
    } catch (e) {
      if (tentativo >= 3) throw e;
      log(`render fallito (tentativo ${tentativo}), riprovo`);
    }
  }
}

// ---------- 5. notifica ----------
async function notifica(esito, nome, testo) {
  log(`${esito}: ${nome}\n${testo}`);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## ${esito} — ${nome}\n\n${testo}\n`);
  if (!process.env.NOTIFY_URL) return;
  try {
    await fetch(process.env.NOTIFY_URL, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-regista-token': process.env.NOTIFY_TOKEN || '' },
      body: JSON.stringify({ esito, nome, testo }),
    });
  } catch (e) { log('notifica fallita', e.message); }
}

// ---------- main ----------
async function main() {
  const job = trovaCartella();
  if (!job) { log('niente da fare'); return; }
  const { nome, files, vai } = job;
  log(`cartella: ${nome} (${files.length} file)`);
  fs.rmSync(WORK, { recursive: true, force: true });
  fs.rmSync(MEDIA, { recursive: true, force: true });
  fs.mkdirSync(path.join(WORK, 'in'), { recursive: true });
  fs.mkdirSync(path.join(WORK, 'frames'), { recursive: true });
  fs.mkdirSync(MEDIA, { recursive: true });

  try {
    rclone('copy', remote(IN_DIR, nome), path.join(WORK, 'in'), '--exclude', '*.XML', '--exclude', '*.xml', '--exclude', '*FINALE*');

    const briefFile = fs.existsSync(path.join(WORK, 'in', 'brief.txt')) ? fs.readFileSync(path.join(WORK, 'in', 'brief.txt'), 'utf8') : '';
    const brief = [briefFile, process.env.BRIEF_EXTRA ? `Dal telegram: ${process.env.BRIEF_EXTRA}` : ''].filter(Boolean).join('\n');
    const materiale = { cartella: nome, brief, video: [], foto: [] };

    for (const f of fs.readdirSync(path.join(WORK, 'in')).sort()) {
      const src = path.join(WORK, 'in', f);
      const ext = path.extname(f).toLowerCase();
      if (isVai(f)) continue;
      if (VIDEO_EXT.includes(ext)) {
        const info = probe(src);
        const base = path.parse(f).name;
        const file = `${base}.mp4`;
        log(`proxy ${f} (${info.durata.toFixed(1)} s, ${info.w}x${info.h})`);
        proxy(src, path.join(MEDIA, file));
        const parlato = info.audio && haParlato(src);
        const parole = parlato && process.env.GROQ_API_KEY ? await trascrivi(path.join(MEDIA, file)) : [];
        materiale.video.push({
          file, durata: +info.durata.toFixed(2), orient: info.w > info.h ? 'h' : 'v',
          parole, frames: fotogrammi(path.join(MEDIA, file), base, info.durata),
        });
      } else if (IMAGE_EXT.includes(ext)) {
        materiale.foto.push(f);
      }
    }
    if (materiale.video.length === 0) throw new Error('nessun video nella cartella');
    fs.writeFileSync(path.join(WORK, 'materiale.json'), JSON.stringify(materiale, null, 1));

    const piano = chiediPiano();
    const finale = `${nome} - FINALE.mp4`;
    const outFile = path.join(ROOT, 'out', finale);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    renderizza(outFile);

    const durata = probe(outFile).durata.toFixed(1);
    const note = [
      `Montato automaticamente il ${new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}`,
      `Durata: ${durata} s · ${piano.tavola}`,
      `Parole chiave: ${piano.keywords.map((k) => `${k.word} @${k.at}s`).join(', ') || '—'}`,
      piano.note ? `Note: ${piano.note}` : '',
    ].filter(Boolean).join('\n');
    fs.writeFileSync(path.join(WORK, 'NOTE.txt'), note);

    rclone('copyto', outFile, remote(IN_DIR, nome, finale));
    rclone('copyto', path.join(WORK, 'NOTE.txt'), remote(IN_DIR, nome, 'NOTE.txt'));
    if (vai) rclone('moveto', remote(IN_DIR, nome, vai), remote(IN_DIR, nome, `_VAI_usato_${vai}`));
    rclone('moveto', remote(IN_DIR, nome), remote(OUT_DIR, nome));
    await notifica('✅ pronto', nome, note);
  } catch (e) {
    const testo = `Errore: ${e.message}\n\n` + (vai ? `Per riprovare rinomina _VAI_usato_${vai} in ${vai}, oppure /monta ${nome} dal bot.` : `Per riprovare: /monta ${nome} dal bot.`);
    fs.mkdirSync(WORK, { recursive: true });
    fs.writeFileSync(path.join(WORK, 'ERRORE.txt'), testo);
    try {
      rclone('copyto', path.join(WORK, 'ERRORE.txt'), remote(IN_DIR, nome, 'ERRORE.txt'));
      if (vai) rclone('moveto', remote(IN_DIR, nome, vai), remote(IN_DIR, nome, `_VAI_usato_${vai}`));
    } catch (e2) { log('impossibile scrivere ERRORE su Drive', e2.message); }
    await notifica('⚠️ non montato', nome, testo);
    process.exitCode = 1;
  }
}

main();
