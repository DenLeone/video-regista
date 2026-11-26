// 🔎 Ispettore · riordino per prodotto (26/11, Denis: «deve cercare tra TUTTE le cartelle i prodotti e dividerli in B-roll e
// parlato… riunire lo stesso prodotto in una sola cartella, eliminare quella vecchia… in background, con calma»).
//
// Cosa fa, a fasi, anche in più giri (lo stato sta su Drive, 00 · Preparazione/_riordino/):
//   1. inventario   tutti i file di 05 · Archivio, a ogni profondità (le cartelle «_…» sono di servizio, B-roll/ e Parlato/ già
//                   a posto si lasciano dove sono)
//   2. riconoscimento  per ogni clip: che prodotto è e se è PARLATO (si sente Denis) o B-roll. Un fotogramma + 6 s di audio,
//                   senza scaricare i video interi. Il risultato di ogni clip si ricorda (cache): i giri dopo rifanno solo il nuovo.
//   3. raggruppamento  nomi diversi dello stesso prodotto → un solo prodotto
//   4. piano        <Prodotto>/ = parlato e audio (il girato da montare, dove lo cercano Archivista e Fabbrica);
//                   <Prodotto>/B-roll/ = tutto il resto (entra da solo in ogni video del prodotto)
//   5. esecuzione   sposta i file (stesso Drive: lo spostamento tiene lo stesso file, quindi i collegamenti in 01 e 02 restano
//                   validi), mai sovrascrive (nome uguale → «(2)»), scrive ogni spostamento nel GIORNALE, poi toglie le cartelle
//                   vecchie rimaste VUOTE (cestino di Drive: mai un file cancellato, mai una cartella con dentro qualcosa)
//   «annulla» rimette tutto com'era dal giornale. Non tocca: file di cartelle modificate da meno di 3 ore (forse in caricamento),
//   file usati da un montaggio in corso (01 · Da editare), clip di cui il prodotto non è chiaro (restano dove sono, in lista).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { DIR_EDITARE } from './cartelle.mjs';

const REMOTE = process.env.RCLONE_REMOTE || 'gdrive';
export const ARCHIVIO = process.env.DIR_ARCHIVIO || '05 · Archivio';
const PREP = process.env.DIR_PREPARAZIONE || '00 · Preparazione';
export const STATO_DIR = `${PREP}/_riordino`;
const ESITO_ISPETTORE = `${PREP}/_ispettore.json`;

export const VIDEO = /\.(mp4|mov|m4v|mkv|avi|mts)$/i;
export const FOTO = /\.(jpe?g|png|webp|heic)$/i;
export const AUDIO = /\.(wav|mp3|m4a|aac|flac)$/i;
export const tipoDi = (nome) => (VIDEO.test(nome) ? 'video' : FOTO.test(nome) ? 'foto' : AUDIO.test(nome) ? 'audio' : null);

export const SOGLIA_CONFIDENZA = 0.6;
export const ATTESA_CARICAMENTO_MS = 3 * 3600_000; // cartelle modificate da meno: forse stanno ancora arrivando
const diServizio = (nome) => String(nome).startsWith('_') || String(nome).startsWith('.');

const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
const pulisciNome = (t) => String(t || '').replace(/[\\/:*?"<>|#]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 50).trim();

// ───────────── 1. inventario ─────────────
/** righe di `rclone lsjson -R --files-only` su 05 → clip e file di servizio */
export function inventario(righe) {
  const clip = [];
  for (const f of righe || []) {
    const pezzi = String(f.Path || '').split('/');
    if (pezzi.length < 2 || pezzi.slice(0, -1).some(diServizio)) continue; // file sciolti in 05 o dentro «_…»
    const tipo = tipoDi(f.Name);
    if (!tipo) continue;
    const dir = pezzi.slice(0, -1).join('/');
    const sotto = pezzi.slice(1, -1);
    // già a posto: <Prodotto>/B-roll/… e <Prodotto>/Parlato/… (il Regista li ha ordinati a fine montaggio)
    const giaPosto = sotto.includes('B-roll') || sotto.includes('Parlato');
    clip.push({ path: f.Path, dir, nome: f.Name, size: Number(f.Size) || 0, mod: String(f.ModTime || ''), tipo, giaPosto, radice: pezzi[0] });
  }
  return clip;
}
export const chiaveClip = (c) => `${c.path}|${c.size}|${c.mod}`;

// ───────────── 2. riconoscimento (Gemini, a lotti, con cache) ─────────────
const PROMPT_LOTTO = (n) => `Sei l'Ispettore di Denis, creator tech italiano che recensisce gadget. Ti do ${n} clip del suo girato, ognuna con un fotogramma e, per i video, 6 secondi di audio.
Per OGNI clip dimmi:
- "prodotto": marca e modello del prodotto principale che vedi o che Denis nomina (es. «Anker Prime 27650», «Ajazz AK820»), il più breve possibile; "" se non si capisce (solo mani, ambiente, persone, viaggio senza prodotto);
- "parlato": true se nell'audio si sente una persona che parla (recensione, spiegazione, voce di Denis), false se solo musica, rumore, ambiente o silenzio, null se non c'è audio;
- "conf": da 0 a 1, quanto sei sicuro del prodotto.
Rispondi SOLO con JSON: {"clip":[{"k":1,"prodotto":"…","parlato":true,"conf":0.9}]}`;

/** deps.estrai(clip) → { jpg: base64, wav: base64|null }, deps.chiedi(parts) → oggetto JSON, deps.pausa(ms) */
export async function riconosci(clips, cache, deps, { lotto = 6, scadenza = Infinity, pausaMs = 4000, stop = () => false, checkpoint = null, ogni = 5 } = {}) {
  const nuovi = clips.filter((c) => c.tipo !== 'audio' && !cache[chiaveClip(c)]);
  let fatti = 0, lotti = 0;
  for (let i = 0; i < nuovi.length; i += lotto) {
    if (deps.adesso() > scadenza || (await stop())) return { fatti, finito: false };
    const gruppo = nuovi.slice(i, i + lotto);
    const ok = [], corpo = [];
    for (const c of gruppo) {
      let e = null;
      try { e = await deps.estrai(c); } catch (err) { deps.log(`clip non letta (${c.path}): ${String(err.message).split('\n')[0]}`); }
      if (!e?.jpg) continue;
      ok.push(c);
      // numeri continui tra le clip davvero mandate: la risposta di Gemini si aggancia per numero
      corpo.push({ text: `Clip ${ok.length} (${c.tipo === 'foto' ? 'foto' : 'video'}, cartella «${c.dir}», file «${c.nome}»):` }, { inline_data: { mime_type: 'image/jpeg', data: e.jpg } });
      if (e.wav) corpo.push({ inline_data: { mime_type: 'audio/wav', data: e.wav } });
    }
    if (!ok.length) continue;
    const parts = [{ text: PROMPT_LOTTO(ok.length) }, ...corpo];
    let r = null;
    try { r = await deps.chiedi(parts); } catch (err) { deps.log(`Gemini non ha risposto (${String(err.message).split('\n')[0]}): riprovo al prossimo giro`); continue; }
    const per = new Map((r?.clip || []).map((x) => [Number(x.k) - 1, x]));
    for (const [k, c] of ok.entries()) {
      const x = per.get(k);
      if (!x) continue;
      cache[chiaveClip(c)] = { p: pulisciNome(x.prodotto), v: typeof x.parlato === 'boolean' ? x.parlato : null, c: Math.max(0, Math.min(1, Number(x.conf) || 0)) };
      fatti++;
    }
    await deps.pausa(pausaMs);
    // ogni tanto si salva quello che si è capito: un giro di ore interrotto non perde il lavoro e lo stato mostra l'avanzamento
    if (checkpoint && ++lotti % ogni === 0) await checkpoint(fatti);
  }
  return { fatti, finito: true };
}

// ───────────── messaggio di partenza ─────────────
export const SECONDI_A_CLIP = [5, 10]; // stima grossolana: fotogramma e audio letti da Drive, richiesta a Gemini, pausa tra i lotti
const durataTxt = (sec) => (sec < 5400 ? (Math.round(sec / 60) <= 1 ? '1 minuto' : `${Math.round(sec / 60)} minuti`) : `${(sec / 3600).toFixed(sec < 36000 ? 1 : 0).replace('.', ',')} ore`);
/** quante clip ci sono e quanto ci vorrà: dato appena finito l'inventario, prima del lavoro lungo */
export function messaggioInizio({ clip, cartelle, nuove, note, prova = false, budgetMinuti = 300 }) {
  const [min, max] = SECONDI_A_CLIP.map((s) => nuove * s);
  const giri = Math.ceil(max / 60 / budgetMinuti);
  return [`🔎 Ispettore${prova ? ' (prova)' : ''}: ho trovato <b>${clip}</b> file in <b>${cartelle}</b> cartelle di 05.`,
    nuove ? `Da riconoscere ora: <b>${nuove}</b> clip${note ? ` (altre ${note} le conosco già dai giri di prima)` : ''}.` : `Le conosco già tutte (${note}): passo subito al piano.`,
    ...(nuove ? [`Tempo, a occhio: tra ${durataTxt(min)} e ${durataTxt(max)}${giri > 1 ? `, in circa ${giri} giri (ognuno riprende da dove era arrivato)` : ''}. Non devi fare niente: 📊 Stato quando vuoi, ⛔ per fermarlo.`] : [])].join('\n');
}

// ───────────── 3. raggruppamento dei nomi ─────────────
/** nomi → { nome → canonico }. deps.chiedi(text) → { gruppi: [{ canonico, nomi: [...] }] }. Senza dubbi non si unisce niente. */
export async function raggruppa(conteggi, deps) {
  const nomi = Object.keys(conteggi);
  const mappa = Object.fromEntries(nomi.map((n) => [n, n]));
  // stesso nome scritto in modo diverso (maiuscole, spazi, trattini): si unisce senza chiedere
  const perChiave = new Map();
  for (const n of nomi) { const k = norm(n); perChiave.set(k, [...(perChiave.get(k) || []), n]); }
  for (const lista of perChiave.values()) { const c = lista.sort((a, b) => conteggi[b] - conteggi[a])[0]; for (const n of lista) mappa[n] = c; }
  const canonici = [...new Set(Object.values(mappa))];
  if (canonici.length < 2) return mappa;
  let r = null;
  try {
    r = await deps.chiedi([{ text: `Sono i nomi di prodotto che l'Ispettore ha dato alle clip del girato di Denis (recensioni di gadget), con quante clip ha ciascuno:\n${canonici.map((n) => `- ${n} (${conteggi[n] || 0})`).join('\n')}\nRaggruppa i nomi che sono lo STESSO prodotto (stessa marca e stessa linea o modello; un nome generico come «Anker powerbank» e uno più preciso della stessa marca e dello stesso tipo di prodotto sono lo stesso). Prodotti diversi della stessa marca (un powerbank e un caricatore a muro) restano separati: nel dubbio, NON unire.\nRispondi SOLO con JSON: {"gruppi":[{"canonico":"nome da usare","nomi":["nome A","nome B"]}]} (solo i gruppi con almeno due nomi)` }]);
  } catch (err) { deps.log(`raggruppamento non riuscito (${String(err.message).split('\n')[0]}): resta ogni nome com'è`); return mappa; }
  for (const g of r?.gruppi || []) {
    const dentro = (g.nomi || []).filter((n) => canonici.includes(n));
    if (dentro.length < 2) continue;
    const canonico = pulisciNome(g.canonico) || dentro[0];
    for (const n of dentro) for (const [k, v] of Object.entries(mappa)) if (v === n) mappa[k] = canonico;
  }
  return mappa;
}

// ───────────── 4. piano (puro: niente rete, niente Drive) ─────────────
/** nome della cartella del prodotto: una già esistente al primo livello se combacia (stesso nome o uno dentro l'altro, senza dubbi), se no il nome pulito */
export function cartellaDelProdotto(prodotto, radici /* {nome → n clip} */) {
  const k = norm(prodotto);
  const uguale = Object.keys(radici).find((r) => norm(r) === k);
  if (uguale) return uguale;
  const vicine = Object.keys(radici).filter((r) => { const x = norm(r); return x.length >= 5 && k.length >= 5 && (x.includes(k) || k.includes(x)); }).sort((a, b) => radici[b] - radici[a]);
  return vicine.length === 1 || (vicine.length > 1 && radici[vicine[0]] > radici[vicine[1]]) ? vicine[0] : pulisciNome(prodotto);
}

/**
 * clip + cache + mappa dei nomi → { mosse, dubbie, aPosto, saltate }
 * opzioni: ora, protetti (Set di path usati da un montaggio in corso), conteggioRadici
 */
export function pianifica(clips, cache, mappa, { ora = Date.now(), protetti = new Set() } = {}) {
  const radici = {};
  for (const c of clips) radici[c.radice] = (radici[c.radice] || 0) + 1;
  // cartelle modificate da poco: forse stanno ancora caricando
  const ultimo = {};
  for (const c of clips) if (c.mod > (ultimo[c.dir] || '')) ultimo[c.dir] = c.mod;
  const inCaricamento = (c) => ora - Date.parse(ultimo[c.dir] || 0) < ATTESA_CARICAMENTO_MS;
  const occupati = new Set(clips.map((c) => c.path.toLowerCase()));
  const mosse = [], dubbie = [], saltate = [];
  let aPosto = 0;
  const prodottoDi = (c) => {
    const r = cache[chiaveClip(c)];
    if (!r || !r.p || r.c < SOGLIA_CONFIDENZA) return null;
    return { prodotto: mappa[r.p] || r.p, parlato: r.v === true };
  };
  // gli audio (registratore esterno) seguono il prodotto più frequente della loro cartella, come parlato
  const perCartella = {};
  for (const c of clips) {
    if (c.tipo === 'audio' || c.giaPosto) continue;
    const x = prodottoDi(c);
    if (x) (perCartella[c.dir] ||= {})[x.prodotto] = (perCartella[c.dir][x.prodotto] || 0) + 1;
  }
  const piuFrequente = (dir) => Object.entries(perCartella[dir] || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const cartelle = {};
  const dove = (prodotto) => (cartelle[prodotto] ||= cartellaDelProdotto(prodotto, radici));
  for (const c of clips) {
    if (c.giaPosto) { aPosto++; continue; }
    let x = c.tipo === 'audio' ? (piuFrequente(c.dir) ? { prodotto: piuFrequente(c.dir), parlato: true } : null) : prodottoDi(c);
    if (!x) { dubbie.push({ path: c.path, motivo: c.tipo === 'audio' ? 'audio di una cartella senza prodotto chiaro' : 'prodotto non chiaro' }); continue; }
    const radice = dove(x.prodotto);
    const parlato = c.tipo !== 'foto' && x.parlato;
    const cartellaDest = parlato ? radice : `${radice}/B-roll`;
    let dest = `${cartellaDest}/${c.nome}`;
    if (dest === c.path) { aPosto++; continue; }
    if ([...protetti].some((x) => c.path === x || c.path.startsWith(`${x.replace(/\/$/, '')}/`))) { saltate.push({ path: c.path, motivo: 'usato da un montaggio in corso' }); continue; }
    if (inCaricamento(c)) { saltate.push({ path: c.path, motivo: 'cartella modificata da poco: forse sta ancora caricando' }); continue; }
    // mai sovrascrivere: nome già preso (da un file esistente o da una mossa già pianificata) → «nome (2).ext»
    const { name, ext } = path.parse(c.nome);
    for (let n = 2; occupati.has(dest.toLowerCase()); n++) dest = `${cartellaDest}/${name} (${n})${ext}`;
    occupati.add(dest.toLowerCase());
    mosse.push({ da: c.path, a: dest, prodotto: x.prodotto, ruolo: parlato ? 'parlato' : 'b-roll', dir: c.dir });
  }
  return { mosse, dubbie, aPosto, saltate };
}

/** raccolta per prodotto, per il riepilogo */
export function perProdotto(mosse) {
  const out = {};
  for (const m of mosse) {
    const p = (out[m.prodotto] ||= { cartella: m.a.split('/')[0], daCartelle: new Set(), parlato: 0, broll: 0 });
    p.daCartelle.add(m.dir);
    if (m.ruolo === 'parlato') p.parlato++; else p.broll++;
  }
  return Object.entries(out).map(([prodotto, p]) => ({ prodotto, cartella: p.cartella, cartelleUnite: p.daCartelle.size, parlato: p.parlato, broll: p.broll })).sort((a, b) => b.cartelleUnite - a.cartelleUnite || (b.parlato + b.broll) - (a.parlato + a.broll));
}

// ───────────── 5. esecuzione, giornale, annulla ─────────────
/** deps.sposta(da, a), deps.esiste(path), deps.rimuoviVuote(dir) → bool, deps.restano(dir) → n file rimasti, deps.salvaGiornale(lista) */
export async function esegui(mosse, giornale, deps, { scadenza = Infinity, stop = () => false } = {}) {
  let fatte = 0, saltate = 0;
  for (const m of mosse) {
    if (deps.adesso() > scadenza || ((fatte + saltate) % 10 === 0 && (await stop()))) return { fatte, saltate, interrotto: true };
    if (!(await deps.esiste(m.da))) { saltate++; continue; } // già spostato o sparito
    if (await deps.esiste(m.a)) { saltate++; deps.log(`destinazione già occupata, salto: ${m.a}`); continue; }
    try { await deps.sposta(m.da, m.a); } catch (err) { saltate++; deps.log(`spostamento non riuscito (${m.da}): ${String(err.message).split('\n')[0]}`); continue; }
    giornale.push({ da: m.da, a: m.a, quando: new Date(deps.adesso()).toISOString() });
    fatte++;
    if (fatte % 25 === 0) await deps.salvaGiornale(giornale);
  }
  await deps.salvaGiornale(giornale);
  return { fatte, saltate, interrotto: false };
}

/** cartelle d'origine rimaste vuote dopo gli spostamenti: via (solo se non resta più niente, nemmeno file non di girato) */
export async function togliVecchie(mosse, deps) {
  const destinazioni = new Set();
  for (const m of mosse) { const d = path.posix.dirname(m.a); destinazioni.add(d); destinazioni.add(d.replace(/\/B-roll$/, '')); }
  const rimosse = [], restano = [];
  for (const dir of [...new Set(mosse.map((m) => m.dir))].sort((a, b) => b.length - a.length)) {
    if (destinazioni.has(dir) || dir.split('/').length < 1) continue;
    const n = await deps.restano(dir);
    if (n > 0) { restano.push({ dir, file: n }); continue; }
    if (await deps.rimuoviVuote(dir)) rimosse.push(dir);
  }
  // le cartelle sopra (es. «Insta 360» dopo aver tolto «Insta 360/Luna»), se vuote
  for (const dir of [...new Set(rimosse.map((d) => path.posix.dirname(d)).filter((d) => d !== '.' && !destinazioni.has(d)))]) {
    if ((await deps.restano(dir)) === 0 && (await deps.rimuoviVuote(dir))) rimosse.push(dir);
  }
  return { rimosse, restano };
}

/** rimette tutto com'era: dal giornale, dall'ultimo al primo; mai sovrascrive */
export async function annulla(giornale, deps) {
  let rimessi = 0, saltati = 0;
  for (const g of [...giornale].reverse()) {
    if (!(await deps.esiste(g.a)) || (await deps.esiste(g.da))) { saltati++; continue; }
    try { await deps.sposta(g.a, g.da); rimessi++; } catch { saltati++; }
  }
  return { rimessi, saltati };
}

// ───────────── esito per la Fabbrica (stesso formato dell'Ispettore di prima) ─────────────
export function esitoPerFabbrica(tuttiProdotti, giaFatti = []) {
  const fatti = new Set(giaFatti.map(norm));
  const cartelle = {};
  for (const { cartella, parlato } of tuttiProdotti) {
    if (!parlato) continue;
    cartelle[cartella] = fatti.has(norm(cartella))
      ? { colore: 'fatta', motivo: 'già in 00, 01, 02 o 03', clip: parlato, tipo: 'recensione', prodotto: cartella }
      : { colore: 'verde', motivo: '', clip: parlato, tipo: 'recensione', girato: 0, voce: true, prodotto: cartella };
  }
  return { quando: new Date().toISOString(), origine: 'riordino', cartelle, servizio: [] };
}

// ───────────── Drive e Gemini veri (nel workflow) ─────────────
const rclone = (...a) => String(execFileSync('rclone', a, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28 }));
const remoto = (p) => `${REMOTE}:${p}`;
const leggiJson = (dove, vuoto) => { try { return JSON.parse(rclone('cat', remoto(dove))); } catch { return vuoto; } };
const scriviJson = (dove, oggetto) => execFileSync('rclone', ['rcat', remoto(dove)], { input: JSON.stringify(oggetto, null, 1), stdio: ['pipe', 'pipe', 'pipe'] });
const log = (...a) => console.log('[riordino]', ...a);

async function chiediGeminiVero(parts) {
  const chiave = process.env.GEMINI_API_KEY;
  if (!chiave) throw new Error('manca GEMINI_API_KEY');
  const modello = process.env.GEMINI_MODELLO || 'gemini-flash-latest';
  const base = process.env.GEMINI_URL || 'https://generativelanguage.googleapis.com/v1beta';
  for (const attesa of [0, 15_000, 60_000, 180_000]) {
    if (attesa) await new Promise((ok) => setTimeout(ok, attesa));
    const r = await fetch(`${base}/models/${modello}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': chiave },
      body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', temperature: 0.1 } }), signal: AbortSignal.timeout(180_000) }).catch(() => null);
    if (r?.ok) { const j = await r.json(); return JSON.parse((j.candidates?.[0]?.content?.parts || []).map((x) => x.text || '').join('').replace(/^```(?:json)?\s*|\s*```$/g, '')); }
    if (r && r.status !== 429 && r.status < 500) throw new Error(`Gemini HTTP ${r.status}`);
  }
  throw new Error('Gemini non risponde (limiti o sovraccarico)');
}

const PORTA = 18089;
async function servi() {
  const p = spawn('rclone', ['serve', 'http', remoto(ARCHIVIO), '--addr', `127.0.0.1:${PORTA}`, '--read-only'], { stdio: 'ignore' });
  for (let i = 0; i < 40; i++) { await new Promise((ok) => setTimeout(ok, 500)); try { await fetch(`http://127.0.0.1:${PORTA}/`); return p; } catch { /* non ancora */ } }
  p.kill(); throw new Error('rclone serve non è partito');
}
function estraiVero(tmp) {
  return async (c) => {
    const url = `http://127.0.0.1:${PORTA}/${c.path.split('/').map(encodeURIComponent).join('/')}`;
    const jpg = path.join(tmp, 'f.jpg'), wav = path.join(tmp, 'a.wav');
    for (const f of [jpg, wav]) fs.rmSync(f, { force: true });
    if (c.tipo === 'foto') execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', url, '-vf', 'scale=640:-2', '-frames:v', '1', '-q:v', '4', jpg], { timeout: 120_000 });
    else {
      const durata = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', url], { timeout: 120_000 }).toString().trim()) || 10;
      const t = Math.max(0, durata * 0.3);
      execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', String(t), '-i', url, '-vf', 'scale=640:-2', '-frames:v', '1', '-q:v', '4', jpg], { timeout: 120_000 });
      try { execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', String(Math.max(0, durata * 0.4)), '-i', url, '-t', '6', '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav], { timeout: 120_000 }); } catch { /* senza audio */ }
    }
    return { jpg: fs.readFileSync(jpg).toString('base64'), wav: fs.existsSync(wav) && fs.statSync(wav).size > 2000 ? fs.readFileSync(wav).toString('base64') : null };
  };
}

async function avvisa(testo) {
  if (!process.env.NOTIFY_URL) return;
  await fetch(process.env.NOTIFY_URL, { method: 'POST', headers: { 'content-type': 'application/json', 'x-regista-token': process.env.NOTIFY_TOKEN || '' }, body: JSON.stringify({ tipo: 'avviso', nome: 'Ispettore', testo }) }).catch(() => null);
}

export async function main() {
  const modo = String(process.env.MODO || 'continua').toLowerCase(); // vai | prova | continua | annulla | ferma
  const t0 = Date.now();
  const scadenza = t0 + (Number(process.env.BUDGET_MINUTI) || 300) * 60_000;
  const stato = leggiJson(`${STATO_DIR}/stato.json`, {});
  if (modo === 'ferma') { scriviJson(`${STATO_DIR}/stato.json`, { ...stato, fase: 'fermato', fermato: new Date().toISOString() }); await avvisa('🔎 Ispettore: fermato. Quello che ha già spostato resta com\'è (si rimette con «annulla»).'); return; }
  const giornale = leggiJson(`${STATO_DIR}/giornale.json`, []);
  const deps = {
    adesso: () => Date.now(), log, pausa: (ms) => new Promise((ok) => setTimeout(ok, ms)),
    esiste: (p) => { try { return JSON.parse(rclone('lsjson', remoto(`${ARCHIVIO}/${p}`), '--files-only')).length > 0; } catch { return false; } },
    sposta: (da, a) => rclone('moveto', remoto(`${ARCHIVIO}/${da}`), remoto(`${ARCHIVIO}/${a}`)),
    restano: (dir) => { try { return JSON.parse(rclone('lsjson', '-R', '--files-only', remoto(`${ARCHIVIO}/${dir}`))).length; } catch { return 1; /* nel dubbio non si tocca */ } },
    rimuoviVuote: (dir) => { try { rclone('rmdirs', remoto(`${ARCHIVIO}/${dir}`)); return true; } catch { return false; } },
    salvaGiornale: (g) => scriviJson(`${STATO_DIR}/giornale.json`, g),
  };
  if (modo === 'annulla') {
    const r = await annulla(giornale, deps);
    scriviJson(`${STATO_DIR}/stato.json`, { ...stato, fase: 'annullato', annullato: new Date().toISOString() });
    await avvisa(`🔎 Ispettore: rimessi a posto ${r.rimessi} file${r.saltati ? ` (${r.saltati} non si potevano: già spostati da te o spariti)` : ''}.`);
    return;
  }
  // quando c'è già un giro finito e non è ora di ricontrollare, «continua» non fa niente
  if (modo === 'continua' && (!stato.fase || ['fermato', 'annullato'].includes(stato.fase) || (stato.fase === 'finito' && Date.now() < Date.parse(stato.prossimo || 0)))) { log(`niente da fare (${stato.fase || 'mai avviato'})`); return; }
  if (modo === 'vai' || modo === 'prova') scriviJson(`${STATO_DIR}/stato.json`, { ...stato, fase: 'scansione', avviato: new Date().toISOString(), prova: modo === 'prova' });
  const prova = modo === 'prova' || (modo === 'continua' && stato.prova);
  const stop = () => leggiJson(`${STATO_DIR}/stato.json`, {}).fase === 'fermato';

  const clips = inventario(JSON.parse(rclone('lsjson', '-R', '--files-only', '--fast-list', remoto(ARCHIVIO))));
  log(`${clips.length} file in ${ARCHIVIO}`);
  const cache = leggiJson(`${STATO_DIR}/clip.json`, {});
  const tmp = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP || '/tmp', 'riordino-'));
  const server = await servi();
  let esito;
  const daFare = clips.filter((c) => !c.giaPosto && c.tipo !== 'audio').length;
  const checkpoint = async () => {
    scriviJson(`${STATO_DIR}/clip.json`, cache);
    const attuale = leggiJson(`${STATO_DIR}/stato.json`, {});
    if (attuale.fase === 'fermato') return; // Denis ha detto «ferma»: non si sovrascrive
    scriviJson(`${STATO_DIR}/stato.json`, { ...attuale, fase: 'riconoscimento', aggiornato: new Date().toISOString(), riconosciute: clips.filter((c) => !c.giaPosto && c.tipo !== 'audio' && cache[chiaveClip(c)]).length, totali: daFare, prova });
  };
  // quante clip e quanto tempo: subito, prima del lavoro lungo (non a ogni ripresa di un giro già avviato, né per i piccoli controlli di ogni giorno)
  const candidate = clips.filter((c) => !c.giaPosto && c.tipo !== 'audio');
  const nuove = candidate.filter((c) => !cache[chiaveClip(c)]).length;
  const riprende = modo === 'continua' && stato.fase === 'riconoscimento';
  if (!riprende && (modo !== 'continua' || nuove >= 30)) await avvisa(messaggioInizio({ clip: clips.length, cartelle: new Set(clips.filter((c) => !c.giaPosto).map((c) => c.dir)).size, nuove, note: candidate.length - nuove, prova }));
  if (nuove) await checkpoint(); // i numeri nello stato da subito: «Ispettore, stato» li mostra
  try {
    esito = await riconosci(clips.filter((c) => !c.giaPosto), cache, { ...deps, estrai: estraiVero(tmp), chiedi: chiediGeminiVero }, { scadenza, pausaMs: Number(process.env.PAUSA_MS) || 4000, stop, checkpoint });
  } finally { server.kill(); scriviJson(`${STATO_DIR}/clip.json`, cache); }
  const da = clips.filter((c) => !c.giaPosto && c.tipo !== 'audio').length;
  const fatte = clips.filter((c) => !c.giaPosto && c.tipo !== 'audio' && cache[chiaveClip(c)]).length;
  if (!esito.finito && (await stop())) { log('fermato da Denis durante il riconoscimento'); return; }
  if (!esito.finito) { scriviJson(`${STATO_DIR}/stato.json`, { ...stato, fase: 'riconoscimento', avviato: stato.avviato || new Date().toISOString(), aggiornato: new Date().toISOString(), riconosciute: fatte, totali: da, prova }); log(`tempo finito: ${fatte}/${da} clip riconosciute, riprendo al prossimo giro`); return; }

  const conteggi = {};
  for (const c of clips) { const r = cache[chiaveClip(c)]; if (r?.p && r.c >= SOGLIA_CONFIDENZA) conteggi[r.p] = (conteggi[r.p] || 0) + 1; }
  const mappa = await raggruppa(conteggi, { chiedi: chiediGeminiVero, log });
  // file usati da un montaggio in corso: il loro percorso è scritto nei file dei lavori di 01 · Da editare
  const protetti = new Set();
  try {
    for (const f of JSON.parse(rclone('lsjson', '-R', '--files-only', remoto(DIR_EDITARE), '--include', '*/_regista/archivio.json', '--include', '*/_squadra/scheda.json'))) {
      const t = rclone('cat', remoto(`${DIR_EDITARE}/${f.Path}`));
      for (const m of t.matchAll(new RegExp(`${ARCHIVIO.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/([^"\\\\]+)`, 'g'))) protetti.add(m[1]);
    }
  } catch { /* nessun lavoro aperto */ }
  const piano = pianifica(clips, cache, mappa, { protetti });
  const prodotti = perProdotto(piano.mosse);
  scriviJson(`${STATO_DIR}/piano.json`, { quando: new Date().toISOString(), prodotti, dubbie: piano.dubbie.slice(0, 300), saltate: piano.saltate.slice(0, 300), aPosto: piano.aPosto, mosse: piano.mosse.length });
  const righe = prodotti.slice(0, 12).map((p) => `• ${p.prodotto}: ${p.cartelleUnite} cartelle → «${p.cartella}» · ${p.parlato} parlato, ${p.broll} B-roll`);
  if (prova) {
    scriviJson(`${STATO_DIR}/stato.json`, { fase: 'finito', prova: true, finito: new Date().toISOString(), prossimo: new Date(Date.now() + 24 * 3600_000).toISOString() });
    await avvisa(`🔎 Ispettore (prova, non ho spostato niente): ${piano.mosse.length} file da riordinare, ${prodotti.length} prodotti.\n${righe.join('\n')}${piano.dubbie.length ? `\n${piano.dubbie.length} clip dal prodotto non chiaro restano dove sono.` : ''}`);
    return;
  }
  // «ferma» premuto mentre si raggruppava e si preparava il piano: qui sotto lo stato si riscrive, quindi si guarda prima
  if (await stop()) { log('fermato da Denis prima degli spostamenti'); return; }
  if (piano.mosse.length) await avvisa(`🔎 Ispettore: comincio a riordinare in background (${piano.mosse.length} file, ${prodotti.length} prodotti). Lo fa con calma; ⛔ per fermarlo, «annulla» per rimettere tutto.\n${righe.join('\n')}`);
  scriviJson(`${STATO_DIR}/stato.json`, { fase: 'riordino', avviato: stato.avviato || new Date().toISOString(), aggiornato: new Date().toISOString(), mosse: piano.mosse.length });
  const fine = await esegui(piano.mosse, giornale, deps, { scadenza, stop });
  if (fine.interrotto) { log(`interrotto dopo ${fine.fatte} spostamenti: ${(await stop()) ? 'fermato da Denis' : 'tempo finito, riprendo al prossimo giro'}`); return; }
  const vecchie = await togliVecchie(piano.mosse.filter((m) => !piano.saltate.some((s) => s.path === m.da)), deps);
  // l'esito per la Fabbrica (stesso formato dell'Ispettore di prima): i prodotti con parlato da montare, che non sono già montati
  const giaFatti = [];
  for (const d of [PREP, DIR_EDITARE, process.env.DIR_FATTI || '02 · Fatti', process.env.DIR_PUBBLICARE || '03 · Da pubblicare']) {
    try { for (const x of JSON.parse(rclone('lsjson', remoto(d), '--dirs-only'))) if (!diServizio(x.Name)) giaFatti.push(x.Name); } catch { /* manca */ }
  }
  const ora = inventario(JSON.parse(rclone('lsjson', '-R', '--files-only', '--fast-list', remoto(ARCHIVIO))));
  const parlatoPer = {};
  for (const c of ora) if (!c.giaPosto && c.dir === c.radice && c.tipo !== 'foto') parlatoPer[c.radice] = (parlatoPer[c.radice] || 0) + 1;
  scriviJson(ESITO_ISPETTORE, esitoPerFabbrica(Object.entries(parlatoPer).map(([cartella, parlato]) => ({ cartella, parlato })), giaFatti));
  scriviJson(`${STATO_DIR}/stato.json`, { fase: 'finito', finito: new Date().toISOString(), prossimo: new Date(Date.now() + 24 * 3600_000).toISOString(), spostati: fine.fatte, cartelleTolte: vecchie.rimosse.length });
  if (!fine.fatte && !vecchie.rimosse.length) { log('controllo giornaliero: niente da riordinare'); return; }
  await avvisa(`🔎 Ispettore: finito. ${fine.fatte} file riordinati in ${prodotti.length} prodotti, ${vecchie.rimosse.length} cartelle vecchie tolte (erano vuote, sono nel cestino di Drive)${vecchie.restano.length ? `, ${vecchie.restano.length} lasciate perché dentro c'è ancora qualcosa` : ''}.\n${righe.join('\n')}${piano.dubbie.length ? `\n${piano.dubbie.length} clip dal prodotto non chiaro restano dove sono (elenco in 00 · Preparazione/_riordino/piano.json).` : ''}\nProssimo controllo tra un giorno, da solo.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) main().catch(async (e) => { console.error(e); await avvisa(`⚠️ Ispettore fermo: ${String(e.message).split('\n')[0]}`); process.exit(1); });
