// Rotolo, regia: dalle parole con i tempi e dall'elenco delle foto scrive beats.json.
//   node pc/rotolo/regia.mjs <parole.json> <cartella immagini> <beats.json> [--brief "…"] [--cartella collage/x]
// AI, in ordine: Claude Code (comando `claude`, abbonamento: CLAUDE_CODE_OAUTH_TOKEN sul runner), Gemini
// (GEMINI_API_KEY), AI locale (Ollama). ROTOLO_AI=claude|gemini|locale forza la prima scelta.
// Il risultato si controlla (tipi, file, tempi) e se ha errori si rimanda all'AI una volta con l'elenco.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { chiediAI } from '../ai.mjs';

const args = process.argv.slice(2);
const opz = (k, d = '') => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const [fileParole, dirImmagini, uscita] = args;
if (!uscita) { console.error('uso: node pc/rotolo/regia.mjs <parole.json> <cartella immagini> <beats.json> [--brief "…"]'); process.exit(1); }
const parole = JSON.parse(fs.readFileSync(fileParole, 'utf8'));
const durata = +(parole.at(-1).e + 0.6).toFixed(2);
const immagini = fs.readdirSync(dirImmagini).filter((f) => /\.(jpe?g|png|webp)$/i.test(f) && !/^(washi|tavolo|grana\d)\./i.test(f)).sort();
const brief = opz('--brief');

// testo con i tempi: una riga per frase, ogni parola con il suo secondo d'inizio
function righe() {
  const out = []; let riga = [];
  for (const w of parole) {
    riga.push(`${w.s.toFixed(2)} ${w.w.trim()}`);
    if (/[.!?]$/.test(w.w.trim()) || riga.length >= 18) { out.push(riga.join(' | ')); riga = []; }
  }
  if (riga.length) out.push(riga.join(' | '));
  return out.join('\n');
}

const PROMPT = `Sei il regista di un documentario verticale (9:16, 4K) in stile "Rotolo": un unico piano sequenza su un lungo rotolo di carta di riso (kakemono) srotolato su un tavolo scuro. La camera scorre dall'alto (passato) al basso (oggi) senza tagli; sulla carta cadono foto d'epoca, carte, timbri rossi hanko, scritte a pennello e a macchina, ognuno ESATTAMENTE sulla parola che lo nomina. Il riferimento di qualità è un documentario "da Netflix": pochi elementi, grandi, leggibili, ognuno al momento giusto.

Devi scrivere il file beats.json. Rispondi SOLO con il JSON.

FORMATO
{
  "titolo": "…",
  "durata": ${durata},
  "apertura": { "t": 0, "fino": <secondo in cui finisce il gancio iniziale>, "elementi": [ … ] },   // FACOLTATIVA
  "beats": [ { "t": <secondo>, "elementi": [ … ] }, … ],
  "finale": { "t": <secondo>, "righe": [ { "testo": "…", "t": <secondo>, "rosso": "<parola da colorare, facoltativa>" } ], "timbro": { "testo": "…", "t": <secondo> } }   // FACOLTATIVO
}
Elementi (campo "tipo"; "t" = secondo d'inizio della parola che lo fa comparire, preso dal testo qui sotto):
- {"tipo":"anno","testo":"1889"}  data grande a pennello. Le date dell'epoca, in ordine.
- {"tipo":"titolo","testo":"Ultra Hand"}  nome di un oggetto/evento chiave, grande a pennello (max 14 lettere).
- {"tipo":"kanji","testo":"京都","sotto":"KYOTO"}  SOLO se la storia è giapponese: 1–3 kanji corretti + traduzione a macchina.
- {"tipo":"macchina","testo":"TECNICO DI LABORATORIO","colore":"rosso"?}  etichetta a macchina da scrivere, max 26 caratteri.
- {"tipo":"nome","nome":"Gunpei Yokoi","kanjiNome":"横井軍平"?,"ruolo":"FONDATORE · 1889"?}  didascalia di una persona: subito DOPO la sua foto.
- {"tipo":"foto","file":"<nome esatto dall'elenco>","bn":true|false,"misura":"piccola|media|grande"?}  foto d'epoca con nastro. bn=true per foto storiche di persone e luoghi; false per prodotti a colori.
- {"tipo":"ritaglio","file":"<png trasparente>","grande":true?,"sopra":true?}  oggetto scontornato senza cornice; "sopra" = appoggiato sull'angolo dell'elemento prima.
- {"tipo":"carte","files":["a.jpg","b.jpg","c.jpg"]}  1–3 carte da gioco a ventaglio.
- {"tipo":"timbro","testo":"失敗","sotto":"FLOP","grande":true?,"solo":true?}  timbro rosso che SBATTE su una parola forte (fallimento, segreto, record, svolta…). Si appoggia sull'elemento prima (foto, numero). Max 1 ogni ~8 secondi. Per storie non giapponesi: testo corto in maiuscolo (es. "FALLITO").
- {"tipo":"schede","voci":[{"kanji"?:"…","titolo":"Riso istantaneo","icona":"ciotola|taxi|insegna|casa|telefono|libro|soldi|fabbrica|gioco"?,"t":…}],"croci":[t1,t2,…]?,"timbroFinale":{"testo":"…","sotto":"…","t":…}?}  elenco di tentativi/opzioni (2–4), una scheda per voce sulla sua parola; croci rosse se poi falliscono (sulle parole "flop", "tutti falliti"…).
- {"tipo":"grafico","etichette":["1889","1950","1960","1965"],"forma":"crollo|crescita|picco","tCambio":<secondo della svolta>,"titoloGrafico":"carte vendute"}  andamento nel tempo, solo se il parlato dice che qualcosa cresce/crolla.
- {"tipo":"contatore","valore":1000000,"prefisso":"+","etichetta":"pezzi venduti"}  numero detto nel parlato (usa il valore detto, non inventare cifre precise).
- {"tipo":"schema","disegno":"pantografo"}  disegno tecnico di un braccio estensibile (solo se pertinente).
- {"tipo":"cerchio","su":<indice della foto nello stesso beat, da 0>,"cx":0.5,"cy":0.5,"zoom":true?}  cerchio rosso su un dettaglio della foto; zoom = la camera ci entra.
Campo facoltativo "lato":"sx"|"dx" su DUE elementi consecutivi = affiancati (es. carta + kanji). Di solito non serve.

REGOLE
1. Un beat = un'idea / una frase. Un beat ha 1–3 elementi, mai più di 4. L'elemento principale per primo.
2. Ogni "t" è il secondo di una parola del testo (copialo esatto). Un elemento compare SULLA parola che lo nomina, mai prima.
3. Il "t" del beat = il t del suo primo elemento. Beats in ordine di tempo, almeno 1,3 s l'uno dall'altro.
4. Usa SOLO i file dell'elenco, con il nome esatto. Ogni foto al massimo una volta. Se per una frase non c'è una foto adatta, usa scritte (anno, titolo, macchina, timbro). Il nome del file dice cosa c'è (tipo-nome-anno).
5. Non aggiungere fatti che il parlato non dice. Puoi tradurre in kanji/katakana e mettere ruoli o anni solo se li dice il parlato o se sono certi; se hai un dubbio non metterli e scrivilo in "note".
6. Gancio: se il video inizia parlando di oggi ("se ti dicessi Nintendo penseresti a Mario…") metti "apertura" con quegli elementi e "fino" = secondo in cui inizia la storia vera; la camera poi corre indietro nel tempo al primo beat.
7. Frase finale da ricordare (righe di max 16 caratteri, 2–3 righe) ("una regola: reinventarsi o morire") → "finale": "t" = inizio di quella frase (o 2,5 s prima delle righe), righe brevi agganciate alle parole, eventuale timbro conclusivo.
8. Scritte corte: anno 4 cifre, titolo ≤ 14 lettere, macchina ≤ 26 caratteri. In italiano, giuste.
9. Aggiungi "note": un elenco di dubbi per Denis (fatti incerti, foto mancanti utili). Può essere vuoto.

${brief ? `BRIEF DI DENIS: ${brief}\n` : ''}FOTO DISPONIBILI (${immagini.length}):
${immagini.map((f) => `- ${f}`).join('\n') || '- (nessuna)'}

TESTO CON I TEMPI (secondo d'inizio di ogni parola):
${righe()}
`;

// ---------------------------------------------------------------- controllo
const TIPI = new Set(['anno', 'titolo', 'kanji', 'macchina', 'nome', 'foto', 'ritaglio', 'carte', 'timbro', 'schede', 'grafico', 'contatore', 'schema', 'cerchio']);
const inizi = parole.map((w) => w.s);
const vicino = (t) => inizi.reduce((a, b) => (Math.abs(b - t) < Math.abs(a - t) ? b : a), inizi[0]);
function controlla(d) {
  const errori = [];
  if (!Array.isArray(d.beats) || !d.beats.length) return ['manca "beats"'];
  const usate = new Set();
  const blocchi = [...(d.apertura ? [['apertura', d.apertura]] : []), ...d.beats.map((b, i) => [`beat ${i + 1}`, b])];
  for (const [nome, b] of blocchi) {
    if (!Array.isArray(b.elementi) || !b.elementi.length) { errori.push(`${nome}: nessun elemento`); continue; }
    for (const el of b.elementi) {
      if (!TIPI.has(el.tipo)) errori.push(`${nome}: tipo sconosciuto "${el.tipo}"`);
      for (const f of [el.file, ...(el.files || [])].filter(Boolean)) {
        if (!immagini.includes(f)) errori.push(`${nome}: il file "${f}" non esiste`);
        else if (usate.has(f) && el.tipo !== 'carte') errori.push(`${nome}: "${f}" usato due volte`);
        usate.add(f);
      }
      // i tempi si agganciano all'inizio di parola più vicino (l'AI sbaglia di qualche centesimo)
      if (typeof el.t === 'number' && el.t >= 0) el.t = vicino(el.t);
      if (el.voci) el.voci.forEach((v) => { if (typeof v.t === 'number') v.t = vicino(v.t); });
      if (el.croci) el.croci = el.croci.map(vicino);
      if (el.timbroFinale) el.timbroFinale.t = vicino(el.timbroFinale.t);
      if (typeof el.tCambio === 'number') el.tCambio = vicino(el.tCambio);
    }
    if (nome !== 'apertura') b.t = Math.min(...b.elementi.map((e) => e.t ?? b.t).filter((x) => typeof x === 'number'));
  }
  d.beats.sort((a, b) => a.t - b.t);
  for (let i = 1; i < d.beats.length; i++) if (d.beats[i].t - d.beats[i - 1].t < 0.8) errori.push(`beat ${i} e ${i + 1} troppo vicini (${d.beats[i - 1].t} e ${d.beats[i].t})`);
  if (d.finale && !(d.finale.righe || []).length) errori.push('finale senza righe');
  return errori;
}

// ---------------------------------------------------------------- AI
function conClaude(prompt) {
  return new Promise((ok) => {
    const c = spawnSync('claude', ['--version'], { encoding: 'utf8', shell: process.platform === 'win32' });
    if (c.error || c.status !== 0) return ok(null);
    const p = spawn('claude', ['-p', 'Rispondi solo con il JSON richiesto nel testo ricevuto.', '--model', process.env.ROTOLO_MODELLO || 'opus', '--output-format', 'json'],
      { stdio: ['pipe', 'pipe', 'pipe'], shell: process.platform === 'win32' });
    let out = '';
    const timer = setTimeout(() => p.kill('SIGKILL'), 8 * 60 * 1000);
    p.on('error', () => { clearTimeout(timer); ok(null); });
    p.stdout.on('data', (x) => { out += x; });
    p.on('close', () => { clearTimeout(timer); try { ok(String(JSON.parse(out).result || '') || null); } catch { ok(null); } });
    p.stdin.end(prompt);
  });
}
async function chiedi(prompt) {
  const ordine = { claude: ['claude', 'altro'], gemini: ['altro', 'claude'], locale: ['altro', 'claude'] }[process.env.ROTOLO_AI || 'claude'];
  for (const chi of ordine) {
    const t = chi === 'claude' ? await conClaude(prompt) : await (async () => {
      if (process.env.ROTOLO_AI !== 'locale') process.env.REGISTA_AI = 'gemini';
      return chiediAI(prompt, { json: true });
    })();
    if (t) { console.log(`regia scritta da ${chi === 'claude' ? 'Claude' : process.env.REGISTA_AI === 'gemini' ? 'Gemini' : 'AI locale'}`); return t; }
  }
  throw new Error('nessuna AI ha risposto');
}
const leggiJSON = (t) => JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));

let doc = leggiJSON(await chiedi(PROMPT));
let errori = controlla(doc);
if (errori.length) {
  console.log(`regia con ${errori.length} errori, la rimando all'AI:\n- ${errori.join('\n- ')}`);
  doc = leggiJSON(await chiedi(`${PROMPT}\n\nLA TUA RISPOSTA PRECEDENTE:\n${JSON.stringify(doc)}\n\nHA QUESTI ERRORI, correggili e rimanda tutto il JSON:\n- ${errori.join('\n- ')}`));
  errori = controlla(doc);
}
doc.durata = durata;
doc.cartella = opz('--cartella', doc.cartella || '');
doc.voce = doc.voce || 'voce.wav';
fs.writeFileSync(uscita, JSON.stringify(doc, null, 2));
console.log(`${doc.beats.length} beat → ${uscita}${errori.length ? `\n⚠ restano errori:\n- ${errori.join('\n- ')}` : ''}`);
if (doc.note?.length) console.log(`note:\n- ${[].concat(doc.note).join('\n- ')}`);
if (errori.length) process.exit(2);
