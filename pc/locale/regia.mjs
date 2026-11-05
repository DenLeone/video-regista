// Passo 5 del flusso locale: la regia del documentario (beats.json per src/Rotolo.tsx) senza Claude, a pezzi:
//   node pc/locale/regia.mjs <cartella -pulizia> [--mondo tech|rotolo] [--titolo "…"] [--modello qwen3.8:27b] [--rifai-ai]
// - beat con le immagini: da immagini.json (passo 3), uno per immagine, sulla sua parola
// - presentatore (intero / metà): regole nel codice: metà sui beat con grafica, intero nelle pause lunghe senza
// - testi (etichette delle card, scritte a macchina, badge, numeri): AI locale su un elenco breve di frasi,
//   controllata dal codice (lunghezze, parole che esistono, distanze)
// Tutti i tempi sono sul video tagliato (parole-pulite.json). Il viso del presentatore (pc/rotolo/viso.py sul video
// originale) si riporta sui tempi tagliati con tagli.json.
// Scrive public/collage/locale-<nome>/ (immagini + beats.json, poi pc/rotolo/prepara.mjs) e una copia di beats.json
// nella cartella -pulizia.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opz = (k, d = '') => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const ha = (k) => args.includes(k);
const DIR = path.resolve(args[0] || '');
if (!args[0] || !fs.existsSync(path.join(DIR, 'tagli.json'))) { console.error('uso: node pc/locale/regia.mjs <cartella -pulizia> [--mondo tech|rotolo]'); process.exit(1); }
const OLLAMA = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const MODELLO = opz('--modello', process.env.MODELLO_REGIA || 'qwen3.8:27b');
const MONDO = opz('--mondo', 'tech') === 'rotolo' ? 'rotolo' : 'tech';
const PYTHON = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const log = (...a) => console.log('[regia]', ...a);

const tagli = JSON.parse(fs.readFileSync(path.join(DIR, 'tagli.json'), 'utf8'));
const parole = JSON.parse(fs.readFileSync(path.join(DIR, 'parole-pulite.json'), 'utf8'));
const imm = fs.existsSync(path.join(DIR, 'immagini.json')) ? JSON.parse(fs.readFileSync(path.join(DIR, 'immagini.json'), 'utf8')) : { elementi: [] };
const DURATA = tagli.durataPulita;
const nome = opz('--titolo', path.basename(tagli.sorgente).replace(/\.[^.]+$/, ''));
const slug = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
const CART = `collage/locale-${slug}`;
const PUB = path.join(ROOT, 'public', CART);
fs.mkdirSync(PUB, { recursive: true });
const inizioParola = (t) => parole.find((w) => w.s >= t - 0.01)?.s ?? t; // primo inizio di parola dal secondo t

// ---------- 1. beat con le immagini (file copiati in public; webp → png come in pc/rotolo/rotolo.mjs)
const beats = [];
for (const e of imm.elementi) {
  let file = e.file;
  const da = path.join(imm.cartella, e.file);
  if (/\.webp$/i.test(file)) {
    file = file.replace(/\.webp$/i, '.png');
    if (!fs.existsSync(path.join(PUB, file))) spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', da, path.join(PUB, file)]);
  } else fs.copyFileSync(da, path.join(PUB, file));
  beats.push({ t: e.inizio, i: e.i, elementi: [{ tipo: 'foto', file, misura: 'grande', t: e.inizio }] });
}

// ---------- 2. testi dall'AI: etichetta per ogni card, al massimo una scritta per beat, pochi beat solo testo
const frase = (da, a) => parole.map((w, i) => ({ ...w, i })).filter((w) => w.s >= da - 0.01 && w.s < a);
// ogni momento finisce dove il presentatore torna intero (pausa lunga: dopo 3,5 s) o al beat dopo:
// le scritte devono cadere mentre la grafica è in scena
const PAUSA = 5, IN_SCENA = 3.5;
const confini = beats.map((b, n) => { const dopo = n < beats.length - 1 ? beats[n + 1].t : DURATA; return dopo - b.t > PAUSA ? b.t + IN_SCENA : dopo; });
const PROMPT = `Sei il grafico di un video tech verticale di Denis (stile "Tech": card di vetro con un'etichetta monospace, scritte a macchina, badge rossi, numeri grandi).
Ti do i momenti con un'immagine (con le parole dette mentre è in scena) e tutto il parlato numerato.
Per ogni momento scrivi:
- "etichetta": 1–4 parole IN MAIUSCOLO per la barra della card (cosa mostra o il punto chiave, es. "CLAUDE · ANTHROPIC")
- facoltativo "scritta": una parola chiave detta in quel momento, da far comparire sotto la card: {"tipo": "macchina" (2–4 parole, monospace) o "timbro" (badge rosso, 1–2 parole forti o un giudizio, max 16 caratteri), "testo": "…", "parola": <numero della parola su cui compare, tra quelle del momento>}
Poi, facoltativi, al massimo 2 "extra": momenti SENZA immagine dove una scritta da sola rende il punto (un numero, un nome, una frase forte): {"parola": <numero>, "tipo": "titolo" (2–4 parole) | "macchina" | "contatore" (solo se il parlato dice un numero: "valore": <numero>, "suffisso": "…"), "testo": "…"}
Usa SOLO cose dette nel parlato. La trascrizione può scrivere male i nomi: "Cloud" detto da Denis è "Claude" (di Anthropic).

Rispondi SOLO con JSON: {"momenti": [{"n": <numero momento>, "etichetta": "…", "scritta": {…} | null}], "extra": [ … ]}

MOMENTI:
${beats.map((b, n) => `${n}. immagine ${b.elementi[0].file} — parole: ${frase(b.t, confini[n + 1]).map((w) => `${w.i}:${w.w}`).join(' ')}`).join('\n')}

PARLATO (numero:parola@secondo):
${parole.map((w, i) => `${i}:${w.w}@${w.s.toFixed(1)}`).join(' ')}`;

async function chiedi(prompt) {
  const r = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    // in streaming: senza, fetch di Node smette di aspettare dopo 300 s
    body: JSON.stringify({ model: MODELLO, stream: true, format: 'json', think: 'low', messages: [{ role: 'user', content: prompt }], options: { temperature: 0.2, num_ctx: 16384 } }),
    signal: AbortSignal.timeout(30 * 60 * 1000),
  });
  if (!r.ok) throw new Error(`Ollama ${r.status}: ${(await r.text()).slice(0, 200)}`);
  let testo = '', resto = '';
  const dec = new TextDecoder();
  for await (const pezzo of r.body) {
    resto += dec.decode(pezzo, { stream: true });
    const righe = resto.split('\n');
    resto = righe.pop();
    for (const riga of righe) if (riga.trim()) testo += JSON.parse(riga).message?.content || '';
  }
  if (resto.trim()) testo += JSON.parse(resto).message?.content || '';
  return testo;
}
const CACHE = path.join(DIR, 'regia-ai.json');
const chiave = `${MODELLO}\n${PROMPT}`;
const vecchia = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : null;
let t;
if (vecchia?.chiave === chiave && !ha('--rifai-ai')) { t = vecchia.risposta; log('AI: risposta già pronta'); }
else {
  const t0 = Date.now();
  t = await chiedi(PROMPT);
  log(`AI (${MODELLO}) in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  fs.writeFileSync(CACHE, JSON.stringify({ chiave, risposta: t }));
}
const d = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));

const MAIUSC = (s, n) => String(s || '').toUpperCase().trim().slice(0, n);
for (const m of [].concat(d.momenti || [])) {
  const b = beats[m.n];
  if (!b) continue;
  if (m.etichetta) b.elementi[0].etichetta = MAIUSC(m.etichetta, 28);
  const s = m.scritta;
  if (s && ['macchina', 'timbro'].includes(s.tipo) && s.testo) {
    const i = Math.round(s.parola);
    const nelMomento = frase(b.t, confini[m.n]).some((w) => w.i === i);
    if (!nelMomento) { log(`scritta scartata (parola ${s.parola} fuori dal momento ${m.n}): ${s.testo}`); continue; }
    const tt = Math.max(parole[i].s, b.t + 0.6); // dopo la card, non insieme
    b.elementi.push(s.tipo === 'timbro' ? { tipo: 'timbro', testo: String(s.testo).slice(0, 16), t: +tt.toFixed(2) } : { tipo: 'macchina', testo: MAIUSC(s.testo, 30), t: +tt.toFixed(2) });
  }
}
for (const x of [].concat(d.extra || []).slice(0, 2)) {
  const i = Math.round(x.parola);
  if (!(i >= 0 && i < parole.length)) continue;
  const tx = parole[i].s;
  if (beats.some((b) => Math.abs(b.t - tx) < 2.5)) { log(`extra scartato (troppo vicino a un'immagine): ${x.testo ?? x.valore}`); continue; }
  const el = x.tipo === 'contatore' && Number.isFinite(Number(x.valore)) ? { tipo: 'contatore', valore: Number(x.valore), suffisso: String(x.suffisso || '').slice(0, 6), t: tx }
    : x.tipo === 'titolo' ? { tipo: 'titolo', testo: String(x.testo || '').slice(0, 30), t: tx } : { tipo: 'macchina', testo: MAIUSC(x.testo, 30), t: tx };
  if (el.tipo !== 'contatore' && !el.testo) continue;
  beats.push({ t: tx, i, elementi: [el] });
}
beats.sort((a, b) => a.t - b.t);

// ---------- 3. presentatore: metà sui beat con grafica; intero nelle pause lunghe (dopo ~3,5 s di grafica)
const fine = (b, k) => (k < beats.length - 1 ? beats[k + 1].t : DURATA);
const tutti = [];
beats.forEach((b, k) => {
  b.presentatore = 'meta';
  tutti.push(b);
  const libero = fine(b, k) - b.t;
  if (libero > PAUSA) tutti.push({ t: +inizioParola(b.t + IN_SCENA).toFixed(2), presentatore: 'intero', elementi: [] });
});
const doc = {
  titolo: nome, mondo: MONDO === 'tech' ? 'tech' : undefined, durata: DURATA, cartella: CART, voce: 'voce.wav',
  beats: tutti.map(({ i, ...b }) => ({ ...b, t: +b.t.toFixed(2) })),
};

// ---------- 4. viso del presentatore sui tempi del video tagliato
const VISO = path.join(DIR, 'viso.json');
if (!fs.existsSync(VISO)) spawnSync(PYTHON, [path.join(ROOT, 'pc', 'rotolo', 'viso.py'), tagli.sorgente, VISO], { stdio: 'inherit', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
if (fs.existsSync(VISO)) {
  const v = JSON.parse(fs.readFileSync(VISO, 'utf8'));
  const punti = [];
  let cum = 0;
  for (const x of tagli.tieni) {
    for (const p of v.punti) if (p.t >= x.da && p.t < x.a) punti.push({ t: +(cum + p.t - x.da).toFixed(3), x: p.x, y: p.y });
    cum += x.a - x.da;
  }
  doc.presentatore = { file: 'presentatore.mp4', ar: +(v.w / v.h).toFixed(4), viso: punti.length ? punti : [{ t: 0, x: 0.5, y: 0.42 }] };
}

const BEATS = path.join(PUB, 'beats.json');
fs.writeFileSync(BEATS, JSON.stringify(doc, null, 2));
const r = spawnSync('node', [path.join(ROOT, 'pc', 'rotolo', 'prepara.mjs'), BEATS], { stdio: 'inherit' });
if (r.status !== 0) log('prepara non riuscito');
fs.copyFileSync(BEATS, path.join(DIR, 'beats.json'));
log(`${doc.beats.length} beat → ${BEATS}`);
for (const b of JSON.parse(fs.readFileSync(BEATS, 'utf8')).beats) {
  log(`  ${b.t.toFixed(2).padStart(6)} ${String(b.presentatore).padEnd(7)} ${b.elementi.map((e) => `${e.tipo}:${e.etichetta ?? e.testo ?? e.valore ?? ''}${e.file ? ` [${e.file}]` : ''}`).join(' | ')}`);
}
