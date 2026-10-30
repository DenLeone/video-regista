// Il piano di montaggio scritto da Gemini (senza Claude): legge il riassunto di pc/analizza.mjs e
// scrive pc/progetti/<nome>.json nel formato di pc/monta.mjs. Serve GEMINI_API_KEY nelle variabili di
// Windows (chiave gratuita da aistudio.google.com/apikey).
//   node pc\piano.mjs <nome> [minuti] ["brief: cosa vuoi nel video"]
//   es. node pc\piano.mjs Austria 15 "vlog di viaggio, gancio sulla SD persa"
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const [nome, minuti = '15', brief = ''] = process.argv.slice(2);
if (!nome) { console.error('uso: node pc/piano.mjs <nome cartella> [minuti] ["brief"]'); process.exit(1); }
const chiave = process.env.GEMINI_API_KEY;
// AI locale (Ollama sulla 5070 Ti): gratis e privata, prima di Gemini se è accesa e ha il modello
const OLLAMA = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const MODELLO_LOCALE = process.env.REGISTA_MODELLO || 'qwen2.5:14b';
async function localeDisponibile() {
  try {
    const r = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(3000) });
    return ((await r.json()).models || []).some((m) => m.name === MODELLO_LOCALE || m.name.startsWith(`${MODELLO_LOCALE}`));
  } catch { return false; }
}
const conLocale = await localeDisponibile();
if (!chiave && !conLocale) { console.error('manca GEMINI_API_KEY (o Ollama con qwen2.5:14b): vedi pc\\LEGGIMI.md'); process.exit(1); }
const LAVORO = path.join(ROOT, 'work', 'pc', nome);
const materiale = JSON.parse(fs.readFileSync(path.join(LAVORO, 'materiale.json'), 'utf8'));
const riassunto = fs.readFileSync(path.join(LAVORO, 'materiale.md'), 'utf8');
const DIR_MUSICA = 'G:/Il mio Drive/12 · Risorse/Assets/Suoni/Musica';
const brani = fs.existsSync(DIR_MUSICA) ? fs.readdirSync(DIR_MUSICA).filter((f) => /\.(mp3|wav|m4a)$/i.test(f)) : [];
const esempio = fs.existsSync(path.join(ROOT, 'pc', 'progetti', 'austria.json')) ? fs.readFileSync(path.join(ROOT, 'pc', 'progetti', 'austria.json'), 'utf8') : '';

const prompt = `Sei il montatore dei video YouTube di Denis (creator tech italiano: recensioni, vlog di viaggio, politica).
Scrivi il PIANO DI MONTAGGIO di un video di circa ${minuti} minuti dal materiale qui sotto.${brief ? `\nRichiesta di Denis: ${brief}` : ''}

REGOLE DI REGIA (dai video di riferimento):
- Gancio nei primi 30–40 s: il momento più forte o la tesi, poi 6–8 B-roll velocissimi (1,4 s) dei momenti migliori, poi un "titolo" (sigla) di 3,5 s su un B-roll bello.
- Capitoli per luogo o argomento, in ordine cronologico, ognuno con "capitolo", "sotto" (luogo · data) e "musica" (cambia a ogni capitolo; "" = silenzio per i momenti seri).
- Tieni solo i pezzi parlati migliori: niente doppioni (molti video sono copie dello stesso discorso: scegli UNA versione), niente frasi a metà, niente parolacce gratuite, niente canzoni o audio d'altri.
- Ogni 20–40 s di parlato metti un B-roll da solo (2–4 s) o un "sopra" sul parlato: qualcosa cambia sempre.
- Le parole in "da" e "a" vanno copiate ESATTE dal testo del video (prime 4–6 parole e ultime 3–5 parole del pezzo), altrimenti il montaggio non le trova.
- B-roll: solo video "senza parlato" o d'ambiente; "dal" + "per" devono stare dentro la durata del video.
- Chiusura breve (meno di 1 minuto) su un'immagine bella.

FORMATO: JSON { "nome": "${nome}", "cartella": ${JSON.stringify(materiale.cartella)}, "volumeMusica": 0.22, "sequenza": [ ... ] } con elementi:
{ "musica": "file" } | { "capitolo": "...", "sotto": "...", "musica": "file" } | { "v": "UMXH7108.MP4", "da": "prime parole", "a": "ultime parole", "sopra": [{ "v": "NBVE8895.MP4", "dal": 1, "al": 14, "per": 3 }] } | { "broll": "JGPJ4543.MP4", "dal": 5, "per": 3, "audio": "muto" } | { "titolo": "...", "sotto": "...", "su": "IMG_8917.MOV", "dal": 10, "per": 3.5 }
In "v", "broll", "su" e "sopra" metti il NOME DEL FILE della clip (quello dopo "## " nel materiale), mai i numeri V001.
Per i capitoli di un viaggio aggiungi "luogo" (posto preciso cercabile su una mappa, es. "Schloss Schönbrunn, Wien") e nel piano "paese" (codice a due lettere, es. "at"). Le clip segnate EXPORT hanno la data sbagliata: non usarle per capire quando e dove sei.
Brani disponibili per "musica": ${brani.length ? brani.map((b) => JSON.stringify(b)).join(', ') : '(nessuno: ometti musica)'}
${esempio ? `\nESEMPIO di piano fatto bene (un altro video):\n${esempio}\n` : ''}
MATERIALE:
${riassunto}`;

async function chiedi(modello) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modello}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': chiave },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4, responseMimeType: 'application/json' } }),
    signal: AbortSignal.timeout(10 * 60 * 1000),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`${modello}: ${r.status} ${j.error?.message || ''}`);
  return (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
}
async function chiediLocale() {
  const r = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODELLO_LOCALE, stream: false, format: 'json', messages: [{ role: 'user', content: prompt }],
      options: { temperature: 0.4, num_ctx: 32768 } }),
    signal: AbortSignal.timeout(30 * 60 * 1000),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`locale: ${r.status} ${j.error || ''}`);
  return j.message?.content || '';
}
let testo = null;
if (conLocale && process.env.REGISTA_AI !== 'gemini') {
  try { console.log(`[piano] chiedo all'AI locale (${MODELLO_LOCALE} sulla scheda video, qualche minuto)…`); testo = await chiediLocale(); JSON.parse(testo); } catch (e) { console.log(`[piano] AI locale: ${e.message.slice(0, 200)}`); testo = null; }
}
for (const m of testo || !chiave ? [] : ['gemini-pro-latest', 'gemini-flash-latest', 'gemini-flash-lite-latest']) {
  try { console.log(`[piano] chiedo a ${m}…`); testo = await chiedi(m); JSON.parse(testo); break; } catch (e) { console.log(`[piano] ${e.message.slice(0, 200)}`); testo = null; }
}
if (!testo) { console.error('[piano] nessun modello ha risposto: riprova tra poco'); process.exit(1); }
const piano = JSON.parse(testo);
piano.nome = nome;
piano.cartella = materiale.cartella;
const uscita = path.join(ROOT, 'pc', 'progetti', `${nome.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`);
fs.mkdirSync(path.dirname(uscita), { recursive: true });
if (fs.existsSync(uscita)) fs.copyFileSync(uscita, uscita.replace(/\.json$/, '.prima.json'));
fs.writeFileSync(uscita, JSON.stringify(piano, null, 2));
console.log(`[piano] scritto ${uscita} (${piano.sequenza?.length || 0} elementi). Ora: node pc\\monta.mjs ${path.relative(ROOT, uscita)} --fino 120`);
