// Regista automatico: prende UNA cartella da "97 - Editare" su Drive che contiene
// un file VAI, prepara il materiale, fa decidere la regia all'AI,
// renderizza con Remotion e rimette il risultato su Drive in "98 - Fatti".
//
// Requisiti nell'ambiente (GitHub Actions o PC):
//   rclone configurato con un remote chiamato "gdrive" (account denisnusinovic)
//   ffmpeg / ffprobe nel PATH
//   GROQ_API_KEY            trascrizione Whisper
//   CLAUDE_CODE_OAUTH_TOKEN Claude Code con l'abbonamento (comando `claude`)
//   GEMINI_API_KEY          Gemini (AI principale di default)
//   REGISTA_AI              gemini (default) | claude: l'AI principale; l'altra fa da riserva automatica
//   REGISTA_MODEL           modello Claude (default sonnet) · GEMINI_MODEL flash (default) | pro
//   GEMINI_MODELLI          (facoltativo) elenco fisso "a,b,c" al posto della rotazione automatica dei Flash
//   NOTIFY_URL / NOTIFY_TOKEN (opzionali) bot Telegram: fasi, esito, anteprima video
//
// Modalità correzione (dal bottone ✏️ del bot): ORIGINE=98, CARTELLA=<nome>,
// CORREZIONE=<testo>. Riparte dalla regia salvata in 98 - Fatti/<nome>/_regista/
// e produce "<nome> - FINALE v2.mp4" (v3, ...) nella stessa cartella.

import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { audioMuto, frasi, inviluppo, sincronizza, sogliaVoce } from './audio.mjs';
import { materialePerAI, risolviRegia } from './regia.mjs';
import { movimento, syncMovimento } from './sync-visivo.mjs';
import { AUDIO_EXT, IMAGE_EXT, NOMI_DISPOSITIVO, VIDEO_EXT, dispositivo, prioritaAudio, tagsPiatti } from './sorgenti.mjs';

const REMOTE = process.env.REGISTA_REMOTE || 'gdrive';
const IN_DIR = '97 - Editare';
const OUT_DIR = '98 - Fatti';
const CORREZIONE = (process.env.CORREZIONE || '').trim();
// file mandati direttamente al bot: [{"m": id_messaggio, "n": "nome.mov"}, ...]
const TELEGRAM_FILE = (process.env.TELEGRAM_FILE || '').trim();
const DA_TELEGRAM = Boolean(TELEGRAM_FILE && TELEGRAM_FILE !== '[]');
const SRC_DIR = process.env.ORIGINE === '98' || CORREZIONE ? OUT_DIR : IN_DIR;
const CACHE = '_regista'; // sottocartella con regia.json, piano.json e materiale.json di ogni video
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const WORK = path.join(ROOT, 'work');
const MEDIA = path.join(ROOT, 'public', 'media');
// girato originale: sul runner va nel disco grande /mnt (il workflow imposta REGISTA_SCARICO)
const SCARICO = process.env.REGISTA_SCARICO || path.join(WORK, 'in');

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
      // attesa crescente (5, 10, 20, 40 s…): un servizio sovraccarico di solito si libera in un paio di minuti
      await new Promise((ok) => setTimeout(ok, Math.min(60000, 5000 * 2 ** (i - 1))));
    }
  }
}
// VAI "prenotato" appena parte un montaggio: il controllo periodico non lo riprende due volte
const isInCorso = (name) => /^_VAI_in_corso_/i.test(name);
const nomeVaiOriginale = (name) => name.replace(/^_VAI_in_corso_/i, '');
// file generati da noi o segnali: mai materiale di montaggio
const isNostro = (name) => isVai(name) || isInCorso(name) || /^_VAI_usato_/i.test(name) || /FINALE/i.test(name) || /^(NOTE|ERRORE|_ERRORE.*)\.txt$/i.test(name);

// data di ripresa: metadati della camera, altrimenti dal nome (VID_20261018_…, IMG_20261018…)
function dataRipresa(tags, nome) {
  for (const k of ['com.apple.quicktime.creationdate', 'creation_time', 'date']) {
    const d = Date.parse(tags?.[k] || '');
    if (d > Date.UTC(2015, 0, 1)) return d;
  }
  const m = /(20\d{2})(\d{2})(\d{2})/.exec(nome);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null;
}

// ---------- 1. trova la cartella da fare ----------
// video da Telegram: la cartella non esiste ancora, scelgo un nome libero in 97 e 98
function nomeLibero(richiesto) {
  const pulito = String(richiesto || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
    || `Video ${new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' }).replace(/[/:]/g, '-')}`;
  const esistenti = new Set();
  for (const d of [IN_DIR, OUT_DIR]) {
    try { for (const x of JSON.parse(rclone('lsjson', remote(d), '--dirs-only'))) esistenti.add(x.Name.toLowerCase()); } catch { /* cartella vuota */ }
  }
  let nome = pulito;
  for (let k = 2; esistenti.has(nome.toLowerCase()); k++) nome = `${pulito} (${k})`;
  return nome;
}

function trovaCartella() {
  if (DA_TELEGRAM) return { nome: nomeLibero(process.env.CARTELLA), files: [], vai: null };
  // avvio da Telegram/manuale con cartella esplicita: VAI non obbligatorio
  if (process.env.CARTELLA) {
    const nome = process.env.CARTELLA;
    const files = JSON.parse(rclone('lsjson', remote(SRC_DIR, nome), '--files-only'));
    const vai = files.find((f) => isVai(f.Name) || isInCorso(f.Name));
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
  const colore = v ? { trc: v.color_transfer, primaries: v.color_primaries, matrix: v.color_space } : null;
  return { durata: Number(j.format.duration), w, h, audio: Boolean(a), video: Boolean(v), tags: tagsPiatti(j), colore };
}

// HDR (iPhone in HLG/Dolby Vision, clip PQ) → Rec.709: senza conversione i colori escono slavati
const HDR = ['arib-std-b67', 'smpte2084'];
function filtroColore(c) {
  if (!c || !HDR.includes(c.trc)) return 'format=yuv420p';
  return `zscale=tin=${c.trc}:pin=${c.primaries || 'bt2020'}:min=${c.matrix || 'bt2020nc'}:t=linear:npl=100,format=gbrpf32le,`
    + 'zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p';
}

// Si ricodificano solo i pezzi usati dal montaggio (1080p, colori SDR). Prima si convertiva
// tutto il girato 4K: 40 dei 58 minuti del primo giro reale.
function taglia(s, start, dur, out, conAudio) {
  run('ffmpeg', ['-y', '-v', 'error', '-ss', start.toFixed(3), '-i', s.originale, '-t', (dur + 0.1).toFixed(3),
    '-vf', `scale='if(gt(iw,ih),1920,1080)':-2,${filtroColore(s.colore)}`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p',
    ...(conAudio ? ['-c:a', 'aac', '-b:a', '160k'] : ['-an']), '-movflags', '+faststart', out]);
}

function tagliaSegmenti(piano, analisi) {
  const perFile = new Map(analisi.sorgenti.filter((s) => s.tipo === 'video').map((s) => [s.file, s]));
  piano.clips.forEach((c, i) => {
    const s = perFile.get(c.file);
    if (!s) throw new Error(`sorgente sconosciuta ${c.file}`);
    const dur = c.end - c.start;
    const seg = `seg_${String(i).padStart(3, '0')}.mp4`;
    taglia(s, c.start, dur, path.join(MEDIA, seg), !c.audio && !c.muto && s.haAudio);
    Object.assign(c, { file: seg, start: 0, end: +dur.toFixed(3), sorgente: s.id, daSorgente: c.start });
  });
}

// con tanti video in parallelo Groq può andare al limite orario: si passa al modello turbo (quota separata)
async function trascrivi(file) {
  const mp3 = path.join(WORK, `${path.parse(file).name}.trascrizione.mp3`);
  run('ffmpeg', ['-y', '-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '48k', mp3]);
  for (const modello of ['whisper-large-v3', 'whisper-large-v3-turbo']) {
    const form = new FormData();
    form.append('file', new Blob([fs.readFileSync(mp3)]), path.basename(mp3));
    form.append('model', modello);
    form.append('language', 'it');
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'word');
    try {
      const res = await fetchRiprova(process.env.GROQ_URL || 'https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST', headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }, body: form,
      }, 3);
      if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`);
      const j = await res.json();
      return (j.words || []).map((w) => ({ w: w.word, s: +w.start.toFixed(2), e: +w.end.toFixed(2) }));
    } catch (e) {
      if (modello.endsWith('turbo')) throw e;
      log(`trascrizione con ${modello} non riuscita (${e.message}), provo whisper-large-v3-turbo`);
    }
  }
}

// traccia voce in WAV: Remotion la legge con tempi esatti
const estraiVoce = (src, dst) => run('ffmpeg', ['-y', '-v', 'error', '-i', src, '-vn', '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', dst]);

const FONT = ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 'C:/Windows/Fonts/arialbd.ttf'].find((p) => fs.existsSync(p));

// Fogli provino: fino a 32 riquadri per clip, 16 per foglio, col tempo scritto sopra.
// offset: tempo scritto = tempo nella clip - offset (per le camere sincronizzate = tempo della voce)
// Dal girato originale si decodificano solo i fotogrammi chiave (molto più veloce sul 4K).
function fogliProvino(file, id, durata, offset = 0, colore = null) {
  const n = Math.min(32, Math.max(4, Math.ceil(durata / 1.5)));
  const passo = durata / n;
  const dir = path.join(WORK, 'fogli', '_riquadri', id);
  fs.mkdirSync(dir, { recursive: true });
  let etichette = Boolean(FONT);
  let soloChiave = true;
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) * passo;
    const out = path.join(dir, `${String(k).padStart(3, '0')}.jpg`);
    const scritta = `${(t - offset).toFixed(1)}s`;
    const base = `scale=240:-2,${filtroColore(colore)}`;
    const filtro = etichette
      ? `${base},drawtext=fontfile='${FONT.replace(/:/g, '\\:')}':text='${scritta}':x=6:y=6:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.65:boxborderw=4`
      : base;
    try {
      run('ffmpeg', ['-y', '-v', 'error', ...(soloChiave ? ['-skip_frame', 'nokey'] : []), '-ss', t.toFixed(2), '-i', file, '-frames:v', '1', '-vf', filtro, '-q:v', '4', out]);
      if (!fs.existsSync(out) || fs.statSync(out).size === 0) throw new Error('nessun fotogramma');
    } catch (e) {
      if (soloChiave) { soloChiave = false; k--; continue; } // fotogrammi chiave troppo radi: decodifica normale
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
  let p = fs.readFileSync(path.join(ROOT, 'scripts', 'prompt-regista.md'), 'utf8')
    .replace('{{GRAFICA}}', fs.readFileSync(path.join(ROOT, 'scripts', 'stili', `${stileCorrente}.md`), 'utf8').trim());
  if (regiaPrecedente) {
    p += `\n\n## MODALITÀ CORREZIONE\nEsiste già un montaggio, questa è la sua regia:\n\`\`\`json\n${JSON.stringify(regiaPrecedente, null, 1)}\n\`\`\`\nDenis l'ha guardato e chiede queste modifiche:\n\n> ${CORREZIONE.replace(/\n/g, '\n> ')}\n\nParti da questa regia e applica SOLO quello che chiede, lasciando invariato il resto. I tempi li ricalcola lo script. Nella \`note\` elenca in breve cosa hai cambiato.`;
  }
  p += modo === 'claude'
    ? '\n\n## Come consegnare\nLeggi i fogli provino con lo strumento Read, tutti nello stesso turno (letture in parallelo), poi scrivi la regia con lo strumento Write in `work/regia.json` e rispondi con 3 righe di riepilogo.'
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
  // Claude Code si installa solo quando serve (con Gemini principale di solito non serve)
  const c = spawnSync('claude', ['--version'], { encoding: 'utf8', shell: process.platform === 'win32' });
  if (c.error || c.status !== 0) {
    log('installo Claude Code');
    run('npm', ['install', '-g', '@anthropic-ai/claude-code'], { stdio: 'inherit', shell: process.platform === 'win32' });
  }
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

// flash = veloce, ottima visione, limiti alti (predefinito) · pro = ragiona meglio, limiti più bassi
// ---------- Gemini: rotazione dei modelli secondo i limiti del piano gratuito ----------
// Sul piano gratuito ogni modello Flash ha i SUOI limiti: 20 richieste al giorno e 5 al
// minuto (visto il 18/10: 3.8 Flash a 21/20, gli altri Flash quasi intatti). Ruotando i
// Flash completi si hanno ~80 regie al giorno di qualità piena; i Flash Lite (500 al giorno,
// ma meno bravi a costruire un racconto) solo come riserva, poi Claude. L'elenco arriva da
// Google (ListModels), così i modelli nuovi entrano da soli. GEMINI_MODELLI="a,b,c" lo forza.
const GEMINI_BASE = () => process.env.GEMINI_URL || 'https://generativelanguage.googleapis.com/v1beta';
const attesa = (ms) => new Promise((ok) => setTimeout(ok, ms));
export const nomeBreveGemini = (m) => m.replace(/^gemini-/, '').replace(/-preview$/, '').split('-')
  .map((x) => (/^\d/.test(x) ? x : x[0].toUpperCase() + x.slice(1))).join(' ');

export function ordinaModelliGemini(nomi, scelta = 'flash') {
  const versione = (n) => Number((/^gemini-(\d+(?:\.\d+)?)/.exec(n) || [])[1] || 0);
  const tipo = (n) => (/^gemini-\d+(?:\.\d+)?-flash-lite(-preview)?$/.test(n) ? 'lite'
    : /^gemini-\d+(?:\.\d+)?-flash(-preview)?$/.test(n) ? 'flash' : /^gemini-\d+(?:\.\d+)?-pro(-preview)?$/.test(n) ? 'pro' : null);
  // un solo nome per versione: la versione stabile batte la preview
  const scegli = (t) => {
    const perVersione = new Map();
    for (const n of nomi.filter((x) => tipo(x) === t)) {
      const v = versione(n), prima = perVersione.get(v);
      if (!prima || (prima.endsWith('-preview') && !n.endsWith('-preview'))) perVersione.set(v, n);
    }
    return [...perVersione.entries()].sort((x, y) => y[0] - x[0]).map(([, n]) => n);
  };
  const lista = [...scegli('flash').slice(0, 4), ...scegli('lite').slice(0, 2)];
  return scelta === 'pro' ? [...scegli('pro').slice(0, 1), ...lista] : lista;
}

async function modelliGemini(headers) {
  if (process.env.GEMINI_MODELLI) return process.env.GEMINI_MODELLI.split(',').map((x) => x.trim()).filter(Boolean);
  try {
    const r = await fetchRiprova(`${GEMINI_BASE()}/models?pageSize=200`, { headers }, 2);
    if (r.ok) {
      const nomi = ((await r.json()).models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
        .map((m) => m.name.replace(/^models\//, ''));
      const lista = ordinaModelliGemini(nomi, process.env.GEMINI_MODEL);
      if (lista.length) return lista;
    }
  } catch (e) { log('elenco dei modelli Gemini non disponibile', e.message); }
  return ['gemini-flash-latest', 'gemini-flash-lite-latest'];
}

// Una chiamata a un modello. Limite del giorno finito → si passa subito al modello dopo
// (riprovare spreca richieste: ieri i tentativi a vuoto hanno contribuito a finirle);
// limite al minuto → si aspetta quanto dice Google e si riprova; sovraccarico → 2 tentativi.
async function chiamaGemini(modello, body, headers) {
  const url = `${GEMINI_BASE()}/models/${modello}:generateContent`;
  for (let tentativo = 1; tentativo <= 3; tentativo++) {
    let r;
    try {
      r = await fetch(url, { method: 'POST', headers: { connection: 'close', ...headers }, body, signal: AbortSignal.timeout(5 * 60 * 1000) });
    } catch (e) {
      if (tentativo === 3) return { motivo: `non risponde (${e.message})` };
      await attesa(5000 * tentativo); continue;
    }
    if (r.ok) return { risposta: r };
    const testo = await r.text();
    if (r.status === 429) {
      if (/PerDay/i.test(testo)) return { motivo: 'richieste del giorno finite' };
      const ritardo = Number((/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/.exec(testo) || [])[1] || 20);
      if (tentativo < 3 && ritardo <= 65) { log(`Gemini ${modello}: limite al minuto, aspetto ${Math.ceil(ritardo)} s`); await attesa(ritardo * 1000 + 500); continue; }
      return { motivo: 'limite al minuto' };
    }
    if (r.status >= 500) {
      if (tentativo < 3) { log(`Gemini ${modello}: ${r.status}, riprovo`); await attesa(5000 * 2 ** (tentativo - 1)); continue; }
      return { motivo: `sovraccarico (${r.status})` };
    }
    return { motivo: r.status === 404 ? 'modello non disponibile' : `errore ${r.status}: ${testo.slice(0, 200)}` };
  }
  return { motivo: 'non risponde' };
}

async function regiaConGemini(prompt, fogli, valida) {
  const parts = [{ text: prompt }];
  for (const f of fogli) {
    parts.push({ text: `Foglio provino ${f}:` });
    parts.push({ inline_data: { mime_type: 'image/jpeg', data: fs.readFileSync(path.join(ROOT, f)).toString('base64') } });
  }
  const contents = [{ role: 'user', parts }];
  const headers = { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY };
  const modelli = await modelliGemini(headers);
  log(`Gemini: modelli in ordine ${modelli.join(', ')}`);
  // conteggio esatto prima dell'invio: countTokens non consuma le richieste di generazione
  try {
    const c = await fetchRiprova(`${GEMINI_BASE()}/models/${modelli[0]}:countTokens`, { method: 'POST', headers, body: JSON.stringify({ contents }) }, 2);
    if (c.ok) { const t = (await c.json()).totalTokens; consumi.stima = { totale: t, esatta: true }; log(`Gemini: ${t} token da inviare`); }
  } catch (e) { log('conteggio token Gemini non riuscito', e.message); }
  const generationConfig = { responseMimeType: 'application/json', temperature: 0.4 };
  const leggi = async (risposta, modello) => {
    const j = await risposta.json();
    const testo = (j.candidates?.[0]?.content?.parts || []).map((x) => x.text || '').join('');
    const u = j.usageMetadata || {};
    const prima = consumi.ai?.chi === 'Gemini' ? consumi.ai : { input: 0, output: 0 };
    consumi.ai = { chi: 'Gemini', modello: j.modelVersion || modello, input: prima.input + (u.promptTokenCount || 0), output: prima.output + (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0) };
    return { testo, regia: JSON.parse(testo.replace(/^```(?:json)?\s*|\s*```$/g, '')) };
  };
  // difetti del racconto che il controllo automatico trova (ordine rimescolato, frasi staccate,
  // chiusura a metà): Gemini rilegge la sua regia con l'elenco e la riscrive, una volta sola
  const difetti = (r) => (r.avvisi || []).filter((a) => /ordine del discorso|staccata|lasciata a metà|apertura|finisce a metà|finisce senza punto/.test(a));
  let motivo = 'nessun modello';
  for (const [i, modello] of modelli.entries()) {
    const esito = await chiamaGemini(modello, JSON.stringify({ contents, generationConfig }), headers);
    if (esito.risposta) {
      try {
        let { testo, regia } = await leggi(esito.risposta, modello);
        let risultato = valida(regia);
        const problemi = difetti(risultato);
        if (problemi.length) {
          log(`Gemini: rilettura della regia (${problemi.join(' | ')})`);
          await fase(job.nome, `✍️ Rileggo la regia: ${problemi.length} punt${problemi.length === 1 ? 'o' : 'i'} da sistemare nel racconto`, 'regia');
          const correzione = [...contents, { role: 'model', parts: [{ text: testo }] }, { role: 'user', parts: [{ text:
            `Il controllo automatico del tuo montaggio ha trovato:\n- ${problemi.join('\n- ')}\n`
            + 'Riscrivi la regia COMPLETA correggendo questi punti: ordine del discorso di Denis, frasi che rimandano a prima messe dopo ciò a cui si riferiscono, frasi lasciate a metà seguite dalla loro continuazione, apertura che si capisce da sola, chiusura su una frase che finisce col punto. Stesse regole, stesso formato JSON.' }] }];
          const esito2 = await chiamaGemini(modello, JSON.stringify({ contents: correzione, generationConfig }), headers);
          if (esito2.risposta) {
            try {
              const nuova = await leggi(esito2.risposta, modello);
              const r2 = valida(nuova.regia);
              log(`Gemini: dopo la rilettura ${difetti(r2).length} difetti (prima ${problemi.length})`);
              if (difetti(r2).length < problemi.length) ({ regia, risultato } = { regia: nuova.regia, risultato: r2 });
            } catch (e) { log('rilettura della regia non usabile', e.message); }
          } else log(`rilettura non riuscita: ${esito2.motivo}`);
        }
        fs.writeFileSync(path.join(WORK, 'regia.json'), JSON.stringify(regia, null, 1));
        return { regia, risultato };
      } catch (e) { esito.motivo = `regia inutilizzabile (${e.message.slice(0, 120)})`; }
    }
    motivo = esito.motivo;
    const dopo = modelli[i + 1];
    log(`Gemini ${modello}: ${motivo}${dopo ? ` → provo ${dopo}` : ''}`);
    if (dopo) await fase(job.nome, `⏳ Gemini ${nomeBreveGemini(modello)}: ${motivo}, uso ${nomeBreveGemini(dopo)}`, 'regia');
  }
  throw new Error(`Gemini: ${motivo} su tutti i modelli (${modelli.map(nomeBreveGemini).join(', ')})`);
}

// AI principale (default Gemini se c'è la chiave) e l'altra come riserva automatica.
// `valida` controlla la regia: se è inutilizzabile si prova il modello o l'AI successiva.
async function chiediRegia(testoMateriale, fogli, regiaPrecedente, valida = (r) => r) {
  const scelta = (process.env.REGISTA_AI || 'gemini').toLowerCase();
  const haGemini = Boolean(process.env.GEMINI_API_KEY);
  const ordine = scelta === 'claude' || !haGemini ? ['claude', ...(haGemini ? ['gemini'] : [])] : ['gemini', 'claude'];
  const nomi = { gemini: 'Gemini', claude: 'Claude' };
  let errore;
  for (const [i, chi] of ordine.entries()) {
    try {
      const prompt = promptRegia({ modo: chi, testoMateriale, regiaPrecedente });
      if (chi === 'gemini') return await regiaConGemini(prompt, fogli, valida);
      const regia = regiaConClaude(prompt);
      return { regia, risultato: valida(regia) };
    } catch (e) {
      errore = e;
      if (i === ordine.length - 1) break;
      log(`${e.message}\n→ passo a ${nomi[ordine[i + 1]]}`);
      const motivo = chi === 'gemini' ? e.message.replace(/^Gemini: /, '') : /regia|frasi|clip/.test(e.message) ? 'ha scritto una regia inutilizzabile' : 'non ha risposto';
      await fase(job.nome, `🔁 ${nomi[chi]}: ${motivo}. Uso ${nomi[ordine[i + 1]]}`, 'regia');
    }
  }
  throw errore;
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
// Stili pronti = composizioni Remotion registrate in src/Root.tsx. Le schede e gli esempi
// stanno su Drive in "03 · Social — Risorse/Stili/<nome>/" (stile.txt, esempi/, asset/):
// uno stile nuovo si costruisce da lì e si aggiunge qui, in Root.tsx e in scripts/stili/<nome>.md
// (le istruzioni di grafica per l'AI, inserite nel prompt al posto di {{GRAFICA}}).
const STILI = ['Blueprint', 'Cinematico'];
let stileCorrente = STILI[0];
function scegliStile(brief) {
  const richiesto = (/stile\s*:\s*([^\n.,;]+)/i.exec(brief || '') || [])[1]?.trim();
  if (!richiesto) return { stile: STILI[0] };
  const trovato = STILI.find((x) => x.toLowerCase() === richiesto.toLowerCase());
  return trovato ? { stile: trovato } : { stile: STILI[0], avviso: `lo stile "${richiesto}" non è ancora pronto: ho usato ${STILI[0]}` };
}

function renderizza(out, stile = STILI[0]) {
  // Il primo render a volte fallisce per un errore transitorio del compositor
  // (visto nel test del 16/10): fino a 3 tentativi.
  for (let tentativo = 1; ; tentativo++) {
    try {
      // 1080×1920 a ~15 Mbps: il formato che TikTok/Instagram caricano meglio (meglio di un 4K pesante)
      run('npx', ['remotion', 'render', 'src/index.ts', stile, out, `--props=${path.join(WORK, 'piano.json')}`,
        '--codec=h264', '--video-bitrate=15M', '--max-rate=16M', '--buffer-size=32M', '--audio-bitrate=320k', '--concurrency=100%',
        // browser già installato (es. Chrome sul PC) invece di quello che Remotion scarica
        ...(process.env.REMOTION_BROWSER ? [`--browser-executable=${process.env.REMOTION_BROWSER}`] : [])],
      { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
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
      // richiesto = nome chiesto dal bot (la cartella può essere diventata "Nome (2)"): serve ad agganciare la scheda
      body: JSON.stringify({ run_url: RUN_URL, run_id: process.env.GITHUB_RUN_ID, origine: SRC_DIR === OUT_DIR ? '98' : '97', richiesto: process.env.CARTELLA || '', ...payload }),
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

// comando lungo in parallelo al resto (es. copia degli originali su Drive)
function inSottofondo(cmd, args) {
  const p = new Promise((ok, ko) => {
    const c = spawn(cmd, args, { stdio: ['ignore', 'inherit', 'inherit'] });
    c.on('error', ko);
    c.on('close', (code) => (code === 0 ? ok() : ko(new Error(`${cmd} terminato con codice ${code}`))));
  });
  p.catch(() => {}); // l'errore si legge quando lo si aspetta
  return p;
}

const mb = (bytes) => (bytes / 1e6 >= 1000 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`);

// ---------- analisi: sorgenti, audio principale, sincronizzazione, frasi ----------
export async function analizza(nome, brief, cache) {
  const parolePrecedenti = (file) => (file ? (cache?.sorgenti || cache?.video || []).find((v) => v.file === file || v.voce === file)?.parole : undefined);
  const sorgenti = [];
  const foto = [];
  const idUsati = new Set();
  for (const f of fs.readdirSync(SCARICO).sort()) {
    const src = path.join(SCARICO, f);
    const ext = path.extname(f).toLowerCase();
    if (isNostro(f) || fs.statSync(src).isDirectory()) continue;
    let id = path.parse(f).name;
    while (idUsati.has(id.toLowerCase())) id += '_b';
    idUsati.add(id.toLowerCase());
    if (VIDEO_EXT.includes(ext)) {
      const info = probe(src);
      if (!info.video) continue;
      const disp = dispositivo(f, info.tags);
      const hdr = HDR.includes(info.colore?.trc);
      log(`video ${f} (${NOMI_DISPOSITIVO[disp]}, ${info.durata.toFixed(1)} s, ${info.w}x${info.h}${hdr ? ', HDR → SDR' : ''})`);
      // `file` è il nome logico usato dalla regia; i pezzi veri si tagliano dall'originale dopo la regia
      sorgenti.push({ id, file: `${id}.mp4`, originale: src, tipo: 'video', dispositivo: disp, nomeDispositivo: NOMI_DISPOSITIVO[disp],
        durata: +info.durata.toFixed(2), orient: info.w > info.h ? 'h' : 'v', haAudio: info.audio, colore: info.colore, data: dataRipresa(info.tags, f) });
    } else if (AUDIO_EXT.includes(ext)) {
      const info = probe(src);
      log(`audio ${f} (mic esterno, ${info.durata.toFixed(1)} s)`);
      estraiVoce(src, path.join(MEDIA, `${id}.voce.wav`));
      sorgenti.push({ id, file: null, originale: src, voce: `${id}.voce.wav`, tipo: 'audio', dispositivo: 'mic', nomeDispositivo: NOMI_DISPOSITIVO.mic,
        durata: +info.durata.toFixed(2), haAudio: true });
    } else if (IMAGE_EXT.includes(ext)) {
      foto.push(f);
    }
  }
  if (!sorgenti.some((s) => s.tipo === 'video')) throw new Error('nessun video nella cartella');

  // Video già montati (TikTok, Reel, export…) e girati di altri giorni: solo immagini.
  // In Lark A2 c'erano un TikTok già finito e una conversazione di settembre, e le loro voci
  // finivano tra le frasi candidate. Scelta di Denis (18/10): restano come B-roll, la voce mai.
  const recente = Math.max(0, ...sorgenti.filter((s) => s.tipo === 'video' && s.data).map((s) => s.data));
  for (const s of sorgenti.filter((x) => x.tipo === 'video')) {
    const perche = /tik ?tok|reel|export|montat|hq.?grade/i.test(s.id) ? 'video già montato'
      : recente && s.data && recente - s.data > 3 * 86400e3 ? `girato il ${new Date(s.data).toLocaleDateString('it-IT')}, non con il resto` : null;
    if (perche) { s.soloImmagini = perche; log(`${s.id}: solo immagini (${perche})`); }
  }

  // correzione: stesse frasi e stessa sincronizzazione del montaggio da correggere,
  // così gli id F001... della regia precedente puntano agli stessi pezzi
  if (CORREZIONE && cache?.frasi?.length) {
    for (const s of sorgenti) {
      const c = cache.sorgenti?.find((x) => x.id === s.id);
      if (!c) continue;
      Object.assign(s, { principale: c.principale, sync: c.sync, parlato: c.parlato, parole: c.parole, livello: c.livello });
      if (c.principale) { s.voce = c.voce; if (!fs.existsSync(path.join(MEDIA, s.voce))) estraiVoce(s.originale, path.join(MEDIA, s.voce)); }
    }
    for (const s of sorgenti.filter((x) => x.tipo === 'video')) {
      const fp = fogliProvino(s.originale, s.id, s.durata, s.sync ? s.sync.offset : 0, s.colore);
      s.fogli = fp.fogli; s.passoFogli = fp.passo;
    }
    return { cartella: nome, brief, sorgenti, frasi: cache.frasi, foto };
  }

  // inviluppi audio (dall'originale: si legge solo la traccia audio) e rilevamento parlato
  const db = new Map();
  for (const s of sorgenti) {
    if (!s.haAudio || s.soloImmagini) continue;
    const e = inviluppo(s.voce ? path.join(MEDIA, s.voce) : s.originale);
    if (!e) continue;
    db.set(s.id, e);
    const v = sogliaVoce(e);
    s.parlato = v.haVoce;
    s.livello = +v.voce.toFixed(1);
    if (s.tipo === 'video' && audioMuto(e)) s.audioMuto = true;
    log(`livelli ${s.id}: fondo ${v.fondo.toFixed(0)} dB, voce ${v.voce.toFixed(0)} dB${v.haVoce ? ' → parlato' : s.audioMuto ? ' → audio muto' : ''}`);
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
    if (!p.voce) { p.voce = `${p.id}.voce.wav`; estraiVoce(p.originale, path.join(MEDIA, p.voce)); }
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

  // camere con audio muto: si agganciano dalle immagini, confrontando il movimento
  // (mani, prodotto, gesti) con quello della camera della voce. Decodificare il 4K
  // costa qualche minuto, quindi solo per le riprese lunghe girate insieme alla voce
  // (il volto che parla dura quanto il parlato; i B-roll corti restano B-roll) e solo 45 s.
  const vociVideo = sorgenti.filter((s) => s.principale && s.tipo === 'video');
  const durataVoce = Math.max(0, ...vociVideo.map((p) => p.durata));
  const movRif = new Map();
  for (const s of sorgenti.filter((x) => x.tipo === 'video' && x.audioMuto && !x.sync && !x.principale && x.durata >= Math.max(15, durataVoce * 0.4))) {
    s.provataVisiva = true;
    const t0 = Date.now();
    await fase(nome, `🔗 ${s.id} ha l'audio muto: la aggancio alla voce dalle immagini (qualche minuto)`, 'prepara');
    const dur = Math.min(45, s.durata), da = +((s.durata - dur) / 2).toFixed(2);
    try {
      const pezzo = movimento(s.originale, { orizzontale: s.orient === 'h', da, dur });
      for (const p of vociVideo) {
        if (!movRif.has(p.id)) movRif.set(p.id, movimento(p.originale, { orizzontale: p.orient === 'h' }));
        const r = syncMovimento(movRif.get(p.id), pezzo);
        const offset = +(r.offset + da).toFixed(3);
        // plausibile solo se almeno metà della camera muta cade dentro la registrazione della voce
        const dentro = Math.min(p.durata, s.durata - offset) - Math.max(0, -offset);
        const ok = r.affidabile && dentro >= s.durata * 0.5;
        log(`sync dalle immagini ${s.id} ↔ ${p.id}: offset ${offset} s, spicco ${r.spicco}${ok ? '' : ' (non affidabile)'} · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
        if (ok) { s.sync = { con: p.id, offset, punteggio: r.punteggio, visivo: true }; break; }
      }
    } catch (e) { log(`sync dalle immagini ${s.id} non riuscita: ${e.message}`); }
  }
  movRif.clear();

  // fogli provino: per le camere sincronizzate i tempi scritti sono quelli della voce
  for (const s of sorgenti.filter((x) => x.tipo === 'video')) {
    const fp = fogliProvino(s.originale, s.id, s.durata, s.sync ? s.sync.offset : 0, s.colore);
    s.fogli = fp.fogli; s.passoFogli = fp.passo;
  }
  // camere con audio muto e non sincronizzate: Denis deve saperlo (di solito un
  // ricevitore wireless collegato alla presa microfono ma spento, che esclude il microfono interno)
  const avvisi = sorgenti.filter((s) => s.provataVisiva).map((s) => s.sync
    ? `${s.id} (${s.nomeDispositivo}) ha registrato solo fruscio (microfono collegato ma spento?): l'ho agganciata dalle immagini. Se il labiale non torna, dimmelo.`
    : `${s.id} (${s.nomeDispositivo}) ha registrato solo fruscio, senza voce (microfono collegato ma spento?) e non sono riuscito ad agganciarla nemmeno dalle immagini: l'ho usata solo come B-roll. Lascia acceso il microfono della camera, anche quello interno basta.`);
  return { cartella: nome, brief, sorgenti, frasi: tutteFrasi, foto, avvisi };
}

// ---------- main ----------
let job = {};
// Prova veloce della sola regia (azione "regia"): rilegge il materiale già analizzato
// (_regista/materiale.json del montaggio precedente), chiede la regia e manda il testo che
// verrebbe montato, su Telegram e in _regista/prova-regia.txt. Niente download del girato e
// niente render: 1–2 minuti invece di 10–20. Serve a mettere a punto il racconto.
async function provaRegia() {
  const nome = process.env.CARTELLA;
  job = { nome };
  if (!nome) throw new Error('prova regia: manca la cartella');
  fs.rmSync(WORK, { recursive: true, force: true });
  fs.mkdirSync(path.join(WORK, 'cache'), { recursive: true });
  let dir = null;
  for (const d of [OUT_DIR, IN_DIR]) {
    try { rclone('copy', remote(d, nome, CACHE), path.join(WORK, 'cache')); } catch { continue; }
    if (fs.existsSync(path.join(WORK, 'cache', 'materiale.json'))) { dir = d; break; }
  }
  if (!dir) {
    await notifica('⚠️ prova regia', nome, 'Non trovo il materiale già analizzato: serve prima un montaggio completo di questa cartella.');
    process.exitCode = 1;
    return;
  }
  const analisi = JSON.parse(fs.readFileSync(path.join(WORK, 'cache', 'materiale.json'), 'utf8'));
  if (process.env.BRIEF_EXTRA) analisi.brief = `Dal telegram: ${process.env.BRIEF_EXTRA}`;
  stileCorrente = scegliStile(analisi.brief).stile;
  for (const s of analisi.sorgenti) s.fogli = []; // i fogli provino non sono salvati: prova solo sul testo
  const testoMateriale = `${materialePerAI(analisi)}\n\n(Prova veloce: i fogli provino non sono inclusi, scegli le inquadrature solo in base alle sorgenti.)`;
  await fase(nome, '📝 Prova della regia: solo il testo, senza render', 'regia');
  const { regia, risultato: { piano, avvisi } } = await chiediRegia(testoMateriale, [], null, (r) => risolviRegia(r, analisi));
  const durata = piano.clips.reduce((t, c) => t + (c.end - c.start), 0);
  const testo = [
    `Testo (${durata.toFixed(0)} s, ${piano.clips.length} tagli, stile ${stileCorrente}): ${piano.testo}`,
    regia.scaletta ? `Scaletta: ${[].concat(regia.scaletta).join(' → ')}` : '',
    avvisi.length ? `Avvisi: ${avvisi.join(' · ')}` : '',
    rigaConsumi(),
  ].filter(Boolean).join('\n\n');
  fs.writeFileSync(path.join(WORK, 'prova-regia.txt'), testo);
  fs.writeFileSync(path.join(WORK, 'regia.json'), JSON.stringify(regia, null, 1));
  try {
    rclone('copyto', path.join(WORK, 'prova-regia.txt'), remote(dir, nome, CACHE, 'prova-regia.txt'));
    rclone('copyto', path.join(WORK, 'regia.json'), remote(dir, nome, CACHE, 'regia-prova.json'));
  } catch (e) { log('prova regia non salvata su Drive', e.message); }
  await notifica('📝 prova regia', nome, testo);
}

async function main() {
  if (process.env.AZIONE === 'regia') {
    return provaRegia().catch(async (e) => {
      log(e.stack || e.message);
      await notifica('⚠️ prova regia', process.env.CARTELLA || '—', `Errore: ${e.message}`);
      process.exitCode = 1;
    });
  }
  job = trovaCartella() || {};
  if (!job.nome) { log('niente da fare'); return; }
  const { nome, files } = job;
  let { vai } = job;
  log(`cartella: ${nome} (${files.length} file)`);
  fs.rmSync(WORK, { recursive: true, force: true });
  fs.rmSync(MEDIA, { recursive: true, force: true });
  fs.rmSync(SCARICO, { recursive: true, force: true });
  fs.mkdirSync(SCARICO, { recursive: true });
  fs.mkdirSync(path.join(WORK, 'fogli'), { recursive: true });
  fs.mkdirSync(MEDIA, { recursive: true });
  // prenoto il VAI (se il workflow non l'ha già fatto): niente doppi montaggi della stessa cartella
  if (vai && isVai(vai)) {
    try { rclone('moveto', remote(SRC_DIR, nome, vai), remote(SRC_DIR, nome, `_VAI_in_corso_${vai}`)); vai = `_VAI_in_corso_${vai}`; }
    catch (e) { log('non riesco a prenotare il VAI', e.message); }
  }
  const vaiUsato = vai ? `_VAI_usato_${nomeVaiOriginale(vai)}` : null;

  // video da Telegram: originali in 97/<nome>, risultato in 98/<nome> (niente spostamento)
  const DEST = DA_TELEGRAM ? OUT_DIR : SRC_DIR;
  let copiaOriginali = null;
  let avvisoOriginali = '';
  try {
    const isMedia = (f) => VIDEO_EXT.concat(IMAGE_EXT, AUDIO_EXT).includes(path.extname(f.Name).toLowerCase()) && !isNostro(f.Name);
    if (DA_TELEGRAM) {
      const refs = JSON.parse(TELEGRAM_FILE);
      await fase(nome, `📥 Scarico ${refs.length} file da Telegram`, 'scarico');
      run(process.env.REGISTA_PYTHON || 'python3', [path.join(ROOT, 'scripts', 'scarica-telegram.py'), SCARICO], { stdio: 'inherit' });
      // gli originali vanno in 97 mentre analisi, AI e render proseguono
      copiaOriginali = inSottofondo('rclone', ['copy', SCARICO, remote(IN_DIR, nome), '--transfers', '8']);
    } else {
      // correzione di un video nato da Telegram: in 98 c'è solo il risultato, gli originali sono in 97
      let dirMedia = SRC_DIR;
      let media = files.filter(isMedia);
      if (SRC_DIR === OUT_DIR && !media.length) {
        try {
          const in97 = JSON.parse(rclone('lsjson', remote(IN_DIR, nome), '--files-only')).filter(isMedia);
          if (in97.length) { dirMedia = IN_DIR; media = in97; log(`originali in ${IN_DIR}/${nome}`); }
        } catch { /* non c'è nemmeno in 97 */ }
      }
      const peso = media.reduce((t, f) => t + (f.Size || 0), 0);
      await fase(nome, `${CORREZIONE ? '✏️ Correzione · ' : ''}📥 Scarico ${media.length} file (${mb(peso)})`, 'scarico');
      // solo il materiale: niente sottocartelle (_regista), niente video finali/note/segnali
      rclone('copy', remote(dirMedia, nome), SCARICO, '--max-depth', '1', '--transfers', '8', '--multi-thread-streams', '8',
        '--exclude', '*.XML', '--exclude', '*.xml', '--exclude', '*FINALE*', '--exclude', '_VAI_*', '--exclude', '*.txt');
    }
    try { rclone('copy', remote(SRC_DIR, nome), SCARICO, '--max-depth', '1', '--include', 'brief.txt'); } catch { /* cartella nuova */ }

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
    await fase(nome, '🎞️ Analizzo il girato (audio, sincronizzazione, trascrizione, fogli provino)', 'prepara');

    const briefFile = fs.existsSync(path.join(SCARICO, 'brief.txt')) ? fs.readFileSync(path.join(SCARICO, 'brief.txt'), 'utf8') : '';
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
    const { stile, avviso: avvisoStile } = scegliStile(brief);
    stileCorrente = stile;
    if (stile !== STILI[0]) log(`stile: ${stile}`);
    const pesoAI = ` · materiale ≈ ${kTok(stima.totale)} token`;
    await fase(nome, CORREZIONE ? `🧠 Applico la correzione: “${CORREZIONE.slice(0, 120)}”${pesoAI}`
      : `🧠 Scelgo i tagli: ${analisi.sorgenti.length} sorgenti, voce da ${voci || '—'}, ${sinc} camere sincronizzate, ${analisi.frasi.length} frasi${brief ? ', con brief' : ''}${pesoAI}`, 'regia');
    const { regia, risultato: { piano, avvisi } } = await chiediRegia(testoMateriale, fogli, CORREZIONE ? regiaPrecedente : null, (r) => risolviRegia(r, analisi));
    if (avvisi.length) log('avvisi regia:', avvisi.join(' | '));
    if (regia.scaletta) log('scaletta:', [].concat(regia.scaletta).join(' → '));
    log('testo montato:', piano.testo);
    if (avvisoStile) analisi.avvisi = [...(analisi.avvisi || []), avvisoStile];
    if (analisi.avvisi?.length) piano.note = [...analisi.avvisi.map((a) => `⚠️ ${a}`), piano.note].filter(Boolean).join(' · ');
    // effetti sonori sotto la voce: più bassa la voce registrata, più bassi gli effetti (~12–16 dB sotto)
    const livelloVoce = Math.max(-60, ...analisi.sorgenti.filter((s) => s.principale && s.livello != null).map((s) => s.livello));
    piano.sfx = process.env.REGISTA_SFX === '0' ? false
      : { volume: +Math.min(0.6, Math.max(0.1, livelloVoce > -60 ? 10 ** ((livelloVoce + 2) / 20) : 0.25)).toFixed(3) };
    const durataPiano = piano.clips.reduce((s, c) => s + (c.end - c.start), 0);
    const camereUsate = new Set(piano.clips.map((c) => c.file)).size;
    await fase(nome, `🎬 Render: ${durataPiano.toFixed(0)} s, ${piano.clips.length} tagli da ${camereUsate} sorgenti, ${piano.keywords.length} parole chiave`, 'render');
    // solo adesso si ricodificano i pezzi scelti, poi gli originali non servono più
    tagliaSegmenti(piano, analisi);
    // prima di cancellarli, gli originali devono essere su Drive; se la copia fallisce il video si consegna lo stesso
    if (copiaOriginali) {
      try { await copiaOriginali; } catch (e) { avvisoOriginali = `⚠️ originali non copiati in ${IN_DIR}/${nome} (${e.message}): restano nella chat Telegram`; log(avvisoOriginali); }
    }
    fs.rmSync(SCARICO, { recursive: true, force: true });
    fs.writeFileSync(path.join(WORK, 'piano.json'), JSON.stringify(piano, null, 1));
    validaPiano(piano);

    // nome con versione: FINALE, FINALE v2, FINALE v3...
    const versioni = files.filter((f) => /FINALE( v\d+)?\.mp4$/i.test(f.Name)).length;
    const finale = `${nome} - FINALE${versioni ? ` v${versioni + 1}` : ''}.mp4`;
    const outFile = path.join(ROOT, 'out', finale);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    renderizza(outFile, stile);
    await fase(nome, '📤 Carico su Drive', 'carico');

    const durataN = probe(outFile).durata;
    const durata = durataN.toFixed(1);
    const note = [
      `${CORREZIONE ? `Correzione (“${CORREZIONE}”)` : 'Montato automaticamente'} il ${new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' })} in ${trascorso()}`,
      `Durata: ${durata} s · ${stile === 'Blueprint' ? piano.tavola : `stile ${stile}`} · ${piano.clips.length} tagli da ${camereUsate} sorgenti · voce: ${voci || 'audio delle clip'}`,
      `Parole chiave: ${piano.keywords.map((k) => `${k.word} @${k.at.toFixed(1)}s`).join(', ') || '—'}`,
      piano.testo ? `Testo: ${piano.testo}` : '',
      piano.note ? `Note: ${piano.note}` : '',
      `File: ${OUT_DIR}/${nome}/${finale}`,
      DA_TELEGRAM ? (avvisoOriginali || `Originali: ${IN_DIR}/${nome}`) : '',
      rigaConsumi(),
    ].filter(Boolean).join('\n');
    fs.writeFileSync(path.join(WORK, 'NOTE.txt'), note);

    rclone('copyto', outFile, remote(DEST, nome, finale));
    rclone('copyto', path.join(WORK, 'NOTE.txt'), remote(DEST, nome, 'NOTE.txt'));
    for (const f of ['regia.json', 'piano.json', 'materiale.json']) rclone('copyto', path.join(WORK, f), remote(DEST, nome, CACHE, f));
    if (vai) rclone('moveto', remote(SRC_DIR, nome, vai), remote(SRC_DIR, nome, vaiUsato));
    if (SRC_DIR === IN_DIR && !DA_TELEGRAM) rclone('moveto', remote(IN_DIR, nome), remote(OUT_DIR, nome));

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
      : vai ? `Per riprovare: 🔁 Riprova dal bot, oppure rinomina ${vaiUsato} in ${nomeVaiOriginale(vai)}.` : 'Per riprovare: 🔁 Riprova.');
    fs.mkdirSync(WORK, { recursive: true });
    fs.writeFileSync(path.join(WORK, 'ERRORE.txt'), testo);
    // video da Telegram: gli originali devono arrivare in 97 anche se il montaggio è fallito (così 🔁 Riprova funziona)
    if (copiaOriginali) { try { await copiaOriginali; } catch (e3) { log('copia degli originali non riuscita', e3.message); } }
    try {
      rclone('copyto', path.join(WORK, 'ERRORE.txt'), remote(SRC_DIR, nome, 'ERRORE.txt'));
      if (vai) rclone('moveto', remote(SRC_DIR, nome, vai), remote(SRC_DIR, nome, vaiUsato));
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
export { fogliProvino, chiediRegia, rigaConsumi, tagliaSegmenti, WORK, MEDIA, SCARICO };
