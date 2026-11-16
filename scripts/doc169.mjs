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
  form.append('timestamp_granularities[]', 'word');
  const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY || ''}` }, body: form });
  if (!r.ok) throw new Error(`trascrizione: Groq ${r.status}`);
  const j = await r.json();
  return { frasi: (j.segments || []).map((g) => ({ a: +g.start.toFixed(2), b: +g.end.toFixed(2), t: g.text.trim() })),
    parole: (j.words || []).map((w) => ({ w: String(w.word).trim(), a: +w.start.toFixed(2), b: +w.end.toFixed(2) })) };
}

const PROMPT = (frasi, durata, brief) => `Sei il regista di un breve documentario in stile Netflix. Questa è la trascrizione di Denis che parla in camera (${durata.toFixed(0)} s), con i tempi in secondi:
${frasi.map((f) => `[${f.a}–${f.b}] ${f.t}`).join('\n')}
${brief ? `\nIndicazioni di Denis: ${brief}\n` : ''}
Scegli le SCRITTE che compaiono sopra il video.

1. "titoli": da 2 a 3 titoli, distanziati (almeno 15 s tra uno e l'altro); il primo entro i primi 3 s, come apertura.
- "at": il secondo in cui parte la frase a cui il titolo si riferisce. "dur": 5 o 6 secondi.
- "piccolo": 1–3 parole sopra (es. "Capitolo 1", un luogo, un anno, un nome).
- "grande": 2–4 parole che riassumono quel momento, in italiano, al massimo 18 caratteri. Niente punto finale.
- "rosso": UNA parola forte detta da Denis in quel momento, diversa da quelle del "grande".

2. "parole": le parole da far esplodere in rosso, grandi, da sole. Denis vuole UNA PAROLA OGNI 4–5 SECONDI per tutto il video, tranne mentre c'è un titolo.
- Ognuna è una parola che Denis DICE davvero in quel punto (scritta esattamente come nella trascrizione): il concetto chiave della frase, un numero, un nome, un'emozione. Mai articoli, congiunzioni, verbi generici ("è", "fare", "ho").
- "at": il secondo in cui Denis la pronuncia (dentro l'intervallo della sua frase).
- Niente due parole uguali di fila.

Non inventare fatti che Denis non dice.
Rispondi SOLO con JSON: {"titoli":[{"at":0.5,"dur":5,"piccolo":"…","grande":"…","rosso":"…"}],"parole":[{"at":7.2,"parola":"…"}]}`;

async function titoli(frasi, durata, brief) {
  // lavoro facile (solo testo): chiave gratuita con Flash e Flash-Lite, poi quella a pagamento solo con Flash-Lite
  const giri = [
    ...(process.env.GEMINI_API_KEY_GRATIS ? (process.env.DOC_MODELLI || 'gemini-flash-latest,gemini-flash-lite-latest').split(',').map((m) => [process.env.GEMINI_API_KEY_GRATIS, m]) : []),
    ...(process.env.GEMINI_API_KEY ? [[process.env.GEMINI_API_KEY, 'gemini-flash-lite-latest']] : []),
  ];
  if (!giri.length || !frasi.length) return { titoli: [], parole: [] };
  for (const [chiave, modello] of giri) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modello}:generateContent`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': chiave }, signal: AbortSignal.timeout(120_000),
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: PROMPT(frasi, durata, brief) }] }], generationConfig: { temperature: 0.5, responseMimeType: 'application/json' } }),
      });
      const j = await r.json();
      if (!r.ok) { log(`${modello}: ${r.status}`); continue; }
      const testo = (j.candidates?.[0]?.content?.parts || []).map((x) => x.text || '').join('');
      const j2 = JSON.parse(testo);
      return { titoli: pulisciTitoli(j2.titoli || [], durata), parole: j2.parole || [] };
    } catch (e) { log(`${modello}: ${e.message}`); }
  }
  return { titoli: [], parole: [] };
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

// Fasi (DOC_FASE): scarica, colore, titoli, video, drive — una per passo del workflow, così la scheda di
// avanzamento su Telegram mostra ognuna (15/11). Lo stato passa da una all'altra in work/doc169/stato.json.
// Senza DOC_FASE fa tutto di fila.
const STATO = path.join(WORK, 'stato.json');
const leggiStato = () => JSON.parse(fs.readFileSync(STATO, 'utf8'));
const FASI = {
  scarica() {
    let sorgente = process.env.SORGENTE;
    const uscita = process.env.USCITA;
    if (!sorgente || !uscita) throw new Error('servono SORGENTE e USCITA');
    fs.rmSync(WORK, { recursive: true, force: true });
    fs.mkdirSync(SCARICO, { recursive: true });
    fs.mkdirSync(PUB, { recursive: true });
    // una cartella (tasto 🎬 Netflix 16:9 del bot, 16/11): il video più grande è il girato; un brano audio
    // nella cartella fa da musica, se non è già indicata
    let musicaCartella = null, nomeCartella = null;
    if (!/\.(mp4|mov|m4v|mkv)$/i.test(sorgente)) {
      const files = JSON.parse(run('rclone', ['lsjson', `${REMOTE}:${sorgente}`, '--files-only'])).filter((f) => !f.Name.startsWith('_') && !/FINALE|DOCUMENTARIO/i.test(f.Name));
      const video = files.filter((f) => /\.(mp4|mov|m4v|mkv)$/i.test(f.Name)).sort((a, b) => b.Size - a.Size)[0];
      if (!video) throw new Error(`nella cartella ${sorgente} non c'è un video`);
      const brano = files.find((f) => /\.(mp3|m4a|wav|aac|flac)$/i.test(f.Name));
      if (brano) musicaCartella = `${sorgente}/${brano.Name}`;
      nomeCartella = path.basename(sorgente);
      sorgente = `${sorgente}/${video.Name}`;
      log(`cartella: girato ${video.Name}${brano ? `, musica ${brano.Name}` : ''}`);
    }
    const src = path.join(SCARICO, `girato${path.extname(sorgente) || '.mp4'}`);
    run('rclone', ['copyto', `${REMOTE}:${sorgente}`, src, '--multi-thread-streams', '4']);
    const info = probe(src);
    const lg = riconosciLog(src, info, dispositivo(path.basename(sorgente), info.tags), process.env.BRIEF || '', WORK);
    const base = filtroTecnico(info.colore).replace(/,?format=yuv420p$/, '') || 'null';
    log(`${sorgente}: ${info.w}x${info.h} · ${info.fps} fps · ${info.durata.toFixed(1)} s${lg.iLog ? ' · I-Log' : ''}`);
    // musica (facoltativa): il nome di un brano in Assets/Music, preparato a volume uniforme (solo l'audio:
    // gli mp3 di Suno hanno la copertina)
    let musica = null;
    if (musicaCartella && !process.env.MUSICA) {
      const grezzo = path.join(WORK, `musica${path.extname(musicaCartella)}`);
      run('rclone', ['copyto', `${REMOTE}:${musicaCartella}`, grezzo]);
      musica = path.join(WORK, 'musica.m4a');
      run('ffmpeg', ['-y', '-v', 'error', '-i', grezzo, '-map', '0:a:0', '-vn', '-af', 'loudnorm=I=-18:TP=-2', '-ar', '48000', '-c:a', 'aac', '-b:a', '256k', musica]);
    } else if (process.env.MUSICA) {
      const dir = `${process.env.DIR_ASSETS || '12 · Risorse/Assets'}/Music`;
      const cerca = norm(process.env.MUSICA.replace(/\.[a-z0-9]+$/i, ''));
      const nome = run('rclone', ['lsf', `${REMOTE}:${dir}`, '--files-only']).split('\n').find((f) => norm(f.replace(/\.[a-z0-9]+$/i, '')) === cerca);
      if (!nome) log(`musica «${process.env.MUSICA}» non trovata in ${dir}: video senza musica`);
      else {
        const grezzo = path.join(WORK, `musica${path.extname(nome)}`);
        run('rclone', ['copyto', `${REMOTE}:${dir}/${nome}`, grezzo]);
        musica = path.join(WORK, 'musica.m4a');
        run('ffmpeg', ['-y', '-v', 'error', '-i', grezzo, '-map', '0:a:0', '-vn', '-af', 'loudnorm=I=-18:TP=-2', '-ar', '48000', '-c:a', 'aac', '-b:a', '256k', musica]);
        log(`musica: ${nome}`);
      }
    }
    fs.writeFileSync(STATO, JSON.stringify({ sorgente, uscita, src, base, musica, nome: nomeCartella, durata: info.durata, fps: Math.round(Number(info.fps) || 24) || 24 }));
  },
  colore() {
    const st = leggiStato();
    const { py, modello } = preparaMediaPipe();
    const esito = run(py, [path.join(ROOT, 'scripts', 'look', 'pelle.py'), st.src, path.join(PUB, 'girato.mp4'), modello, st.base,
      `lut3d=file='${path.join(ROOT, 'lut', 'documentario.cube')}':interp=tetrahedral`, "curves=all='0/0.03 1/0.97'", '--fps', String(st.fps)]);
    log(esito.trim().split('\n').pop());
  },
  async titoli() {
    const st = leggiStato();
    const { frasi, parole: detti } = await trascrivi(st.src).catch((e) => { log(e.message); return { frasi: [], parole: [] }; });
    fs.writeFileSync(path.join(WORK, 'trascrizione.txt'), frasi.map((f) => `[${f.a}–${f.b}] ${f.t}`).join('\n'));
    log(`trascrizione: ${frasi.length} frasi`);
    // DOC_TITOLI: titoli scritti a mano (JSON), per correggere quelli dell'AI senza rifare la scelta
    const mano = process.env.DOC_TITOLI ? JSON.parse(process.env.DOC_TITOLI) : null;
    const ai = mano ? { titoli: pulisciTitoli(Array.isArray(mano) ? mano : mano.titoli || [], st.durata), parole: mano.parole || [] } : await titoli(frasi, st.durata, process.env.BRIEF || '');
    const scelti = ai.titoli;
    const parole = pulisciParole(ai.parole || [], detti, scelti, st.durata);
    log(`titoli: ${scelti.map((t) => `${t.at}s ${t.piccolo || ''} | ${t.grande}${t.rosso ? ` | ${t.rosso}` : ''}`).join(' · ') || 'nessuno'}`);
    log(`parole rosse: ${parole.length} · ${parole.map((p) => `${p.at}s ${p.parola}`).join(' · ')}`);
    fs.writeFileSync(STATO, JSON.stringify({ ...st, titoli: scelti, parole }));
  },
  video() {
    const st = leggiStato();
    const props = { video: 'doc169/girato.mp4', durata: +probe(path.join(PUB, 'girato.mp4')).durata.toFixed(2), fps: st.fps, bande: true, titoli: st.titoli || [], parole: st.parole || [] };
    const pj = path.join(WORK, 'props.json');
    fs.writeFileSync(pj, JSON.stringify(props, null, 1));
    run('npx', ['remotion', 'render', 'src/index.ts', 'Doc169', path.join(WORK, nomeFinale(st)), `--props=${pj}`, '--codec=h264', '--video-bitrate=14M', '--audio-bitrate=320k',
      '--concurrency=100%', '--color-space=bt709', ...(process.env.REMOTION_BROWSER ? [`--browser-executable=${process.env.REMOTION_BROWSER}`] : [])],
    { cwd: ROOT, stdio: 'inherit' });
    if (st.musica) mixaMusica(path.join(WORK, nomeFinale(st)), st.musica, props.durata);
  },
  drive() {
    const st = leggiStato();
    const pj = path.join(WORK, 'props.json');
    for (const f of [path.join(WORK, nomeFinale(st)), pj, path.join(WORK, 'trascrizione.txt')]) run('rclone', ['copyto', f, `${REMOTE}:${st.uscita}/${f === pj ? 'titoli.json' : path.basename(f)}`]);
    log(`fatto: ${st.uscita}/${nomeFinale(st)}`);
  },
};
// la musica sotto la voce: bassa, scende ancora quando Denis parla (sidechain), entra e esce in dissolvenza;
// alla fine tutto a -14 LUFS (come i reel). Il video non si ricodifica
function mixaMusica(file, musica, durata) {
  const tmp = file.replace(/\.mp4$/, '.musica.mp4');
  const fine = Math.max(0, durata - 3).toFixed(2);
  run('ffmpeg', ['-y', '-v', 'error', '-i', file, '-stream_loop', '-1', '-i', musica, '-filter_complex',
    `[0:a]asplit=2[voce][chiave];[1:a]atrim=0:${durata},afade=t=in:d=1.5,afade=t=out:st=${fine}:d=3,volume=0.35[m];`
    + `[m][chiave]sidechaincompress=threshold=0.02:ratio=6:attack=30:release=500[giu];`
    + `[voce][giu]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5[a]`,
    '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-movflags', '+faststart', tmp]);
  fs.renameSync(tmp, file);
  log('musica mixata sotto la voce');
}

const nomeFinale = (st) => `${st.nome || path.parse(st.sorgente).name} - DOCUMENTARIO.mp4`;

// parole rosse: agganciate al momento vero in cui Denis le dice (tempi di Whisper), 3,5 s di distanza almeno,
// mai sopra un titolo; restano 1,8 s (o fino alla successiva)
const norm = (t) => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]/gu, '');
// parole che non reggono da sole in rosso
const VUOTE = new Set(['talmente', 'veramente', 'davvero', 'proprio', 'sempre', 'ancora', 'quindi', 'perche', 'questo', 'questa', 'quello', 'quella',
  'questi', 'quelle', 'quelli', 'allora', 'comunque', 'pero', 'anche', 'molto', 'tanto', 'tutto', 'tutti', 'niente', 'qualcosa', 'cosa', 'cose',
  'essere', 'avere', 'fare', 'fatto', 'stato', 'stata', 'sono', 'siamo', 'hanno', 'abbiamo', 'avevo', 'faccio', 'dire', 'detto', 'diciamo',
  'adesso', 'oggi', 'voglio', 'volevo', 'posso', 'devo', 'facciamo', 'abbiamo', 'perche', 'praticamente', 'insomma', 'magari', 'tipo', 'ovviamente', 'sicuramente', 'nella', 'nello', 'sulla', 'dalla', 'degli',
  'delle', 'della', 'dello', 'dove', 'come', 'quando', 'mentre', 'ogni', 'altro', 'altra', 'altri', 'stesso', 'stessa', 'vedere', 'andare', 'volta']);
export function pulisciParole(lista, detti, titoli, durata) {
  const fuori = [];
  for (const p of [...lista].sort((a, b) => a.at - b.at)) {
    const n = norm(p.parola);
    if (!n || VUOTE.has(n)) continue;
    const vicine = detti.filter((w) => norm(w.w) === n).sort((x, y) => Math.abs(x.a - p.at) - Math.abs(y.a - p.at));
    const at = vicine.length && Math.abs(vicine[0].a - p.at) < 4 ? vicine[0].a : Number(p.at);
    if (!Number.isFinite(at) || at < 0 || at > durata - 1) continue;
    if (titoli.some((t) => at > t.at - 0.5 && at < t.at + t.dur + 0.3)) continue;
    if (fuori.length && at - fuori.at(-1).at < 3.5) continue;
    fuori.push({ at: +at.toFixed(2), dur: 1.8, parola: String(vicine[0]?.w || p.parola).replace(/[^\p{L}\p{N}'’-]/gu, '').slice(0, 16) });
  }
  // Denis vuole una parola ogni 4–5 s: i buchi più lunghi di 5,5 s (fuori dai titoli) si riempiono con la parola
  // più "forte" detta lì (la più lunga che non sia una parola vuota)
  const libero = (a) => !titoli.some((t) => a > t.at - 0.5 && a < t.at + t.dur + 0.3);
  for (let giro = 0; giro < 40; giro++) {
    const punti = [0, ...fuori.map((p) => p.at), ...titoli.flatMap((t) => [t.at, t.at + t.dur]), durata - 1].sort((a, b) => a - b);
    let messo = false;
    for (let i = 0; i < punti.length - 1 && !messo; i++) {
      const [a, b] = [punti[i], punti[i + 1]];
      // dentro il buco, tolti i titoli: tratti liberi lunghi più di 5,5 s
      const cand = detti.filter((w) => w.a > a + 2.5 && w.a < b - 2.5 && libero(w.a) && norm(w.w).length >= 4 && !VUOTE.has(norm(w.w)));
      if (b - a <= 5.5 || !libero((a + b) / 2) || !cand.length) continue;
      const mezzo = (a + b) / 2;
      const w = cand.sort((x, y) => (norm(y.w).length - Math.abs(y.a - mezzo) * 0.8) - (norm(x.w).length - Math.abs(x.a - mezzo) * 0.8))[0];
      fuori.push({ at: w.a, dur: 1.8, parola: String(w.w).replace(/[^\p{L}\p{N}'’-]/gu, '').slice(0, 16) });
      fuori.sort((x, y) => x.at - y.at);
      messo = true;
    }
    if (!messo) break;
  }
  for (let i = 0; i < fuori.length - 1; i++) fuori[i].dur = +Math.min(1.8, fuori[i + 1].at - fuori[i].at - 0.2).toFixed(2);
  return fuori;
}

async function main() {
  const fase = process.env.DOC_FASE;
  if (fase && !FASI[fase]) throw new Error(`fase sconosciuta: ${fase}`);
  for (const f of fase ? [fase] : Object.keys(FASI)) await FASI[f]();
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
