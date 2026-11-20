// ✂️ Video lungo → 3 reel (16/11, Denis): da un video lungo (il girato letto al gobbo per YouTube, una chiacchierata)
// l'AI sceglie i 3 momenti più forti (25–60 s, che si capiscono da soli, con un aggancio nei primi secondi);
// ognuno si taglia dal girato ORIGINALE (copia senza ricodifica: resta il LOG, restano i dati del telefono), va
// in 01 · Da editare/<nome> · reel N e parte il montaggio verticale del Regista, ognuno in uno STILE DIVERSO
// (Denis: «così mal che vada almeno uno lo uso»). Il risultato arriva sul bot Regista come sempre.
// Con il copione del 📜 Redattore nella cartella (redazione.json) i suoi «reel da tagliare» fanno da suggerimento.
//
// Env: SORGENTE (file o cartella su Drive), STILI (es. «Cinematico|Kal|Ultra»), QUANTI (3), BRIEF (facoltativo),
//      GROQ_API_KEY, GEMINI_API_KEY(_GRATIS), GITHUB_TOKEN + GITHUB_REPOSITORY (per lanciare il Regista), PROVA=1 (non lancia)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { trascrivi } from './doc169.mjs';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const WORK = path.join(ROOT, 'work', 'tre-reel');
const REMOTE = process.env.REGISTA_REMOTE || 'gdrive';
const DA_EDITARE = process.env.DIR_DA_EDITARE || '01 · Da editare';
const log = (...a) => console.log('[tre-reel]', ...a);
const run = (cmd, args) => String(execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1 << 28 }) ?? '');

const PROMPT = (frasi, durata, quanti, suggeriti, brief) => `Sei l'editor dei social di Denis, creator italiano (tech, storia, attualità). Questo è un suo video lungo (${Math.round(durata / 60)} minuti), trascritto con i tempi in secondi:
${frasi.map((f) => `[${f.a}–${f.b}] ${f.t}`).join('\n')}
${suggeriti ? `\nIl suo redattore aveva segnato questi momenti da reel (usali se ci sono davvero):\n${suggeriti}\n` : ''}${brief ? `\nIndicazioni di Denis: ${brief}\n` : ''}
Scegli i ${quanti} momenti MIGLIORI da tagliare come reel verticali (Instagram, TikTok, YouTube Shorts):
- ognuno dura 25–60 secondi e si capisce DA SOLO, senza il resto del video;
- inizia con una frase che aggancia (una domanda, un fatto che sorprende, un'affermazione forte), mai a metà di un discorso;
- finisce su una frase chiusa (una conclusione, una battuta, una domanda al pubblico);
- momenti diversi tra loro (argomenti diversi), senza sovrapposizioni;
- "da" = inizio della prima frase, "a" = fine dell'ultima, presi dalla trascrizione.
Rispondi SOLO con JSON: {"reel":[{"da":12.3,"a":58.1,"titolo":"2–5 parole","gancio":"la prima frase","perche":"perché funziona, breve"}]}`;

async function chiedi(prompt) {
  const giri = [
    ...(process.env.GEMINI_API_KEY_GRATIS ? ['gemini-flash-latest', 'gemini-flash-lite-latest'].map((m) => [process.env.GEMINI_API_KEY_GRATIS, m]) : []),
    ...(process.env.GEMINI_API_KEY ? [[process.env.GEMINI_API_KEY, 'gemini-flash-lite-latest']] : []),
  ];
  for (const [chiave, modello] of giri) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modello}:generateContent`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': chiave }, signal: AbortSignal.timeout(180_000),
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4, responseMimeType: 'application/json' } }),
      });
      if (!r.ok) { log(`${modello}: ${r.status}`); continue; }
      const j = await r.json();
      return JSON.parse((j.candidates?.[0]?.content?.parts || []).map((x) => x.text || '').join(''));
    } catch (e) { log(`${modello}: ${e.message}`); }
  }
  throw new Error('Gemini non ha risposto');
}

// i tempi dell'AI si agganciano all'inizio/fine vera delle frasi; durata 20–75 s; niente sovrapposizioni
export function pulisciMomenti(lista, frasi, durata, quanti) {
  const fuori = [];
  for (const m of [...(lista || [])]) {
    if (!frasi.length) break;
    const inizio = frasi.reduce((x, f) => (Math.abs(f.a - m.da) < Math.abs(x.a - m.da) ? f : x));
    const fine = frasi.reduce((x, f) => (Math.abs(f.b - m.a) < Math.abs(x.b - m.a) ? f : x));
    const da = Math.max(0, inizio.a - 0.25), a = Math.min(durata, fine.b + 0.4);
    if (!(a - da >= 20 && a - da <= 75)) continue;
    if (fuori.some((x) => da < x.a && a > x.da)) continue;
    fuori.push({ da: +da.toFixed(2), a: +a.toFixed(2), titolo: String(m.titolo || '').slice(0, 40), gancio: String(m.gancio || '').slice(0, 200), perche: String(m.perche || '').slice(0, 200) });
    if (fuori.length >= quanti) break;
  }
  return fuori.sort((x, y) => x.da - y.da);
}

const pulito = (t) => String(t).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();

async function lanciaRegista(cartella, brief) {
  if (process.env.PROVA) { log(`(prova) Regista: ${cartella} · ${brief}`); return true; }
  const r = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/actions/workflows/regista.yml/dispatches`, {
    method: 'POST', headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' },
    body: JSON.stringify({ ref: process.env.GITHUB_REF_NAME || 'main', inputs: { cartella, brief, origine: '97', macchine: '4' } }),
  });
  if (r.status !== 204) log(`Regista non partito per ${cartella}: GitHub ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.status === 204;
}

export async function main() {
  let sorgente = process.env.SORGENTE || '';
  if (!sorgente) throw new Error('serve SORGENTE');
  const quanti = Math.min(5, Math.max(1, Number(process.env.QUANTI) || 3));
  const stili = (process.env.STILI || 'Cinematico|Kal|Ultra').split('|').map((s) => s.trim()).filter(Boolean);
  fs.rmSync(WORK, { recursive: true, force: true });
  fs.mkdirSync(WORK, { recursive: true });
  let suggeriti = '', nome;
  if (!/\.(mp4|mov|m4v|mkv)$/i.test(sorgente)) {
    const files = JSON.parse(run('rclone', ['lsjson', `${REMOTE}:${sorgente}`, '--files-only'])).filter((f) => !f.Name.startsWith('_') && !/FINALE|DOCUMENTARIO|YOUTUBE/i.test(f.Name));
    const video = files.filter((f) => /\.(mp4|mov|m4v|mkv)$/i.test(f.Name)).sort((a, b) => b.Size - a.Size)[0];
    if (!video) throw new Error(`nella cartella ${sorgente} non c'è un video`);
    if (files.some((f) => f.Name === 'redazione.json')) {
      try {
        const red = JSON.parse(run('rclone', ['cat', `${REMOTE}:${sorgente}/redazione.json`]));
        suggeriti = (red.reel || []).map((x) => `- ${x.titolo}: ${x.perche}${red.capitoli?.[x.capitolo] ? ` (capitolo «${red.capitoli[x.capitolo].titolo}»)` : ''}`).join('\n');
      } catch { /* senza suggerimenti */ }
    }
    nome = path.basename(sorgente);
    sorgente = `${sorgente}/${video.Name}`;
  }
  nome = pulito(nome || path.parse(sorgente).name).slice(0, 50);
  const src = path.join(WORK, path.basename(sorgente));
  run('rclone', ['copyto', `${REMOTE}:${sorgente}`, src, '--multi-thread-streams', '4']);
  const durata = Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', src]).trim());
  log(`${sorgente}: ${(durata / 60).toFixed(1)} min`);
  const { frasi } = await trascrivi(src, WORK);
  log(`trascrizione: ${frasi.length} frasi`);
  if (durata < 60 || frasi.length < 5) throw new Error('video troppo corto per tagliarne dei reel');
  const ai = await chiedi(PROMPT(frasi, durata, quanti, suggeriti, process.env.BRIEF || ''));
  const momenti = pulisciMomenti(ai.reel, frasi, durata, quanti);
  if (!momenti.length) throw new Error('l\'AI non ha trovato momenti buoni');
  const ext = path.extname(src) || '.mp4';
  const esiti = [];
  for (const [i, m] of momenti.entries()) {
    const stile = stili[i % stili.length];
    const cartella = pulito(`${nome} · reel ${i + 1} ${m.titolo}`).slice(0, 90);
    // copia senza ricodifica (parte dal fotogramma chiave prima: il Regista toglie comunque le pause in testa);
    // il nome del file resta quello del telefono, così il Regista riconosce dispositivo e LOG
    const pezzo = path.join(WORK, `${path.parse(src).name}_reel${i + 1}${ext}`);
    run('ffmpeg', ['-y', '-v', 'error', '-ss', String(m.da), '-i', src, '-t', String(+(m.a - m.da).toFixed(2)), '-map', '0:v:0', '-map', '0:a:0?', '-c', 'copy',
      '-map_metadata', '0', '-avoid_negative_ts', 'make_zero', '-movflags', '+faststart', pezzo]);
    run('rclone', ['copyto', pezzo, `${REMOTE}:${DA_EDITARE}/${cartella}/${path.basename(pezzo)}`]);
    const brief = [`Stile: ${stile}`, 'Durata: 30-60 s', `Note: reel tagliato dal video lungo «${nome}». Aggancio: «${m.gancio}». Tieni tutto il filo del discorso`, process.env.BRIEF || ''].filter(Boolean).join('. ');
    const partito = await lanciaRegista(cartella, brief.slice(0, 900));
    esiti.push({ ...m, stile, cartella, partito });
    log(`reel ${i + 1} · ${stile} · ${m.da}–${m.a} s · «${m.titolo}»${partito ? '' : ' · Regista NON partito'}`);
  }
  const registro = path.join(WORK, 'tre-reel.json');
  fs.writeFileSync(registro, JSON.stringify({ sorgente, momenti: esiti }, null, 1));
  run('rclone', ['copyto', registro, `${REMOTE}:12 · Risorse/_registri/tre-reel-${process.env.GITHUB_RUN_ID || 'locale'}.json`]);
  log(`fatto: ${esiti.filter((x) => x.partito).length} reel in montaggio`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main().catch((e) => { console.error(e); process.exit(1); });
