// Rotolo, dopo il render: copertina, descrizione e 5 hashtag per i social, come per gli altri video.
//   node pc/rotolo/social.mjs <beats.json> <video finito.mp4> <cartella di uscita>
// L'AI (Claude Code, poi Gemini/Ollama con pc/ai.mjs) legge il parlato e i beat e sceglie il beat più
// forte, il testo della copertina, la descrizione e gli hashtag. Lo sfondo della copertina è il fotogramma
// più nitido di quel beat nel video finito; il titolo lo mette src/Copertina.tsx.
// Scrive <uscita>/copertina.jpg e <uscita>/social.json ({descrizione, hashtag, youtube_titolo, copertina, beat}).
// Senza AI: descrizione dalla prima frase e copertina con il titolo. Non fallisce mai il giro (exit 0).
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chiediAI } from '../ai.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const [fileBeats, video, uscita] = process.argv.slice(2);
if (!uscita) { console.error('uso: node pc/rotolo/social.mjs <beats.json> <video.mp4> <cartella di uscita>'); process.exit(1); }
const log = (...a) => console.log('[social]', ...a);
const doc = JSON.parse(fs.readFileSync(fileBeats, 'utf8'));
const LAV = path.dirname(fileBeats);
const parole = (() => { try { return JSON.parse(fs.readFileSync(path.join(LAV, 'parole.json'), 'utf8')); } catch { return []; } })();
const testo = parole.map((w) => w.w.trim()).join(' ').replace(/\s+([.,!?])/g, '$1');
fs.mkdirSync(uscita, { recursive: true });

const riassunto = doc.beats.map((b, i) => `${i}. ${b.t.toFixed(1)}s: ${b.elementi.map((e) => `${e.tipo}${e.testo ? ` "${e.testo}"` : ''}${e.nome ? ` "${e.nome}"` : ''}${e.file ? ` [${e.file}]` : ''}`).join(', ') || '(Denis in camera)'}`).join('\n');
const PROMPT = `Scrivi i testi per pubblicare questo video verticale di Denis, creator italiano: un documentario/esplicativo narrato da lui, con motion graphics.
Rispondi SOLO con JSON: {"copertina": {"testo": "...", "evidenzia": ["..."]}, "beat": <numero>, "descrizione": "...", "hashtag": ["#...", "#...", "#...", "#...", "#..."], "youtube_titolo": "..."}

Regole:
- Italiano, in prima persona come se scrivesse Denis; mai "Denis" in terza persona.
- Solo cose dette nel video: niente dati, prezzi o giudizi inventati.
- copertina.testo: 2–5 parole d'impatto che fanno venire voglia di guardare (una domanda, una promessa o il fatto più forte), non il titolo piatto. evidenzia: 1–2 di quelle parole da colorare.
- beat: il numero del beat (elenco sotto) con l'immagine più forte e riconoscibile per lo sfondo della copertina; preferisci beat con una foto o un numero grande, non quelli "(Denis in camera)" se ce ne sono altri.
- descrizione (per Instagram e TikTok): prima riga = gancio breve (massimo 70 caratteri) che fa fermare chi scorre; poi 1–3 righe brevi sul racconto. Senza hashtag. Al massimo 3 emoji. Niente link, niente "link in bio".
- hashtag: ESATTAMENTE 5, pertinenti (argomento, aziende, prodotti, categoria), soprattutto italiani, con # e senza spazi; niente #fyp o #viral.
- youtube_titolo: massimo 70 caratteri, chiaro e cercabile, senza hashtag.

TITOLO: ${doc.titolo || ''}
PARLATO:
${testo.slice(0, 12000)}

BEAT:
${riassunto}`;

function conClaude(prompt) {
  return new Promise((ok) => {
    const c = spawnSync('claude', ['--version'], { encoding: 'utf8', shell: process.platform === 'win32' });
    if (c.error || c.status !== 0) return ok(null);
    const p = spawn('claude', ['-p', 'Rispondi solo con il JSON richiesto nel testo ricevuto.', '--model', process.env.ROTOLO_MODELLO_SOCIAL || 'sonnet', '--output-format', 'json'],
      { stdio: ['pipe', 'pipe', 'pipe'], shell: process.platform === 'win32' });
    let out = '';
    const timer = setTimeout(() => p.kill('SIGKILL'), 4 * 60 * 1000);
    p.on('error', () => { clearTimeout(timer); ok(null); });
    p.stdout.on('data', (x) => { out += x; });
    p.on('close', () => { clearTimeout(timer); try { ok(JSON.parse(out).result || null); } catch { ok(null); } });
    p.stdin.end(prompt);
  });
}
const json = (s) => { try { const m = /\{[\s\S]*\}/.exec(String(s || '')); return m ? JSON.parse(m[0]) : null; } catch { return null; } };

let ai = json(await conClaude(PROMPT));
if (!ai?.descrizione) { try { ai = json(await chiediAI(PROMPT, { json: true })); } catch { ai = null; } }
if (!ai?.descrizione) {
  log('AI senza risposta: testi semplici');
  const frase = (testo.match(/^.{20,180}?[.!?](\s|$)/) || [testo.slice(0, 160)])[0].trim();
  ai = { copertina: { testo: doc.titolo || '' }, descrizione: [doc.titolo, frase].filter(Boolean).join('\n'), hashtag: [] };
}
// 5 hashtag puliti: # davanti, niente spazi né doppioni
const hashtag = [...new Map((Array.isArray(ai.hashtag) ? ai.hashtag : String(ai.hashtag || '').split(/[\s,]+/))
  .map((h) => `#${String(h).replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, '')}`).filter((h) => h.length > 2)
  .map((h) => [h.toLowerCase(), h])).values()].slice(0, 5);
const cop = ai.copertina && typeof ai.copertina === 'object' ? ai.copertina : { testo: String(ai.copertina || '') };
const testoCop = String(cop.testo || doc.titolo || '').trim().slice(0, 60);

// ---------- sfondo: il fotogramma più nitido del beat scelto (elementi già atterrati, camera ferma)
function nitidezza(file) {
  const r = spawnSync('ffmpeg', ['-v', 'info', '-i', file, '-vf', 'scale=540:-2,blurdetect', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /blur mean:\s*([\d.]+)/.exec(r.stderr || '');
  return m ? Number(m[1]) : 99;
}
const ib = Number.isInteger(ai.beat) && doc.beats[ai.beat] ? ai.beat : Math.max(0, doc.beats.findIndex((b) => b.elementi.some((e) => e.tipo === 'foto')));
const da = doc.beats[ib]?.t ?? 1;
const a = Math.min(doc.durata - 0.2, doc.beats[ib + 1]?.t ?? da + 4);
const dir = path.join(LAV, 'copertina');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
let migliore = null;
for (const q of [0.45, 0.6, 0.75, 0.9]) {
  const t = da + 0.6 + (a - da - 0.6) * q;
  const jpg = path.join(dir, `${q}.jpg`);
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-ss', Math.max(0, t).toFixed(2), '-i', video, '-frames:v', '1', '-vf', 'scale=1080:-2', '-q:v', '2', jpg]);
  if (r.status !== 0 || !fs.existsSync(jpg)) continue;
  const b = nitidezza(jpg);
  if (!migliore || b < migliore.b) migliore = { jpg, b, t };
}
const FINE = path.join(uscita, 'copertina.jpg');
if (migliore) {
  fs.copyFileSync(migliore.jpg, path.join(LAV, 'copertina-sfondo.jpg'));
  const accento = doc.mondo === 'tech' ? '#4fd1ff' : '#e0453a';
  const props = { sfondo: `${doc.cartella}/copertina-sfondo.jpg`, testo: testoCop, evidenzia: [].concat(cop.evidenzia || []).map(String).slice(0, 2),
    grafica: { fontApertura: { famiglia: 'Montserrat', peso: 900 }, coloreApertura: accento } };
  const PROPS = path.join(LAV, 'copertina.json');
  fs.writeFileSync(PROPS, JSON.stringify(props));
  const r = spawnSync('npx', ['remotion', 'still', 'src/index.ts', 'Copertina', FINE, `--props=${PROPS}`, '--image-format=jpeg', '--jpeg-quality=92'],
    { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status === 0) log(`copertina: "${testoCop}" sul beat ${ib} a ${migliore.t.toFixed(1)} s -> ${FINE}`);
  else log('copertina non fatta (render still fallito)');
}
fs.writeFileSync(path.join(uscita, 'social.json'), JSON.stringify({
  descrizione: String(ai.descrizione || '').trim().slice(0, 2000), hashtag, youtube_titolo: String(ai.youtube_titolo || '').trim().slice(0, 100),
  copertina: testoCop, beat: ib,
}, null, 2));
log(`descrizione: ${String(ai.descrizione).split('\n')[0]} · ${hashtag.join(' ')}`);
