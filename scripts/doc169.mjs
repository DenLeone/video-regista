// Documentario 16:9 (workflow doc169.yml, 15/11): un girato di Denis che parla diventa un pezzo in stile
// documentario Netflix, in orizzontale:
//   1. colore: conversione tecnica (I-Log → Rec709) + look D2 (lut/documentario.cube, freddo e opaco) con la
//      pelle che resta col colore del girato (scripts/look/pelle.py, MediaPipe)
//   2. trascrizione (Whisper su Groq)
//   3. titoli scelti dall'AI (Gemini): riga piccola, riga grande a lettere larghe, ogni tanto una parola rossa
//   4. render Remotion (src/doc169/Doc169.tsx) con le bande 2,39:1 → su Drive
// Per ora niente tagli: il girato resta intero.
//
// Variabili: SORGENTE (file su Drive), USCITA (cartella su Drive), BRIEF (facoltativo), GROQ_API_KEY, GEMINI_API_KEY

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { filtroTecnico, probe, riconosciLog } from './colore.mjs';
import { dispositivo } from './sorgenti.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const REMOTE = process.env.REGISTA_REMOTE || 'gdrive';
const WORK = path.join(ROOT, 'work', 'doc169');
const SCARICO = process.env.DOC_SCARICO || path.join(WORK, 'in');
const PUB = path.join(ROOT, 'public', 'doc169');
const log = (...a) => console.log('[doc169]', ...a);
const run = (cmd, args, opts = {}) => String(execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1 << 28, timeout: 40 * 60 * 1000, ...opts }) ?? '');

function preparaMediaPipe() {
  const venv = path.join(WORK, 'venv'), modello = path.join(WORK, 'selfie_multiclass.tflite');
  let py = process.env.DOC_PYTHON || 'python3';
  try { run(py, ['-c', 'import mediapipe, cv2']); } catch {
    if (!fs.existsSync(path.join(venv, 'bin', 'python'))) run('python3', ['-m', 'venv', venv]);
    py = path.join(venv, 'bin', 'python');
    run(py, ['-m', 'pip', 'install', '--quiet', 'mediapipe', 'opencv-python-headless']);
  }
  if (!fs.existsSync(modello)) run('curl', ['-fsSL', '--retry', '3', '-o', modello, 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite']);
  return { py, modello };
}

async function trascrivi(src) {
  const mp3 = path.join(WORK, 'voce.mp3');
  run('ffmpeg', ['-y', '-v', 'error', '-i', src, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '48k', mp3]);
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(mp3)]), 'voce.mp3');
  form.append('model', 'whisper-large-v3');
  form.append('language', 'it');
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'segment');
  const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY || ''}` }, body: form });
  if (!r.ok) throw new Error(`trascrizione: Groq ${r.status}`);
  const j = await r.json();
  return (j.segments || []).map((g) => ({ a: +g.start.toFixed(2), b: +g.end.toFixed(2), t: g.text.trim() }));
}

const PROMPT = (frasi, durata, brief) => `Sei il regista di un breve documentario in stile Netflix. Questa è la trascrizione di Denis che parla in camera (${durata.toFixed(0)} s), con i tempi in secondi:
${frasi.map((f) => `[${f.a}–${f.b}] ${f.t}`).join('\n')}
${brief ? `\nIndicazioni di Denis: ${brief}\n` : ''}
Scegli i TITOLI che compaiono sopra il video, come nei documentari: pochi ed eleganti.
- Da 2 a 4 titoli, distanziati (almeno 12 s tra uno e l'altro); il primo entro i primi 3 s, come apertura.
- "at": il secondo in cui parte la frase a cui il titolo si riferisce. "dur": da 4 a 6 secondi.
- "piccolo": 1–3 parole sopra (es. "Capitolo 1", un luogo, un anno, un nome). Può mancare.
- "grande": 2–4 parole che riassumono quel momento, in italiano, al massimo 18 caratteri. Niente punto finale.
- "rosso": UNA sola parola forte presa da quello che Denis dice in quel momento (il concetto chiave, un'emozione, un numero), oppure null. Al massimo metà dei titoli ha la parola rossa: è un accento, non una regola. La parola rossa NON ripete una parola già nel "grande".
- Non inventare fatti che Denis non dice.
Rispondi SOLO con JSON: {"titoli":[{"at":0.5,"dur":5,"piccolo":"…","grande":"…","rosso":"…"}]}`;

async function titoli(frasi, durata, brief) {
  const chiave = process.env.GEMINI_API_KEY;
  if (!chiave || !frasi.length) return [];
  for (const modello of (process.env.DOC_MODELLI || 'gemini-flash-latest,gemini-flash-lite-latest').split(',')) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modello}:generateContent`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': chiave }, signal: AbortSignal.timeout(120_000),
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: PROMPT(frasi, durata, brief) }] }], generationConfig: { temperature: 0.5, responseMimeType: 'application/json' } }),
      });
      const j = await r.json();
      if (!r.ok) { log(`${modello}: ${r.status}`); continue; }
      const testo = (j.candidates?.[0]?.content?.parts || []).map((x) => x.text || '').join('');
      return pulisciTitoli(JSON.parse(testo).titoli || [], durata);
    } catch (e) { log(`${modello}: ${e.message}`); }
  }
  return [];
}

// numeri nei limiti, niente sovrapposizioni, niente titoli oltre la fine
export function pulisciTitoli(lista, durata) {
  const fuori = [];
  for (const t of [...lista].sort((a, b) => a.at - b.at)) {
    const at = Math.max(0, Number(t.at) || 0);
    const dur = Math.min(6, Math.max(3, Number(t.dur) || 5));
    if (!t.grande || at > durata - 2) continue;
    if (fuori.length && at < fuori.at(-1).at + fuori.at(-1).dur + 1) continue;
    fuori.push({ at: +at.toFixed(2), dur: +Math.min(dur, durata - at).toFixed(2), piccolo: t.piccolo ? String(t.piccolo).slice(0, 30) : undefined,
      grande: String(t.grande).slice(0, 24), rosso: t.rosso ? String(t.rosso).split(/\s+/)[0].slice(0, 14) : null });
  }
  return fuori.slice(0, 5);
}

async function main() {
  const sorgente = process.env.SORGENTE, uscita = process.env.USCITA;
  if (!sorgente || !uscita) throw new Error('servono SORGENTE e USCITA');
  fs.rmSync(WORK, { recursive: true, force: true });
  fs.mkdirSync(SCARICO, { recursive: true });
  fs.mkdirSync(PUB, { recursive: true });
  const src = path.join(SCARICO, `girato${path.extname(sorgente) || '.mp4'}`);
  run('rclone', ['copyto', `${REMOTE}:${sorgente}`, src, '--multi-thread-streams', '4']);
  const info = probe(src);
  const disp = dispositivo(path.basename(sorgente), info.tags);
  const lg = riconosciLog(src, info, disp, process.env.BRIEF || '', WORK);
  const base = filtroTecnico(info.colore).replace(/,?format=yuv420p$/, '') || 'null';
  log(`${sorgente}: ${info.w}x${info.h} · ${info.fps} fps · ${info.durata.toFixed(1)} s${lg.iLog ? ' · I-Log' : ''}`);
  const fps = Math.round(Number(info.fps) || 24) || 24;

  // 1. colore (in parallelo la trascrizione)
  const { py, modello } = preparaMediaPipe();
  const girato = path.join(PUB, 'girato.mp4');
  const colore = new Promise((ok, ko) => {
    import('node:child_process').then(({ execFile }) => execFile(py, [path.join(ROOT, 'scripts', 'look', 'pelle.py'), src, girato, modello, base,
      `lut3d=file='${path.join(ROOT, 'lut', 'documentario.cube')}':interp=tetrahedral`, "curves=all='0/0.03 1/0.97'", '--fps', String(fps)],
    { maxBuffer: 1 << 26, timeout: 40 * 60 * 1000 }, (e, out, err) => (e ? ko(new Error(`${e.message}\n${err}`)) : ok(out))));
  });
  const frasi = await trascrivi(src).catch((e) => { log(e.message); return []; });
  fs.writeFileSync(path.join(WORK, 'trascrizione.txt'), frasi.map((f) => `[${f.a}–${f.b}] ${f.t}`).join('\n'));
  log(`trascrizione: ${frasi.length} frasi`);
  // DOC_TITOLI: titoli scritti a mano (JSON), per correggere quelli dell'AI senza rifare la scelta
  const scelti = process.env.DOC_TITOLI ? pulisciTitoli(JSON.parse(process.env.DOC_TITOLI), info.durata) : await titoli(frasi, info.durata, process.env.BRIEF || '');
  log(`titoli: ${scelti.map((t) => `${t.at}s ${t.piccolo || ''} | ${t.grande}${t.rosso ? ` | ${t.rosso}` : ''}`).join(' · ') || 'nessuno'}`);
  log((await colore).trim().split('\n').pop());

  // 2. render
  const props = { video: 'doc169/girato.mp4', durata: +probe(girato).durata.toFixed(2), fps, bande: true, titoli: scelti };
  const pj = path.join(WORK, 'props.json');
  fs.writeFileSync(pj, JSON.stringify(props, null, 1));
  const nome = `${path.parse(sorgente).name} - DOCUMENTARIO.mp4`;
  const out = path.join(WORK, nome);
  run('npx', ['remotion', 'render', 'src/index.ts', 'Doc169', out, `--props=${pj}`, '--codec=h264', '--video-bitrate=14M', '--audio-bitrate=320k',
    '--concurrency=100%', '--color-space=bt709', ...(process.env.REMOTION_BROWSER ? [`--browser-executable=${process.env.REMOTION_BROWSER}`] : [])],
  { cwd: ROOT, stdio: 'inherit' });

  // 3. su Drive: video, titoli e trascrizione
  for (const f of [out, pj, path.join(WORK, 'trascrizione.txt')]) run('rclone', ['copyto', f, `${REMOTE}:${uscita}/${f === pj ? 'titoli.json' : path.basename(f)}`]);
  log(`fatto: ${uscita}/${nome}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
