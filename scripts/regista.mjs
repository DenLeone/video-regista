// Regista automatico: prende UNA cartella da "97 - Editare" su Drive che contiene
// un file VAI, prepara il materiale, fa decidere la regia all'AI,
// renderizza con Remotion e rimette il risultato su Drive in "98 - Fatti".
//
// Requisiti nell'ambiente (GitHub Actions o PC):
//   rclone configurato con un remote chiamato "gdrive" (account denisnusinovic)
//   ffmpeg / ffprobe nel PATH
//   GROQ_API_KEY            trascrizione Whisper
//   CLAUDE_CODE_OAUTH_TOKEN Claude Code con l'abbonamento (comando `claude`)
//   GEMINI_API_KEY          (opzionale) riserva se Claude non risponde (limiti d'uso)
//   REGISTA_AI              auto (default) | claude | gemini
//   REGISTA_MODEL           modello Claude (default sonnet) · GEMINI_MODEL (default gemini-flash-latest)
//   NOTIFY_URL / NOTIFY_TOKEN (opzionali) bot Telegram: fasi, esito, anteprima video
//
// Modalità correzione (dal bottone ✏️ del bot): ORIGINE=98, CARTELLA=<nome>,
// CORREZIONE=<testo>. Riparte dalla regia salvata in 98 - Fatti/<nome>/_regista/
// e produce "<nome> - FINALE v2.mp4" (v3, ...) nella stessa cartella.

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { frasi, inviluppo, sincronizza, sogliaVoce } from './audio.mjs';
import { materialePerAI, risolviRegia } from './regia.mjs';
import { AUDIO_EXT, IMAGE_EXT, NOMI_DISPOSITIVO, VIDEO_EXT, dispositivo, prioritaAudio, tagsPiatti } from './sorgenti.mjs';

const REMOTE = process.env.REGISTA_REMOTE || 'gdrive';
const IN_DIR = '97 - Editare';
const OUT_DIR = '98 - Fatti';
const CORREZIONE = (process.env.CORREZIONE || '').trim();
const SRC_DIR = process.env.ORIGINE === '98' || CORREZIONE ? OUT_DIR : IN_DIR;
const CACHE = '_regista'; // sottocartella con regia.json, piano.json e materiale.json di ogni video
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const WORK = path.join(ROOT, 'work');
const MEDIA = path.join(ROOT, 'public', 'media');

const log = (...a) => console.log('[regista]', ...a);
// con stdio 'inherit' execFileSync restituisce null: non va trattato come errore
const run = (cmd, args, opts = {}) => String(execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1 << 28, ...opts }) ?? '');
const rclone = (...args) => run('rclone', args);
const remote = (...parts) => `${REMOTE}:${parts.join('/')}`;
const isVai = (name) => path.parse(name).name.toUpperCase() === 'VAI';

// fetch con nuovi tentativi: tra una chiamata e l'altra passano minuti di ffmpeg e
// la connessione tenuta aperta da Node viene chiusa dal server ("fetch failed").
async function fetchRiprova(url, opts = {}, tentativi = 4) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { ...opts, headers: { connection: 'close', ...(opts.headers || {}) }, signal: AbortSignal.timeout(5 * 60 * 1000) });
      if (r.status >= 500 || r.status === 429) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
      return r;
    } catch (e) {
      const causa = e.cause ? ` (${e.cause.code || e.cause.message || e.cause})` : '';
      if (i >= tentativi) throw new Error(`${new URL(url).host}: ${e.message}${causa}`);
      log(`chiamata a ${new URL(url).host} fallita (${e.message}${causa}), riprovo ${i}/${tentativi - 1}`);
      await new Promise((ok) => setTimeout(ok, 5000 * i));
    }
  }
}
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

// ---------- 2. prepara il materiale ----------
function probe(file) {
  const j = JSON.parse(run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file]));
  const v = j.streams.find((s) => s.codec_type === 'video');
  const a = j.streams.find((s) => s.codec_type === 'audio');
  let w = v?.width ?? 0, h = v?.height ?? 0;
  const rot = Math.abs(Number(v?.tags?.rotate ?? v?.side_data_list?.find((s) => s.rotation !== undefined)?.rotation ?? 0));
  if (rot === 90 || rot === 270) [w, h] = [h, w];
  return { durata: Number(j.format.duration), w, h, audio: Boolean(a), video: Boolean(v), tags: tagsPiatti(j) };
}

async function trascrivi(file) {
  const mp3 = path.join(WORK, `${path.parse(file).name}.trascrizione.mp3`);
  run('ffmpeg', ['-y', '-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '48k', mp3]);
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(mp3)]), path.basename(mp3));
  form.append('model', 'whisper-large-v3');
  form.append('language', 'it');
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');
  const res = await fetchRiprova('https://api.groq.com/openai/v1/audio/transcriptions', {
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

// traccia voce in WAV: Remotion la legge con tempi esatti
const estraiVoce = (src, dst) => run('ffmpeg', ['-y', '-v', 'error', '-i', src, '-vn', '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', dst]);

const FONT = ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 'C:/Windows/Fonts/arialbd.ttf'].find((p) => fs.existsSync(p));

// Fogli provino: fino a 32 riquadri per clip, 16 per foglio, col tempo scritto sopra.
// offset: tempo scritto = tempo nella clip - offset (per le camere sincronizzate = tempo della voce)
function fogliProvino(file, id, durata, offset = 0) {
  const n = Math.min(32, Math.max(4, Math.ceil(durata / 1.5)));
  const passo = durata / n;
  const dir = path.join(WORK, 'fogli', '_riquadri', id);
  fs.mkdirSync(dir, { recursive: true });
  let etichette = Boolean(FONT);
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) * passo;
    const out = path.join(dir, `${String(k).padStart(3, '0')}.jpg`);
    const scritta = `${(t - offset).toFixed(1)}s`;
    const filtro = etichette
      ? `scale=240:-2,drawtext=fontfile='${FONT.replace(/:/g, '\\:')}':text='${scritta}':x=6:y=6:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.65:boxborderw=4`
      : 'scale=240:-2';
    try { run('ffmpeg', ['-y', '-v', 'error', '-ss', t.toFixed(2), '-i', file, '-frames:v', '1', '-vf', filtro, '-q:v', '4', out]); }
    catch (e) {
      if (!etichette) throw e;
      etichette = false; k--; // drawtext non disponibile: rifaccio senza scritte
    }
  }
  const fogli = [];
  for (let s = 0; s * 16 < n; s++) {
    const foglio = path.join(WORK, 'fogli', `${id}-${s + 1}.jpg`);
    run('ffmpeg', ['-y', '-v', 'error', '-start_number', String(s * 16), '-i', path.join(dir, '%03d.jpg'),
      '-frames:v', '1', '-vf', 'tile=4x4:padding=4:color=black', '-q:v', '4', foglio]);
    fogli.push(path.relative(ROOT, foglio).replace(/\\/g, '/'));
  }
  return { fogli, passo: +passo.toFixed(1), etichette };
}

// ---------- 3. l'AI scrive la regia ----------
function promptRegia({ modo, testoMateriale, regiaPrecedente }) {
  let p = fs.readFileSync(path.join(ROOT, 'scripts', 'prompt-regista.md'), 'utf8');
  if (regiaPrecedente) {
    p += `\n\n## MODALITÀ CORREZIONE\nEsiste già un montaggio, questa è la sua regia:\n\`\`\`json\n${JSON.stringify(regiaPrecedente, null, 1)}\n\`\`\`\nDenis l'ha guardato e chiede queste modifiche:\n\n> ${CORREZIONE.replace(/\n/g, '\n> ')}\n\nParti da questa regia e applica SOLO quello che chiede, lasciando invariato il resto. I tempi li ricalcola lo script. Nella \`note\` elenca in breve cosa hai cambiato.`;
  }
  p += modo === 'claude'
    ? '\n\n## Come consegnare\nGuarda i fogli provino (tutti nello stesso turno), poi scrivi la regia con lo strumento Write in `work/regia.json` e rispondi con 3 righe di riepilogo.'
    : '\n\n## Come consegnare\nI fogli provino sono allegati in ordine, ognuno preceduto dal suo nome. Rispondi SOLO con il JSON della regia.';
  return `${p}\n\n---\n\n${testoMateriale}\n`;
}

const consumi = { ai: null, groqSec: 0, stima: null };

// Stima prima dell'invio, per Claude: testo ≈ 1 token ogni 3,5 caratteri; immagini come le
// conta Claude (lato lungo ridotto a 1568 px, token ≈ pixel / 750). È il peso di UN passaggio:
// Claude Code rilegge il contesto a ogni passaggio, quindi il totale reale è più alto.
function stimaToken(testo, fogli) {
  let immagini = 0;
  for (const f of fogli) {
    try {
      const [w, h] = run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', path.join(ROOT, f)])
        .trim().split(',').map(Number);
      const s = Math.min(1, 1568 / Math.max(w, h));
      immagini += Math.round((w * s * h * s) / 750);
    } catch { immagini += 1800; }
  }
  return { testo: Math.round(testo.length / 3.5), immagini, totale: Math.round(testo.length / 3.5) + immagini };
}

function regiaConClaude(prompt) {
  const modello = process.env.REGISTA_MODEL || 'sonnet';
  fs.rmSync(path.join(WORK, 'regia.json'), { force: true });
  // il testo lungo passa da stdin: niente limiti di lunghezza della riga di comando
  const r = spawnSync('claude', ['-p', 'Segui le istruzioni e usa il materiale ricevuti in input.', '--model', modello,
    '--allowedTools', 'Read,Write', '--output-format', 'json'], {
    cwd: ROOT, encoding: 'utf8', input: prompt, stdio: ['pipe', 'pipe', 'pipe'], timeout: 30 * 60 * 1000, maxBuffer: 1 << 26,
  });
  let j = {};
  try { j = JSON.parse(r.stdout || '{}'); } catch { /* output non JSON */ }
  if (r.status !== 0 || j.is_error) {
    const motivo = String(j.result || r.stderr || r.stdout || r.error?.message || '').trim().slice(-400);
    throw new Error(`Claude non ha risposto (codice ${r.status}): ${motivo}`);
  }
  log('Claude:', String(j.result || '').slice(-1500));
  const u = j.usage || {};
  consumi.ai = {
    chi: 'Claude', modello: Object.keys(j.modelUsage || {}).join('+') || modello,
    input: (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0),
    output: u.output_tokens || 0, usd: j.total_cost_usd, turni: j.num_turns,
  };
  return JSON.parse(fs.readFileSync(path.join(WORK, 'regia.json'), 'utf8'));
}

async function regiaConGemini(prompt, fogli) {
  const modello = process.env.GEMINI_MODEL || 'gemini-flash-latest';
  const parts = [{ text: prompt }];
  for (const f of fogli) {
    parts.push({ text: `Foglio provino ${f}:` });
    parts.push({ inline_data: { mime_type: 'image/jpeg', data: fs.readFileSync(path.join(ROOT, f)).toString('base64') } });
  }
  const contents = [{ role: 'user', parts }];
  const base = `https://generativelanguage.googleapis.com/v1beta/models/${modello}`;
  const headers = { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY };
  // conteggio esatto prima dell'invio: countTokens non consuma quota
  try {
    const c = await fetchRiprova(`${base}:countTokens`, { method: 'POST', headers, body: JSON.stringify({ contents }) }, 2);
    if (c.ok) { const t = (await c.json()).totalTokens; consumi.stima = { totale: t, esatta: true }; log(`Gemini: ${t} token da inviare`); }
  } catch (e) { log('conteggio token Gemini non riuscito', e.message); }
  const r = await fetchRiprova(`${base}:generateContent`, {
    method: 'POST', headers,
    body: JSON.stringify({ contents, generationConfig: { responseMimeType: 'application/json', temperature: 0.4 } }),
  });
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const limiti = [...r.headers].filter(([k]) => /ratelimit/i.test(k));
  if (limiti.length) log('Gemini limiti:', limiti.map(([k, v]) => `${k}=${v}`).join(' '));
  const j = await r.json();
  const testo = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  const u = j.usageMetadata || {};
  consumi.ai = { chi: 'Gemini', modello: j.modelVersion || modello, input: u.promptTokenCount || 0, output: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0) };
  const regia = JSON.parse(testo.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  fs.writeFileSync(path.join(WORK, 'regia.json'), JSON.stringify(regia, null, 1));
  return regia;
}

async function chiediRegia(testoMateriale, fogli, regiaPrecedente) {
  const modo = (process.env.REGISTA_AI || 'auto').toLowerCase();
  const gemini = Boolean(process.env.GEMINI_API_KEY);
  if (modo === 'gemini') return regiaConGemini(promptRegia({ modo: 'gemini', testoMateriale, regiaPrecedente }), fogli);
  try {
    return regiaConClaude(promptRegia({ modo: 'claude', testoMateriale, regiaPrecedente }));
  } catch (e) {
    if (modo !== 'auto' || !gemini) throw e;
    log(`${e.message}\n→ passo a Gemini`);
    await fase(job.nome, '🔁 Claude non disponibile, uso Gemini', 'regia');
    return regiaConGemini(promptRegia({ modo: 'gemini', testoMateriale, regiaPrecedente }), fogli);
  }
}

function validaPiano(p) {
  const err = (m) => { throw new Error(`piano non valido: ${m}`); };
  if (!Array.isArray(p.clips) || p.clips.length === 0) err('nessuna clip');
  for (const c of p.clips) {
    if (!fs.existsSync(path.join(MEDIA, c.file))) err(`file inesistente ${c.file}`);
    if (c.audio && !fs.existsSync(path.join(MEDIA, c.audio.file))) err(`audio inesistente ${c.audio.file}`);
    if (!(c.end > c.start)) err(`clip ${c.file} con end <= start`);
  }
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
const kTok = (n) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
function rigaConsumi() {
  const c = consumi.ai;
  const parti = [];
  if (c) {
    const extra = c.chi === 'Claude'
      ? `${c.turni ? `, ${c.turni} passaggi` : ''}${c.usd != null ? ` (≈ $${c.usd.toFixed(2)} se fosse API; con l'abbonamento consuma il limite d'uso)` : ''}`
      : ' (API Gemini)';
    parti.push(`🧠 ${c.chi} ${c.modello}: ${kTok(c.input)} token letti + ${kTok(c.output)} scritti${extra}`);
  }
  if (consumi.stima) parti.push(`📏 materiale ${consumi.stima.esatta ? '' : '≈ '}${kTok(consumi.stima.totale)} token`);
  if (consumi.groqSec) parti.push(`🎙️ Groq ${Math.round(consumi.groqSec / 60)} min di audio`);
  parti.push(`⏱️ GitHub Actions ~${Math.ceil((Date.now() - T0) / 60000) + 2} min`);
  return `Consumi: ${parti.join(' · ')}`;
}
const trascorso = () => `${Math.round((Date.now() - T0) / 60000)} min`;

async function invia(payload) {
  if (!process.env.NOTIFY_URL) return;
  try {
    await fetchRiprova(process.env.NOTIFY_URL, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-regista-token': process.env.NOTIFY_TOKEN || '' },
      body: JSON.stringify({ run_url: RUN_URL, run_id: process.env.GITHUB_RUN_ID, origine: SRC_DIR === OUT_DIR ? '98' : '97', ...payload }),
    });
  } catch (e) { log('notifica fallita', e.message); }
}

// a ogni fase il bot aggiorna la sua scheda di avanzamento (scarico, prepara, regia, render, carico)
let ultimaFase = '';
const VERSIONE = 'v2';
const fase = (nome, testo, step) => {
  log(`[fase] ${testo}`);
  if (step) ultimaFase = step;
  return invia({ tipo: 'fase', nome, testo: `${testo} (${trascorso()})`, step, minuti: Math.round((Date.now() - T0) / 60000), versione: VERSIONE });
};

async function notifica(esito, nome, testo, { ok = false, foto, info } = {}) {
  log(`${esito}: ${nome}\n${testo}`);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## ${esito} — ${nome}\n\n${testo}\n`);
  await invia({ tipo: 'esito', esito, nome, testo, ok, foto, info, step: ultimaFase, minuti: Math.round((Date.now() - T0) / 60000) });
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

// ---------- analisi: sorgenti, audio principale, sincronizzazione, frasi ----------
export async function analizza(nome, brief, cache) {
  const parolePrecedenti = (file) => (file ? (cache?.sorgenti || cache?.video || []).find((v) => v.file === file || v.voce === file)?.parole : undefined);
  const sorgenti = [];
  const foto = [];
  const idUsati = new Set();
  for (const f of fs.readdirSync(path.join(WORK, 'in')).sort()) {
    const src = path.join(WORK, 'in', f);
    const ext = path.extname(f).toLowerCase();
    if (isNostro(f) || fs.statSync(src).isDirectory()) continue;
    let id = path.parse(f).name;
    while (idUsati.has(id.toLowerCase())) id += '_b';
    idUsati.add(id.toLowerCase());
    if (VIDEO_EXT.includes(ext)) {
      const info = probe(src);
      if (!info.video) continue;
      const disp = dispositivo(f, info.tags);
      log(`proxy ${f} (${NOMI_DISPOSITIVO[disp]}, ${info.durata.toFixed(1)} s, ${info.w}x${info.h})`);
      proxy(src, path.join(MEDIA, `${id}.mp4`));
      sorgenti.push({ id, file: `${id}.mp4`, tipo: 'video', dispositivo: disp, nomeDispositivo: NOMI_DISPOSITIVO[disp],
        durata: +info.durata.toFixed(2), orient: info.w > info.h ? 'h' : 'v', haAudio: info.audio });
    } else if (AUDIO_EXT.includes(ext)) {
      const info = probe(src);
      log(`audio ${f} (mic esterno, ${info.durata.toFixed(1)} s)`);
      estraiVoce(src, path.join(MEDIA, `${id}.voce.wav`));
      sorgenti.push({ id, file: null, voce: `${id}.voce.wav`, tipo: 'audio', dispositivo: 'mic', nomeDispositivo: NOMI_DISPOSITIVO.mic,
        durata: +info.durata.toFixed(2), haAudio: true });
    } else if (IMAGE_EXT.includes(ext)) {
      foto.push(f);
    }
    fs.rmSync(src, { force: true }); // l'originale 4K non serve più: libera disco sul runner
  }
  if (!sorgenti.some((s) => s.tipo === 'video')) throw new Error('nessun video nella cartella');

  // correzione: stesse frasi e stessa sincronizzazione del montaggio da correggere,
  // così gli id F001... della regia precedente puntano agli stessi pezzi
  if (CORREZIONE && cache?.frasi?.length) {
    for (const s of sorgenti) {
      const c = cache.sorgenti?.find((x) => x.id === s.id);
      if (!c) continue;
      Object.assign(s, { principale: c.principale, sync: c.sync, parlato: c.parlato, parole: c.parole });
      if (c.principale) { s.voce = c.voce; if (!fs.existsSync(path.join(MEDIA, s.voce))) estraiVoce(path.join(MEDIA, s.file), path.join(MEDIA, s.voce)); }
    }
    for (const s of sorgenti.filter((x) => x.tipo === 'video')) {
      const fp = fogliProvino(path.join(MEDIA, s.file), s.id, s.durata, s.sync ? s.sync.offset : 0);
      s.fogli = fp.fogli; s.passoFogli = fp.passo;
    }
    return { cartella: nome, brief, sorgenti, frasi: cache.frasi, foto };
  }

  // inviluppi audio (dal proxy o dalla traccia voce) e rilevamento parlato
  const db = new Map();
  for (const s of sorgenti) {
    if (!s.haAudio) continue;
    const e = inviluppo(path.join(MEDIA, s.voce || s.file));
    if (!e) continue;
    db.set(s.id, e);
    s.parlato = sogliaVoce(e).haVoce;
  }

  // audio principale: mic esterno > Insta360 > iPhone > altre camere > Sony.
  // Chi è sincronizzato con una voce migliore diventa solo un'inquadratura.
  const candidati = sorgenti.filter((s) => s.parlato).sort((a, b) => prioritaAudio(a.dispositivo) - prioritaAudio(b.dispositivo) || b.durata - a.durata);
  const principali = [];
  const prova = (s) => {
    for (const p of principali) {
      const r = sincronizza(db.get(p.id), db.get(s.id));
      log(`sync ${s.id} ↔ ${p.id}: offset ${r.offset} s, punteggio ${r.punteggio}, spicco ${r.spicco}${r.affidabile ? '' : ' (non affidabile)'}`);
      if (r.affidabile) { s.sync = { con: p.id, offset: r.offset, punteggio: r.punteggio }; return true; }
    }
    return false;
  };
  for (const s of candidati) {
    if (prova(s)) continue;
    s.principale = true;
    principali.push(s);
  }
  for (const s of sorgenti) if (!s.principale && !s.sync && db.has(s.id) && s.tipo === 'video') prova(s);

  // trascrizione solo delle voci principali (le altre camere non servono)
  const tutteFrasi = [];
  for (const p of principali) {
    if (!p.voce) { p.voce = `${p.id}.voce.wav`; estraiVoce(path.join(MEDIA, p.file), path.join(MEDIA, p.voce)); }
    let parole = parolePrecedenti(p.file) || parolePrecedenti(p.voce);
    if (!parole && process.env.GROQ_API_KEY) {
      parole = await trascrivi(path.join(MEDIA, p.voce));
      consumi.groqSec += p.durata;
    }
    p.parole = parole || [];
    // vento, musica, rumore scambiati per voce: meno di 10 parole al minuto = B-roll
    if (p.parole.length < Math.max(3, (p.durata / 60) * 10)) {
      log(`${p.id}: quasi nessuna parola trascritta (${p.parole.length}), la tratto come B-roll`);
      p.principale = false; p.parlato = false; p.parole = [];
      for (const s of sorgenti) if (s.sync?.con === p.id) delete s.sync;
      continue;
    }
    for (const f of frasi(p.parole, db.get(p.id), p.durata)) tutteFrasi.push({ ...f, principale: p.id });
  }
  tutteFrasi.forEach((f, i) => { f.id = `F${String(i + 1).padStart(3, '0')}`; });

  // fogli provino: per le camere sincronizzate i tempi scritti sono quelli della voce
  for (const s of sorgenti.filter((x) => x.tipo === 'video')) {
    const fp = fogliProvino(path.join(MEDIA, s.file), s.id, s.durata, s.sync ? s.sync.offset : 0);
    s.fogli = fp.fogli; s.passoFogli = fp.passo;
  }
  return { cartella: nome, brief, sorgenti, frasi: tutteFrasi, foto };
}

// ---------- main ----------
let job = {};
async function main() {
  job = trovaCartella() || {};
  if (!job.nome) { log('niente da fare'); return; }
  const { nome, files, vai } = job;
  log(`cartella: ${nome} (${files.length} file)`);
  fs.rmSync(WORK, { recursive: true, force: true });
  fs.rmSync(MEDIA, { recursive: true, force: true });
  fs.mkdirSync(path.join(WORK, 'in'), { recursive: true });
  fs.mkdirSync(path.join(WORK, 'fogli'), { recursive: true });
  fs.mkdirSync(MEDIA, { recursive: true });

  try {
    const media = files.filter((f) => VIDEO_EXT.concat(IMAGE_EXT, AUDIO_EXT).includes(path.extname(f.Name).toLowerCase()) && !isNostro(f.Name));
    const peso = media.reduce((s, f) => s + (f.Size || 0), 0);
    await fase(nome, `${CORREZIONE ? '✏️ Correzione · ' : ''}📥 Scarico ${media.length} file (${mb(peso)})`, 'scarico');
    // solo il materiale: niente sottocartelle (_regista), niente video finali/note/segnali
    rclone('copy', remote(SRC_DIR, nome), path.join(WORK, 'in'), '--max-depth', '1',
      '--exclude', '*.XML', '--exclude', '*.xml', '--exclude', '*FINALE*', '--exclude', '_VAI_usato_*', '--exclude', '*.txt');
    rclone('copy', remote(SRC_DIR, nome), path.join(WORK, 'in'), '--max-depth', '1', '--include', 'brief.txt');

    // cache del giro precedente (trascrizioni già fatte, regia da correggere)
    let cache = null, regiaPrecedente = null;
    try {
      rclone('copy', remote(SRC_DIR, nome, CACHE), path.join(WORK, 'cache'));
      if (fs.existsSync(path.join(WORK, 'cache', 'materiale.json'))) cache = JSON.parse(fs.readFileSync(path.join(WORK, 'cache', 'materiale.json'), 'utf8'));
      if (fs.existsSync(path.join(WORK, 'cache', 'regia.json'))) regiaPrecedente = JSON.parse(fs.readFileSync(path.join(WORK, 'cache', 'regia.json'), 'utf8'));
    } catch { /* primo giro: nessuna cache */ }
    if (CORREZIONE && !regiaPrecedente) {
      throw new Error('questo video è stato montato con la versione precedente del regista (o non ha cache): per correggerlo serve un nuovo montaggio da zero.');
    }
    await fase(nome, '🎞️ Preparo i video (copie 1080p, audio, sincronizzazione, trascrizione, fogli provino)', 'prepara');

    const briefFile = fs.existsSync(path.join(WORK, 'in', 'brief.txt')) ? fs.readFileSync(path.join(WORK, 'in', 'brief.txt'), 'utf8') : '';
    const brief = [briefFile, process.env.BRIEF_EXTRA ? `Dal telegram: ${process.env.BRIEF_EXTRA}` : '', cache?.brief && CORREZIONE ? cache.brief : '']
      .filter(Boolean).join('\n');
    const analisi = await analizza(nome, brief, cache);
    fs.writeFileSync(path.join(WORK, 'materiale.json'), JSON.stringify(analisi, null, 1));
    const testoMateriale = materialePerAI(analisi);
    fs.writeFileSync(path.join(WORK, 'materiale.md'), testoMateriale);
    const fogli = analisi.sorgenti.flatMap((s) => s.fogli || []);

    const sinc = analisi.sorgenti.filter((s) => s.sync).length;
    const voci = analisi.sorgenti.filter((s) => s.principale).map((s) => `${s.id} (${s.nomeDispositivo})`).join(', ');
    const stima = stimaToken(fs.readFileSync(path.join(ROOT, 'scripts', 'prompt-regista.md'), 'utf8') + testoMateriale, fogli);
    consumi.stima = { totale: stima.totale, esatta: false };
    log(`stima materiale per l'AI: ${stima.testo} token di testo + ${stima.immagini} di immagini (${fogli.length} fogli)`);
    const pesoAI = ` · materiale ≈ ${kTok(stima.totale)} token`;
    await fase(nome, CORREZIONE ? `🧠 Applico la correzione: “${CORREZIONE.slice(0, 120)}”${pesoAI}`
      : `🧠 Scelgo i tagli: ${analisi.sorgenti.length} sorgenti, voce da ${voci || '—'}, ${sinc} camere sincronizzate, ${analisi.frasi.length} frasi${brief ? ', con brief' : ''}${pesoAI}`, 'regia');
    const regia = await chiediRegia(testoMateriale, fogli, CORREZIONE ? regiaPrecedente : null);
    const { piano, avvisi } = risolviRegia(regia, analisi);
    if (avvisi.length) log('avvisi regia:', avvisi.join(' | '));
    fs.writeFileSync(path.join(WORK, 'piano.json'), JSON.stringify(piano, null, 1));
    validaPiano(piano);
    const durataPiano = piano.clips.reduce((s, c) => s + (c.end - c.start), 0);
    const camereUsate = new Set(piano.clips.map((c) => c.file)).size;
    await fase(nome, `🎬 Render: ${durataPiano.toFixed(0)} s, ${piano.clips.length} tagli da ${camereUsate} sorgenti, ${piano.keywords.length} parole chiave`, 'render');

    // nome con versione: FINALE, FINALE v2, FINALE v3...
    const versioni = files.filter((f) => /FINALE( v\d+)?\.mp4$/i.test(f.Name)).length;
    const finale = `${nome} - FINALE${versioni ? ` v${versioni + 1}` : ''}.mp4`;
    const outFile = path.join(ROOT, 'out', finale);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    renderizza(outFile);
    await fase(nome, '📤 Carico su Drive', 'carico');

    const durataN = probe(outFile).durata;
    const durata = durataN.toFixed(1);
    const note = [
      `${CORREZIONE ? `Correzione (“${CORREZIONE}”)` : 'Montato automaticamente'} il ${new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' })} in ${trascorso()}`,
      `Durata: ${durata} s · ${piano.tavola} · ${piano.clips.length} tagli da ${camereUsate} sorgenti · voce: ${voci || 'audio delle clip'}`,
      `Parole chiave: ${piano.keywords.map((k) => `${k.word} @${k.at.toFixed(1)}s`).join(', ') || '—'}`,
      piano.note ? `Note: ${piano.note}` : '',
      `File: ${SRC_DIR === IN_DIR ? OUT_DIR : SRC_DIR}/${nome}/${finale}`,
      rigaConsumi(),
    ].filter(Boolean).join('\n');
    fs.writeFileSync(path.join(WORK, 'NOTE.txt'), note);

    rclone('copyto', outFile, remote(SRC_DIR, nome, finale));
    rclone('copyto', path.join(WORK, 'NOTE.txt'), remote(SRC_DIR, nome, 'NOTE.txt'));
    for (const f of ['regia.json', 'piano.json', 'materiale.json']) rclone('copyto', path.join(WORK, f), remote(SRC_DIR, nome, CACHE, f));
    if (vai) rclone('moveto', remote(SRC_DIR, nome, vai), remote(SRC_DIR, nome, `_VAI_usato_${vai}`));
    if (SRC_DIR === IN_DIR) rclone('moveto', remote(IN_DIR, nome), remote(OUT_DIR, nome));

    // dati per la scheda del bot
    const info = {
      file: finale, durata: +durataN.toFixed(1), tagli: piano.clips.length, sorgenti: camereUsate, voce: voci,
      keywords: piano.keywords.map((k) => k.word), note: piano.note || '', ai: consumi.ai,
      minuti: Math.round((Date.now() - T0) / 60000), correzione: CORREZIONE || '', versione: VERSIONE,
    };
    // anteprima: prima provo il video in chat, se non passa mando la foto
    const inviato = await inviaVideo(outFile, nome, note, durataN, info);
    if (!inviato) await notifica('✅ pronto', nome, note, { ok: true, foto: anteprima(outFile, piano, durataN), info });
  } catch (e) {
    const testo = `Errore: ${e.message}\n\n` + (CORREZIONE ? 'Puoi riprovare la correzione dal bot (✏️) o scrivermi una richiesta diversa.'
      : vai ? `Per riprovare rinomina _VAI_usato_${vai} in ${vai}, oppure 🔁 Riprova.` : 'Per riprovare: 🔁 Riprova.');
    fs.mkdirSync(WORK, { recursive: true });
    fs.writeFileSync(path.join(WORK, 'ERRORE.txt'), testo);
    try {
      rclone('copyto', path.join(WORK, 'ERRORE.txt'), remote(SRC_DIR, nome, 'ERRORE.txt'));
      if (vai) rclone('moveto', remote(SRC_DIR, nome, vai), remote(SRC_DIR, nome, `_VAI_usato_${vai}`));
    } catch (e2) { log('impossibile scrivere ERRORE su Drive', e2.message); }
    await notifica('⚠️ non montato', nome, testo, { info: { errore: e.message, correzione: CORREZIONE || '' } });
    process.exitCode = 1;
  }
}

// Video di anteprima per Telegram: i bot possono inviare al massimo 50 MB,
// quindi 720p con bitrate calcolato per stare sotto ~45 MB.
async function inviaVideo(outFile, nome, testo, durata, info) {
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
    if (info) form.append('info', JSON.stringify(info));
    form.append('video', new Blob([fs.readFileSync(anteprimaMp4)], { type: 'video/mp4' }), 'anteprima.mp4');
    const url = process.env.NOTIFY_URL.replace(/\/notify$/, '/video');
    const r = await fetchRiprova(url, { method: 'POST', headers: { 'x-regista-token': process.env.NOTIFY_TOKEN || '' }, body: form });
    log(`anteprima video: ${r.status} (${mb(size)})`);
    return r.ok;
  } catch (e) {
    log('anteprima video fallita', e.message);
    return false;
  }
}

// avviato come script (non importato dai test)
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(ROOT, 'scripts', 'regista.mjs')) main();
export { fogliProvino, chiediRegia, rigaConsumi, WORK, MEDIA };
