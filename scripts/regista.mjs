// Regista automatico: prende UNA cartella da "97 - Editare" su Drive che contiene
// un file VAI, prepara il materiale, fa decidere il montaggio a Claude,
// renderizza con Remotion e rimette il risultato su Drive in "98 - Fatti".
//
// Requisiti nell'ambiente (GitHub Actions o PC):
//   rclone configurato con un remote chiamato "gdrive" (account denisnusinovic)
//   ffmpeg / ffprobe nel PATH
//   GROQ_API_KEY            trascrizione Whisper
//   CLAUDE_CODE_OAUTH_TOKEN Claude Code con l'abbonamento (comando `claude`)
//   NOTIFY_URL / NOTIFY_TOKEN (opzionali) bot Telegram: fasi, esito, anteprima video
//
// Modalità correzione (dal bottone ✏️ del bot): ORIGINE=98, CARTELLA=<nome>,
// CORREZIONE=<testo>. Riparte dal piano salvato in 98 - Fatti/<nome>/_regista/
// e produce "<nome> - FINALE v2.mp4" (v3, ...) nella stessa cartella.

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const REMOTE = process.env.REGISTA_REMOTE || 'gdrive';
const IN_DIR = '97 - Editare';
const OUT_DIR = '98 - Fatti';
const CORREZIONE = (process.env.CORREZIONE || '').trim();
const SRC_DIR = process.env.ORIGINE === '98' || CORREZIONE ? OUT_DIR : IN_DIR;
const CACHE = '_regista'; // sottocartella con piano.json e materiale.json di ogni video
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
// file generati da noi o segnali: mai materiale di montaggio
const isNostro = (name) => isVai(name) || /^_VAI_usato_/i.test(name) || /FINALE/i.test(name) || /^(NOTE|ERRORE|_ERRORE.*)\.txt$/i.test(name);

// ---------- 1. trova la cartella da fare ----------
function trovaCartella() {
  // avvio da Telegram/manuale con cartella esplicita: VAI non obbligatorio
  if (process.env.CARTELLA) {
    const nome = process.env.CARTELLA;
    const files = JSON.parse(rclone('lsjson', remote(SRC_DIR, nome), '--files-only'));
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
  let prompt = fs.readFileSync(path.join(ROOT, 'scripts', 'prompt-regista.md'), 'utf8');
  if (CORREZIONE && fs.existsSync(path.join(WORK, 'piano_precedente.json'))) {
    prompt += `\n\n## MODALITÀ CORREZIONE\nEsiste già un montaggio: \`work/piano_precedente.json\`. Denis l'ha guardato e chiede queste modifiche:\n\n> ${CORREZIONE.replace(/\n/g, '\n> ')}\n\nParti dal piano precedente e applica SOLO quello che chiede, lasciando invariato il resto (stessi tagli, tempi e parole chiave dove non li tocca). Se una modifica sposta i tempi (es. accorcia l'hook), ricalcola gli \`at\` di parole chiave e flicker successivi. Scrivi il risultato in \`work/piano.json\` e nella \`note\` elenca in breve cosa hai cambiato.`;
  }
  const r = spawnSync('claude', ['-p', prompt, '--allowedTools', 'Read,Write', '--output-format', 'json'], {
    cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], timeout: 30 * 60 * 1000, maxBuffer: 1 << 26,
  });
  if (r.status !== 0) throw new Error(`claude terminato con codice ${r.status}`);
  try {
    const j = JSON.parse(r.stdout || '{}');
    log('Claude:', String(j.result || '').slice(-1500));
    const u = j.usage || {};
    consumi.claude = {
      input: (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0),
      output: u.output_tokens || 0,
      usd: j.total_cost_usd,
      turni: j.num_turns,
    };
  } catch { log('Claude (output non JSON):', (r.stdout || '').slice(-1500)); }
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

// ---------- 5. notifiche (bot Telegram) ----------
const RUN_URL = process.env.GITHUB_RUN_ID
  ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
  : undefined;
const T0 = Date.now();
// cosa è costato il giro: token Claude, secondi di audio a Groq, minuti di Actions
const consumi = { claude: null, groqSec: 0 };
const kTok = (n) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
function rigaConsumi() {
  const c = consumi.claude;
  const parti = [];
  if (c) parti.push(`🧠 Claude ${kTok(c.input)} token letti + ${kTok(c.output)} scritti${c.usd != null ? ` (≈ $${c.usd.toFixed(2)} se fosse API; con l'abbonamento consuma il limite d'uso)` : ''}`);
  if (consumi.groqSec) parti.push(`🎙️ Groq ${Math.round(consumi.groqSec / 60)} min di audio`);
  parti.push(`⏱️ GitHub Actions ~${Math.ceil((Date.now() - T0) / 60000) + 2} min`);
  return `Consumi: ${parti.join(' · ')}`;
}
const trascorso = () => `${Math.round((Date.now() - T0) / 60000)} min`;

async function invia(payload) {
  if (!process.env.NOTIFY_URL) return;
  try {
    await fetch(process.env.NOTIFY_URL, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-regista-token': process.env.NOTIFY_TOKEN || '' },
      body: JSON.stringify({ run_url: RUN_URL, run_id: process.env.GITHUB_RUN_ID, ...payload }),
    });
  } catch (e) { log('notifica fallita', e.message); }
}

// messaggio silenzioso a ogni fase
const fase = (nome, testo) => { log(`[fase] ${testo}`); return invia({ tipo: 'fase', nome, testo: `${testo} (${trascorso()})` }); };

async function notifica(esito, nome, testo, { ok = false, foto } = {}) {
  log(`${esito}: ${nome}\n${testo}`);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## ${esito} — ${nome}\n\n${testo}\n`);
  await invia({ tipo: 'esito', esito, nome, testo, ok, foto });
}

// anteprima: il fotogramma a metà della prima parola chiave (o a 1/3 del video)
function anteprima(outFile, piano, durata) {
  const k = piano.keywords?.[0];
  const t = k ? Math.min(durata - 0.1, k.at + Math.min(1, k.dur / 2)) : durata / 3;
  const jpg = path.join(WORK, 'anteprima.jpg');
  try {
    run('ffmpeg', ['-y', '-v', 'error', '-ss', String(t), '-i', outFile, '-frames:v', '1', '-vf', 'scale=540:-2', '-q:v', '4', jpg]);
    return fs.readFileSync(jpg).toString('base64');
  } catch { return undefined; }
}

const mb = (bytes) => (bytes / 1e6 >= 1000 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`);

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
    const media = files.filter((f) => VIDEO_EXT.concat(IMAGE_EXT).includes(path.extname(f.Name).toLowerCase()) && !isNostro(f.Name));
    const peso = media.reduce((s, f) => s + (f.Size || 0), 0);
    await fase(nome, `${CORREZIONE ? '✏️ Correzione · ' : ''}📥 Scarico ${media.length} file (${mb(peso)})`);
    // solo il materiale: niente sottocartelle (_regista), niente video finali/note/segnali
    rclone('copy', remote(SRC_DIR, nome), path.join(WORK, 'in'), '--max-depth', '1',
      '--exclude', '*.XML', '--exclude', '*.xml', '--exclude', '*FINALE*', '--exclude', '_VAI_usato_*', '--exclude', '*.txt');
    rclone('copy', remote(SRC_DIR, nome), path.join(WORK, 'in'), '--max-depth', '1', '--include', 'brief.txt');

    // cache del giro precedente (trascrizioni già fatte, piano da correggere)
    let cache = null;
    try {
      rclone('copy', remote(SRC_DIR, nome, CACHE), path.join(WORK, 'cache'));
      if (fs.existsSync(path.join(WORK, 'cache', 'materiale.json'))) cache = JSON.parse(fs.readFileSync(path.join(WORK, 'cache', 'materiale.json'), 'utf8'));
      if (fs.existsSync(path.join(WORK, 'cache', 'piano.json'))) fs.copyFileSync(path.join(WORK, 'cache', 'piano.json'), path.join(WORK, 'piano_precedente.json'));
    } catch { /* primo giro: nessuna cache */ }
    if (CORREZIONE && !fs.existsSync(path.join(WORK, 'piano_precedente.json'))) {
      throw new Error('non trovo il piano del montaggio precedente (_regista/piano.json): rifaccio da zero con /monta');
    }
    await fase(nome, '🎞️ Preparo i video (copie 1080p, trascrizione, fotogrammi)');

    const briefFile = fs.existsSync(path.join(WORK, 'in', 'brief.txt')) ? fs.readFileSync(path.join(WORK, 'in', 'brief.txt'), 'utf8') : '';
    const brief = [briefFile, process.env.BRIEF_EXTRA ? `Dal telegram: ${process.env.BRIEF_EXTRA}` : '', cache?.brief && CORREZIONE ? cache.brief : '']
      .filter(Boolean).join('\n');
    const materiale = { cartella: nome, brief, video: [], foto: [] };

    for (const f of fs.readdirSync(path.join(WORK, 'in')).sort()) {
      const src = path.join(WORK, 'in', f);
      const ext = path.extname(f).toLowerCase();
      if (isNostro(f) || fs.statSync(src).isDirectory()) continue;
      if (VIDEO_EXT.includes(ext)) {
        const info = probe(src);
        const base = path.parse(f).name;
        const file = `${base}.mp4`;
        log(`proxy ${f} (${info.durata.toFixed(1)} s, ${info.w}x${info.h})`);
        proxy(src, path.join(MEDIA, file));
        const giaFatto = cache?.video?.find((v) => v.file === file);
        let parole = giaFatto?.parole;
        if (!parole) {
          const parlato = info.audio && haParlato(src);
          parole = parlato && process.env.GROQ_API_KEY ? await trascrivi(path.join(MEDIA, file)) : [];
          if (parlato && process.env.GROQ_API_KEY) consumi.groqSec += info.durata;
        }
        materiale.video.push({
          file, durata: +info.durata.toFixed(2), orient: info.w > info.h ? 'h' : 'v',
          parole, frames: fotogrammi(path.join(MEDIA, file), base, info.durata),
        });
      } else if (IMAGE_EXT.includes(ext)) {
        materiale.foto.push(f);
      }
      fs.rmSync(src, { force: true }); // l'originale 4K non serve più: libera disco sul runner
    }
    if (materiale.video.length === 0) throw new Error('nessun video nella cartella');
    fs.writeFileSync(path.join(WORK, 'materiale.json'), JSON.stringify(materiale, null, 1));

    const conParlato = materiale.video.filter((v) => v.parole.length).length;
    await fase(nome, CORREZIONE ? `🧠 Claude applica la correzione: “${CORREZIONE.slice(0, 120)}”`
      : `🧠 Claude sceglie i tagli (${materiale.video.length} video, ${conParlato} con parlato${brief ? ', con brief' : ''})`);
    const piano = chiediPiano();
    const durataPiano = piano.clips.reduce((s, c) => s + (c.end - c.start), 0);
    await fase(nome, `🎬 Render: ${durataPiano.toFixed(0)} s, ${piano.clips.length} tagli, ${piano.keywords.length} parole chiave`);

    // nome con versione: FINALE, FINALE v2, FINALE v3...
    const versioni = files.filter((f) => /FINALE( v\d+)?\.mp4$/i.test(f.Name)).length;
    const finale = `${nome} - FINALE${versioni ? ` v${versioni + 1}` : ''}.mp4`;
    const outFile = path.join(ROOT, 'out', finale);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    renderizza(outFile);
    await fase(nome, '📤 Carico su Drive');

    const durataN = probe(outFile).durata;
    const durata = durataN.toFixed(1);
    const note = [
      `${CORREZIONE ? `Correzione (“${CORREZIONE}”)` : 'Montato automaticamente'} il ${new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' })} in ${trascorso()}`,
      `Durata: ${durata} s · ${piano.tavola} · ${piano.clips.length} tagli`,
      `Parole chiave: ${piano.keywords.map((k) => `${k.word} @${k.at}s`).join(', ') || '—'}`,
      piano.note ? `Note: ${piano.note}` : '',
      `File: 98 - Fatti/${nome}/${finale}`,
      rigaConsumi(),
    ].filter(Boolean).join('\n');
    fs.writeFileSync(path.join(WORK, 'NOTE.txt'), note);

    rclone('copyto', outFile, remote(SRC_DIR, nome, finale));
    rclone('copyto', path.join(WORK, 'NOTE.txt'), remote(SRC_DIR, nome, 'NOTE.txt'));
    rclone('copyto', path.join(WORK, 'piano.json'), remote(SRC_DIR, nome, CACHE, 'piano.json'));
    rclone('copyto', path.join(WORK, 'materiale.json'), remote(SRC_DIR, nome, CACHE, 'materiale.json'));
    if (vai) rclone('moveto', remote(SRC_DIR, nome, vai), remote(SRC_DIR, nome, `_VAI_usato_${vai}`));
    if (SRC_DIR === IN_DIR) rclone('moveto', remote(IN_DIR, nome), remote(OUT_DIR, nome));

    // anteprima: prima provo il video in chat, se non passa mando la foto
    const inviato = await inviaVideo(outFile, nome, note, durataN);
    if (!inviato) await notifica('✅ pronto', nome, note, { ok: true, foto: anteprima(outFile, piano, durataN) });
  } catch (e) {
    const testo = `Errore: ${e.message}\n\n` + (CORREZIONE ? 'Puoi riprovare la correzione dal bot (✏️) o scrivermi una richiesta diversa.'
      : vai ? `Per riprovare rinomina _VAI_usato_${vai} in ${vai}, oppure 🔁 Riprova.` : 'Per riprovare: 🔁 Riprova.');
    fs.mkdirSync(WORK, { recursive: true });
    fs.writeFileSync(path.join(WORK, 'ERRORE.txt'), testo);
    try {
      rclone('copyto', path.join(WORK, 'ERRORE.txt'), remote(SRC_DIR, nome, 'ERRORE.txt'));
      if (vai) rclone('moveto', remote(SRC_DIR, nome, vai), remote(SRC_DIR, nome, `_VAI_usato_${vai}`));
    } catch (e2) { log('impossibile scrivere ERRORE su Drive', e2.message); }
    await notifica('⚠️ non montato', nome, testo);
    process.exitCode = 1;
  }
}

// Video di anteprima per Telegram: i bot possono inviare al massimo 50 MB,
// quindi 720p con bitrate calcolato per stare sotto ~45 MB.
async function inviaVideo(outFile, nome, testo, durata) {
  if (!process.env.NOTIFY_URL) return false;
  try {
    const anteprimaMp4 = path.join(WORK, 'anteprima.mp4');
    const kbps = Math.max(600, Math.min(4000, Math.floor((45 * 8 * 1000) / Math.max(1, durata)) - 160));
    run('ffmpeg', ['-y', '-v', 'error', '-i', outFile, '-vf', 'scale=720:-2', '-c:v', 'libx264', '-preset', 'veryfast',
      '-b:v', `${kbps}k`, '-maxrate', `${kbps}k`, '-bufsize', `${kbps * 2}k`, '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', anteprimaMp4]);
    const size = fs.statSync(anteprimaMp4).size;
    if (size > 49 * 1e6) { log(`anteprima troppo grande (${mb(size)})`); return false; }
    const form = new FormData();
    form.append('nome', nome);
    form.append('testo', testo);
    form.append('durata', String(durata));
    form.append('run_id', process.env.GITHUB_RUN_ID || '');
    form.append('run_url', RUN_URL || '');
    form.append('video', new Blob([fs.readFileSync(anteprimaMp4)], { type: 'video/mp4' }), 'anteprima.mp4');
    const url = process.env.NOTIFY_URL.replace(/\/notify$/, '/video');
    const r = await fetch(url, { method: 'POST', headers: { 'x-regista-token': process.env.NOTIFY_TOKEN || '' }, body: form });
    log(`anteprima video: ${r.status} (${mb(size)})`);
    return r.ok;
  } catch (e) {
    log('anteprima video fallita', e.message);
    return false;
  }
}

main();
