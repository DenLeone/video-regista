// Regista automatico: prende UNA cartella da "01 · Da editare" su Drive che contiene
// un file VAI, prepara il materiale, fa decidere la regia all'AI,
// renderizza con Remotion e rimette il risultato su Drive in "02 · Fatti" (nomi in cartelle.mjs).
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
//   PIXABAY_API_KEY         (facoltativo) B-roll di repertorio per gli stili con "B-roll stock: sì" (Motion);
//                           PEXELS_API_KEY in alternativa
//   NOTIFY_URL / NOTIFY_TOKEN (opzionali) bot Telegram: fasi, esito, anteprima video
//
// Modalità correzione (dal bottone ✏️ del bot): ORIGINE=98, CARTELLA=<nome>,
// CORREZIONE=<testo>. Riparte dalla regia salvata in 02 · Fatti/<nome>/_regista/
// e produce "<nome> - FINALE v2.mp4" (v3, ...) nella stessa cartella.

import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { audioMuto, frasi, inviluppo, sincronizza, sogliaVoce } from './audio.mjs';
import { DIR_EDITARE, DIR_FATTI, DIR_STILI } from './cartelle.mjs';
import { HDR, curvaChiara, curvaEsposizione, filtroTecnico, misuraPezzo, perFiltro, probe, riconosciLog } from './colore.mjs';
import { chiaveStock, materialePerAI, normFrase, risolviRegia, sequenzaDiscorso, usaTuttoIlMateriale } from './regia.mjs';
import { movimento, syncMovimento } from './sync-visivo.mjs';
import { LOOK_FFMPEG, leggiStile, promptSuMisura } from './stile-su-misura.mjs';
import { AUDIO_EXT, IMAGE_EXT, NOMI_DISPOSITIVO, VIDEO_EXT, dispositivo, prioritaAudio, tagsPiatti } from './sorgenti.mjs';

const REMOTE = process.env.REGISTA_REMOTE || 'gdrive';
const IN_DIR = DIR_EDITARE;
const OUT_DIR = DIR_FATTI;
const CORREZIONE = (process.env.CORREZIONE || '').trim();
const RIRENDER = process.env.AZIONE === 'render'; // rifà solo il render con la regia salvata (origine 98)
// render di prova (input "secondi"): solo i primi N secondi del montaggio, per provare look e
// grafica di uno stile in pochi minuti; esce come "<nome> - PROVA Ns.mp4", senza didascalie
const PROVA_SECONDI = Math.max(0, Number(process.env.PROVA_SECONDI) || 0);
// file mandati direttamente al bot: [{"m": id_messaggio, "n": "nome.mov"}, ...]
const TELEGRAM_FILE = (process.env.TELEGRAM_FILE || '').trim();
const DA_TELEGRAM = Boolean(TELEGRAM_FILE && TELEGRAM_FILE !== '[]');
const CHIAVI_TELEGRAM = Boolean(process.env.TG_API_ID && process.env.TG_API_HASH && process.env.TELEGRAM_BOT_TOKEN);
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
const isNostro = (name) => isVai(name) || isInCorso(name) || /^_VAI_usato_/i.test(name) || /FINALE| - PROVA \d+s/i.test(name) || /^(NOTE|ERRORE|_ERRORE.*)\.txt$/i.test(name);

// data di ripresa: metadati della camera, altrimenti dal nome (VID_20261018_…, IMG_20261018…)
function dataRipresa(tags, nome) {
  for (const k of ['com.apple.quicktime.creationdate', 'creation_time', 'date']) {
    const d = Date.parse(tags?.[k] || '');
    if (d > Date.UTC(2015, 0, 1)) return d;
  }
  const m = /(20\d{2})(\d{2})(\d{2})/.exec(nome);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null;
}

// brief del giro: brief.txt + quello dal bot + (correzione / solo render) quello del giro prima.
// Senza doppioni e con una sola riga "Dal telegram": prima ogni rifacimento riaccodava il brief
// vecchio al nuovo (30 righe "Stile: …" ripetute dopo una decina di prove). Quella del bot è sempre
// la più recente; senza, vale l'ultima del giro prima (la prima riga "Dal telegram" salvata).
export function unisciBrief(briefFile = '', extra = '', briefPrima = '') {
  const righe = [];
  const visti = new Set();
  const aggiungi = (r) => {
    const t = String(r).trim();
    const k = t.toLowerCase().replace(/\s+/g, ' ');
    if (t && !visti.has(k)) { visti.add(k); righe.push(t); }
  };
  String(briefFile || '').split('\n').forEach(aggiungi);
  let telegram = String(extra || '').trim() ? `Dal telegram: ${String(extra).trim()}` : null;
  for (const r of String(briefPrima || '').split('\n')) {
    if (/^dal telegram:/i.test(r.trim())) { if (!telegram) telegram = r.trim(); } else aggiungi(r);
  }
  if (telegram) aggiungi(telegram);
  return righe.join('\n');
}

// Regola di Denis (20/10): una cartella con un solo video è un suo discorso (es. "Sommossa", 4 min e
// mezzo). Niente regia: nessun accorciamento né riordino, solo pause, false partenze e ripetizioni
// tolte (regia.mjs sequenzaDiscorso), il look e le scritte dello stile. "regia completa" nel brief
// la toglie, come una durata scelta dal bot ("Durata: 60 s": va accorciato, quindi serve la regia);
// "modalità discorso" / "solo pulizia" / "niente regia" la forzano anche con più video.
// un solo video parlato e gli altri solo B-roll (nessuna seconda voce né camera sincronizzata): è
// ancora un discorso, con i B-roll di Denis sopra la voce (Motion, 21/10)
export function discorsoConBroll(sorgenti, brief = '') {
  if (!modoDiscorso(1, brief)) return false;
  const voci = sorgenti.filter((s) => s.principale);
  return voci.length === 1 && voci[0].tipo === 'video' && !sorgenti.some((s) => s.sync || (!s.principale && s.parlato && !s.soloImmagini))
    && sorgenti.some((s) => s.tipo === 'video' && !s.principale);
}
export function modoDiscorso(nVideo, brief = '') {
  if (/\bregia\s+(completa|normale)\b|\bmontaggio\s+completo\b|\bdurata\s*:\s*\d/i.test(brief)) return false;
  if (/\bmodalit[àa]\s+discorso\b|\bsolo\s+pulizia\b|\bniente\s+regia\b/i.test(brief)) return true;
  return nVideo === 1;
}
let DISCORSO = false;     // modalità discorso del giro in corso
let analisiCorrente = null; // il materiale del giro in corso (per il prompt)
let discorso = null;      // { sequenza, tolte, durata } della modalità discorso (per il prompt)
function preparaDiscorso(analisi) {
  const d = sequenzaDiscorso(analisi);
  const durata = d.sequenza.reduce((t, it) => { const f = analisi.frasi.find((x) => x.id === it.frase); return t + (f ? f.fine - f.inizio : 0); }, 0);
  // B-roll di Denis nella cartella (con i loro fogli provino): l'AI li mette sopra la voce
  const conBroll = analisi.sorgenti.some((s) => !s.principale && s.tipo === 'video' && s.fogli?.length);
  discorso = { ...d, durata, conBroll };
  return discorso;
}
// la sequenza del discorso vince su quella dell'AI (tiene solo le sue aggiunte di stile: "bn", e nel
// Motion "fumo", "stock" e gli inserti); `discorso: true` dice a risolviRegia di alternare lo zoom solo
// dove c'è un salto. Anche per correzioni e "Solo render" di un discorso (DISCORSO senza la sequenza nuova)
const AGGIUNTE_DISCORSO = ['bn', 'fumo', 'stock', 'inserto', 'inserto_da', 'broll', 'da', 'lento'];
const aggiunteDi = (x) => Object.fromEntries(AGGIUNTE_DISCORSO.filter((k) => (k === 'bn' || k === 'fumo' || k === 'lento' ? x[k] === true : x[k] != null && x[k] !== '')).map((k) => [k, x[k]]));
const conSequenza = (r) => (discorso ? { ...r, sequenza: discorso.sequenza.map((it) => {
  const x = (r.sequenza || []).find((y) => normFrase(y.frase) === it.frase);
  return { ...it, ...(x ? aggiunteDi(x) : {}) };
}) } : r);
// in più: i video e le immagini di Denis che l'AI non ha usato vanno messi lo stesso (usaTuttoIlMateriale)
const perRegia = (r) => usaTuttoIlMateriale(DISCORSO ? { ...conSequenza(r), discorso: true } : r, analisiCorrente);

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

// nome scritto a mano che non esiste ("Giacca autunno" per "Giacca autunnale", 18/10):
// errore chiaro con le cartelle dal nome più simile
function cartellaNonTrovata(nome, errore) {
  let simili = [];
  try {
    const norm = (t) => String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const dist = (a, b) => {
      const d = Array.from({ length: b.length + 1 }, (_, j) => j);
      for (let i = 1; i <= a.length; i++) {
        let prec = d[0]; d[0] = i;
        for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prec + (a[i - 1] === b[j - 1] ? 0 : 1)); prec = t; }
      }
      return d[b.length];
    };
    const n = norm(nome);
    simili = JSON.parse(rclone('lsjson', remote(SRC_DIR), '--dirs-only')).map((x) => x.Name)
      .map((x) => ({ x, d: norm(x).includes(n) || n.includes(norm(x)) ? 0 : dist(norm(x), n) }))
      .filter((c) => c.d <= Math.max(3, n.length / 3)).sort((a, b) => a.d - b.d).slice(0, 3).map((c) => c.x);
  } catch { /* elenco non disponibile */ }
  return new Error(`non trovo la cartella "${nome}" in ${SRC_DIR}${simili.length ? `. Forse intendevi: ${simili.map((x) => `"${x}"`).join(', ')}` : ` (${String(errore?.message || '').split('\n')[0]})`}`);
}

// stessa cartella a meno di spazi e maiuscole: su Drive "Manifestazioni " (spazio in fondo), dal bot
// "Manifestazioni" (20/10: due montaggi falliti con "non trovo la cartella"). Il nome vero o null
function cartellaUguale(nome) {
  const norm = (t) => String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
  try {
    const uguali = JSON.parse(rclone('lsjson', remote(SRC_DIR), '--dirs-only')).map((x) => x.Name).filter((x) => norm(x) === norm(nome));
    return uguali.length === 1 ? uguali[0] : null;
  } catch { return null; }
}

function trovaCartella() {
  if (DA_TELEGRAM) return { nome: nomeLibero(process.env.CARTELLA), files: [], vai: null };
  // avvio da Telegram/manuale con cartella esplicita: VAI non obbligatorio
  if (process.env.CARTELLA) {
    let nome = process.env.CARTELLA;
    let files;
    try { files = JSON.parse(rclone('lsjson', remote(SRC_DIR, nome), '--files-only')); } catch (e) {
      const vero = cartellaUguale(nome);
      if (!vero || vero === nome) throw cartellaNonTrovata(nome, e);
      log(`cartella "${nome}" trovata come "${vero}"`);
      nome = vero;
      files = JSON.parse(rclone('lsjson', remote(SRC_DIR, nome), '--files-only'));
    }
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
// conversione tecnica (scripts/colore.mjs), poi `curva` (esposizione del singolo pezzo), la LUT
// creativa dello stile se c'è (asset/*.cube o il look 12K) e il colore dei look in ffmpeg.
// Look 12K: dopo la LUT la nitidezza (CAS: incide i dettagli del soggetto senza aloni né rumore
// sulle zone lisce, come negli esempi)
function filtroColore(c, curva = null) {
  const base = filtroTecnico(c);
  const dopo = [
    curva ? `curves=master='${curva}'` : '',
    LUT_STILE ? `lut3d=file='${perFiltro(LUT_STILE)}':interp=tetrahedral` : '',
    LOOK_12K ? `cas=strength=${NITIDEZZA_12K}` : '',
    LOOK_STILE?.filtro || '',
  ].filter(Boolean);
  if (!dopo.length) return base;
  return `${base.replace(/,?format=yuv420p$/, '').replace(/^$/, 'null')},${dopo.join(',')},format=yuv420p`;
}
// prima/dopo la conversione colore su un fotogramma (a metà clip): va in _regista per
// controllare la resa della LUT I-Log senza scaricare il girato
function confrontoColore(file, id, durata, colore) {
  const out = path.join(WORK, `colore-${id}.jpg`);
  try {
    run('ffmpeg', ['-y', '-v', 'error', '-ss', (durata / 2).toFixed(2), '-i', file, '-frames:v', '1', '-filter_complex',
      `[0:v]scale=540:-2,split[a][b];[a]format=yuv420p[a1];[b]${filtroColore(colore)}[b1];[a1][b1]hstack`, '-q:v', '3', out]);
  } catch (e) { log(`confronto colore di ${id} non riuscito`, e.message); }
}

// Si ricodificano solo i pezzi usati dal montaggio (1080p, colori SDR). Prima si convertiva
// tutto il girato 4K: 40 dei 58 minuti del primo giro reale.
// lanczos: dal 4K al 1080 resta più dettaglio del bicubico di default. `zoom` (punch-in del jump
// cut): si ritaglia dall'originale prima di ridurre, invece di ingrandire nel browser il pezzo già a
// 1080 (dal 4K il dettaglio c'è ancora). Colori dichiarati BT.709: senza, il render li indovina.
const TAG_709 = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];
// Look 12K, voce e camere sincronizzate: se il pezzo ha la luce della ripresa intera si usa la misura
// di tutta la ripresa, così i pezzi dello stesso volto escono con la stessa curva (misurati uno per
// uno, il soggetto che si muove spostava la misura e la luce saltava da un taglio all'altro: nel
// discorso sono decine di tagli sulla stessa inquadratura). Se la luce cambia (si cammina, si esce)
// vale quella del pezzo; i B-roll sempre pezzo per pezzo.
const misureRiprese = new Map();
function misuraPerLook(s, start, dur) {
  const tec = filtroTecnico(s.colore);
  const m = misuraPezzo(s.originale, start, dur, tec);
  if (!m || !(s.principale || s.sync)) return m;
  if (!misureRiprese.has(s.id)) misureRiprese.set(s.id, misuraPezzo(s.originale, 0, s.durata, tec, [0.1, 0.25, 0.4, 0.55, 0.7, 0.85]));
  const r = misureRiprese.get(s.id);
  const pelleSimile = (m.pelle == null) === (r?.pelle == null) && (m.pelle == null || Math.abs(m.pelle - r.pelle) < 0.05);
  return r && pelleSimile && Math.abs(m.medio - r.medio) < 0.05 && Math.abs(m.nero - r.nero) < 0.03 && Math.abs(m.bianco - r.bianco) < 0.08 ? r : m;
}
// `lento` (rallentatore): `dur` secondi di sorgente stirati di quel fattore, a `fps` fotogrammi al secondo
function taglia(s, start, dur, out, conAudio, senzaLook = false, zoom = 1, lento = 1, fps = 30) {
  // repertorio orizzontale: ritaglio centrale 9:16, poi lo zoom
  const ritaglio = (s.ritaglia916 ? 'crop=trunc(ih*9/16/2)*2:ih,' : '') + (zoom > 1 ? `crop=trunc(iw/${zoom}/2)*2:trunc(ih/${zoom}/2)*2,` : '');
  const rallenta = lento > 1 ? `setpts=${lento}*PTS,` : '';
  let curva = null;
  if (!senzaLook) {
    // look 12K: la sua curva; look chiari ("chiaro caldo" del Narrativo): centro e volto ben esposti;
    // gli altri stili: solo se il soggetto è proprio al buio (Moero air, 20/10: volto a 0,14 in controluce)
    // repertorio (Pexels): già esposto bene, prende solo il colore dello stile
    const m = s.stock ? null : misuraPerLook(s, start, dur);
    curva = !m ? null : LOOK_12K ? curvaEsposizione(m) : LOOK_STILE?.esposizione ? curvaChiara(m, LOOK_STILE.esposizione)
      : (m.pelle != null && m.pelle < 0.2) || m.medio < 0.25 ? curvaChiara(m, { obiettivo: 0.45, obiettivoPelle: 0.3 }) : null;
    if (m) log(`  ${path.basename(out)}: soggetto ${m.medio.toFixed(2)}${m.pelle != null ? `, volto ${m.pelle.toFixed(2)}` : ''}, neri ${m.nero.toFixed(2)}, bianchi ${m.bianco.toFixed(2)}${curva ? ` → curva ${curva}` : ''}`);
  }
  run('ffmpeg', ['-y', '-v', 'error', '-ss', start.toFixed(3), '-i', s.originale, '-t', (dur * lento + 0.1).toFixed(3),
    '-vf', `${rallenta}${ritaglio}scale='if(gt(iw,ih),1920,1080)':-2:flags=lanczos,${senzaLook ? filtroTecnico(s.colore) : filtroColore(s.colore, curva)}`,
    ...(lento > 1 ? ['-r', String(fps)] : []),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p', ...TAG_709,
    ...(conAudio && lento === 1 ? ['-c:a', 'aac', '-b:a', '160k'] : ['-an']), '-movflags', '+faststart', out]);
}

function troncaPiano(piano, secondi) {
  let t = 0;
  const clips = [];
  for (const c of piano.clips) {
    if (t >= secondi - 0.05) break;
    const dur = c.end - c.start, resta = secondi - t;
    clips.push(dur > resta ? { ...c, end: +(c.start + resta).toFixed(3) } : c);
    t += Math.min(dur, resta);
  }
  piano.clips = clips;
  piano.keywords = piano.keywords.filter((k) => k.at < t - 0.3).map((k) => ({ ...k, dur: +Math.min(k.dur, t - k.at).toFixed(3) }));
  piano.parole = (piano.parole || []).filter((w) => w.at < t);
  piano.flickers = (piano.flickers || []).filter((f) => f.at < t);
}

// B-roll di repertorio (stili con "B-roll stock: sì", come il Motion): per ogni "stock" della regia
// (una ricerca in inglese) un video da Pixabay o Pexels, aggiunto alle sorgenti. Le chiavi sono i
// secret PIXABAY_API_KEY / PEXELS_API_KEY, messi da Denis su GitHub (Pexels non dà più chiavi nuove,
// 21/10): senza, o senza risultati, la frase resta sulla sua inquadratura. Si preferiscono i video
// verticali; gli orizzontali si ritagliano al centro in 9:16 (taglia). Restituisce quanti ne ha scaricati
const PIXABAY = () => process.env.PIXABAY_URL || 'https://pixabay.com';
const PEXELS = () => process.env.PEXELS_URL || 'https://api.pexels.com';
const FONTI_STOCK = {
  // candidati: { id, durata, link, w, h, autore, pagina }
  // Pixabay: solo riprese vere, niente animazioni ("supermarket price tags" dava un buono sconto disegnato, 21/10)
  Pixabay: async (q) => {
    const r = await fetchRiprova(`${PIXABAY()}/api/videos/?key=${encodeURIComponent(process.env.PIXABAY_API_KEY)}&q=${encodeURIComponent(q)}&video_type=film&safesearch=true&per_page=20`, {}, 2);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const { hits = [] } = await r.json();
    return hits.map((h) => {
      // il file più piccolo che basta per 1080×1920 (gli orizzontali vanno ritagliati: serve l'altezza)
      const files = Object.values(h.videos || {}).filter((x) => x?.url && x.width && x.height);
      const verticale = files.some((x) => x.height > x.width);
      const ok = files.filter((x) => (verticale ? x.width >= 720 : x.height >= 1080)).sort((x, y) => x.width * x.height - y.width * y.height)[0]
        || files.sort((x, y) => y.width * y.height - x.width * x.height)[0];
      return ok && { id: `pixabay-${h.id}`, durata: h.duration, link: ok.url, w: ok.width, h: ok.height, autore: h.user, pagina: h.pageURL };
    }).filter(Boolean);
  },
  Pexels: async (q) => {
    const r = await fetchRiprova(`${PEXELS()}/videos/search?query=${encodeURIComponent(q)}&orientation=portrait&size=medium&per_page=10`,
      { headers: { Authorization: process.env.PEXELS_API_KEY } }, 2);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const { videos = [] } = await r.json();
    return videos.map((v) => {
      const file = (v.video_files || []).filter((x) => x.height > x.width && x.width >= 720 && /mp4/.test(x.file_type || 'mp4') && x.link)
        .sort((a, b) => Math.abs(a.width - 1080) - Math.abs(b.width - 1080))[0];
      return file && { id: `pexels-${v.id}`, durata: v.duration, link: file.link, w: file.width, h: file.height, autore: v.user?.name, pagina: v.url };
    }).filter(Boolean);
  },
};
export const fontiStock = () => Object.keys(FONTI_STOCK).filter((n) => process.env[`${n.toUpperCase()}_API_KEY`]);
// i video e le immagini di Denis nella cartella (oltre alla voce): se ci sono si usano quelli e
// nessun altro, niente repertorio (Beats pokemon, 22/10)
export const materialeProprio = (analisi) => analisi.sorgenti.some((s) => s.tipo === 'video' && !s.principale && !s.sync && !s.stock)
  || (analisi.immagini || []).length > 0;
async function scaricaStock(regia, analisi) {
  if (materialeProprio(analisi)) { log('stock: nella cartella ci sono video o immagini di Denis, niente repertorio'); return 0; }
  const richieste = [...new Set((regia.sequenza || []).map((it) => String(it.stock || '').trim()).filter(Boolean))].slice(0, 12);
  if (!richieste.length) return 0;
  const fonti = fontiStock();
  if (!fonti.length) { log(`stock: ${richieste.length} B-roll di repertorio chiesti ma manca PIXABAY_API_KEY: restano le inquadrature`); return 0; }
  analisi.stock = analisi.stock || {};
  const dir = path.join(WORK, 'stock');
  fs.mkdirSync(dir, { recursive: true });
  const usati = new Set(analisi.sorgenti.filter((s) => s.stock).map((s) => s.idStock));
  let scaricati = 0;
  for (const q of richieste) {
    const chiave = chiaveStock(q);
    if (!chiave || analisi.stock[chiave]) continue;
    try {
      // il primo video di almeno 4 s non già usato, prima i verticali, fonte per fonte
      let scelto = null;
      for (const fonte of fonti) {
        const candidati = (await FONTI_STOCK[fonte](q)).filter((c) => c.durata >= 4 && !usati.has(c.id));
        const c = candidati.find((x) => x.h > x.w) || candidati[0];
        if (c) { scelto = { ...c, fonte }; break; }
      }
      if (!scelto) { log(`stock "${q}": nessun video adatto`); continue; }
      const id = `stock${analisi.sorgenti.filter((s) => s.stock).length + 1}`;
      const dest = path.join(dir, `${id}.mp4`);
      const d = await fetchRiprova(scelto.link, {}, 3);
      if (!d.ok) throw new Error(`download HTTP ${d.status}`);
      fs.writeFileSync(dest, Buffer.from(await d.arrayBuffer()));
      const info = probe(dest);
      if (!info.durata) throw new Error('file non leggibile');
      usati.add(scelto.id);
      // orizzontale: ritagliato al centro in 9:16 al taglio, poi è un verticale come gli altri
      analisi.sorgenti.push({ id, file: `${id}.mp4`, originale: dest, tipo: 'video', dispositivo: 'stock', nomeDispositivo: scelto.fonte,
        durata: +info.durata.toFixed(2), orient: 'v', ritaglia916: info.w > info.h, haAudio: false, colore: info.colore, fps: info.fps,
        soloImmagini: 'repertorio', stock: true, idStock: scelto.id, crediti: `${scelto.autore || scelto.fonte} (${scelto.pagina || scelto.fonte})` });
      analisi.stock[chiave] = id;
      scaricati++;
      log(`stock "${q}": ${id} da ${scelto.fonte}, ${info.w}×${info.h} ${info.durata.toFixed(1)} s di ${scelto.autore || '—'}`);
    } catch (e) { log(`stock "${q}" non scaricato: ${e.message}`); }
  }
  return scaricati;
}

const ZOOM_PUNCH = 1.18; // come in src/comune.tsx
function tagliaSegmenti(piano, analisi) {
  const perFile = new Map(analisi.sorgenti.filter((s) => s.tipo === 'video').map((s) => [s.file, s]));
  piano.clips.forEach((c, i) => {
    const s = perFile.get(c.file);
    if (!s) throw new Error(`sorgente sconosciuta ${c.file}`);
    const dur = c.end - c.start;
    const seg = `seg_${String(i).padStart(3, '0')}.mp4`;
    // punch-in delle clip verticali fatto qui (le orizzontali stanno "contenute": resta a Remotion)
    const zoom = c.punch && s.orient !== 'h' ? ZOOM_PUNCH : 1;
    // rallentatore: dur è la durata sul video, della sorgente ne serve dur / lento
    const lento = c.lento > 1 ? c.lento : 1;
    taglia(s, c.start, dur / lento, path.join(MEDIA, seg), !c.audio && !c.muto && s.haAudio, false, zoom, lento, piano.fps || 30);
    Object.assign(c, { file: seg, start: 0, end: +dur.toFixed(3), sorgente: s.id, daSorgente: c.start });
    if (zoom > 1) c.punch = false;
    delete c.lento; // il pezzo è già al rallentatore
    // inserto video: il suo pezzo, muto e senza look creativo (le schermate restano fedeli)
    if (c.inserto?.tipo === 'video') {
      const si = perFile.get(c.inserto.file);
      if (!si) { delete c.inserto; return; }
      const ins = `ins_${String(i).padStart(3, '0')}.mp4`;
      const d = c.inserto.end - c.inserto.start;
      taglia(si, c.inserto.start, d, path.join(MEDIA, ins), false, true);
      Object.assign(c.inserto, { file: ins, start: 0, end: +d.toFixed(3) });
    }
  });
}

// immagini della cartella (screenshot, foto del prodotto): usabili come inserto. Si convertono in
// JPG in public/media e si fa un foglio provino con il nome di ognuna, da far vedere all'AI
function preparaImmagini(foto) {
  const out = [];
  const dir = path.join(WORK, 'fogli', '_immagini');
  fs.mkdirSync(dir, { recursive: true });
  const etichetta = (t) => (FONT ? `,drawtext=fontfile='${FONT.replace(/:/g, '\\:')}':text='${t.replace(/[':\\]/g, ' ')}':x=6:y=6:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.65:boxborderw=4` : '');
  for (const f of foto) {
    const id = path.parse(f).name;
    const file = `img_${id.replace(/[^\w-]+/g, '_')}.jpg`;
    try {
      run('ffmpeg', ['-y', '-v', 'error', '-i', path.join(SCARICO, f), '-frames:v', '1', '-vf', "scale='min(1600,iw)':-2", '-q:v', '3', path.join(MEDIA, file)]);
      const info = probe(path.join(MEDIA, file));
      run('ffmpeg', ['-y', '-v', 'error', '-i', path.join(MEDIA, file), '-vf', `scale=240:426:force_original_aspect_ratio=decrease,pad=240:426:(ow-iw)/2:(oh-ih)/2:black${etichetta(id)}`, '-q:v', '4', path.join(dir, `${String(out.length).padStart(3, '0')}.jpg`)]);
      out.push({ id, file, orient: info.w > info.h ? 'h' : 'v' });
    } catch (e) { log(`immagine ${f} non leggibile (HEIC?): saltata`, e.message.split('\n')[0]); }
  }
  if (!out.length) return { immagini: out, foglio: null };
  const foglio = path.join(WORK, 'fogli', 'immagini.jpg');
  run('ffmpeg', ['-y', '-v', 'error', '-i', path.join(dir, '%03d.jpg'), '-vf', `tile=${Math.min(4, out.length)}x${Math.ceil(out.length / 4)}`, '-frames:v', '1', '-q:v', '4', foglio]);
  return { immagini: out, foglio: path.relative(ROOT, foglio).replace(/\\/g, '/') };
}

// MediaPipe (segmentazione della persona) in un ambiente a parte: il Python di sistema del runner
// non accetta pip install. Si prepara una volta sola per giro.
let mediapipePronto = null;
function preparaMediaPipe() {
  mediapipePronto ??= (async () => {
    const modello = path.join(WORK, 'selfie_multiclass.tflite');
    let py = process.env.REGISTA_PYTHON || 'python3';
    try { run(py, ['-c', 'import mediapipe'], { stdio: 'ignore' }); } catch {
      const venv = path.join(WORK, 'venv-ritaglio');
      run('python3', ['-m', 'venv', venv]);
      py = path.join(venv, 'bin', 'python');
      run(py, ['-m', 'pip', 'install', '--quiet', 'mediapipe']);
    }
    if (!fs.existsSync(modello)) {
      const r = await fetchRiprova('https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite', {}, 3);
      if (!r.ok) throw new Error(`modello di segmentazione: ${r.status}`);
      fs.writeFileSync(modello, Buffer.from(await r.arrayBuffer()));
    }
    return { py, modello };
  })();
  return mediapipePronto;
}

// "Soggetto in risalto" (stili su misura): sui pezzi già colorati la persona resta luminosa e nitida,
// lo sfondo scende al buio e vira al petrolio, sfocato solo con "Sfondo sfocato: sì"
// (scripts/look/risalto.py). I pezzi senza una
// persona chiara (dettagli di prodotto) restano come sono; se qualcosa non va, video senza risalto.
async function risaltoPersona(piano) {
  if (!piano.grafica?.risalto) return;
  try {
    const { py, modello } = await preparaMediaPipe();
    let n = 0;
    for (const c of piano.clips) {
      if (c.orient === 'h') continue;
      const src = path.join(MEDIA, c.file), out = path.join(MEDIA, `ris_${c.file}`);
      const esito = run(py, [path.join(ROOT, 'scripts', 'look', 'risalto.py'), src, out, modello, ...(piano.grafica.sfoca ? ['sfoca'] : [])], { stdio: ['ignore', 'pipe', 'inherit'] });
      if (/^risalto/m.test(esito) && fs.existsSync(out)) { fs.renameSync(out, src); n++; }
    }
    log(`soggetto in risalto: ${n} pezzi su ${piano.clips.length}`);
  } catch (e) {
    log('soggetto in risalto non riuscito: pezzi senza', e.message.split('\n')[0]);
  }
}

// la persona ritagliata nei momenti delle scritte grandi (stili su misura con "Scritte dietro di me"):
// MediaPipe in scripts/ritaglio.py; se qualcosa non va le scritte restano davanti, il video esce lo stesso
async function ritagliPersona(piano) {
  const g = piano.grafica;
  if (!g?.dietro) return;
  const intervalli = [];
  if (g.apertura === 'grande' && piano.parole?.length) {
    // stessa regola di fineApertura in src/SuMisura.tsx
    const parole = piano.parole, fineFrase = parole.find((p) => /[.!?]$/.test(p.w));
    const pause = parole.filter((p, i) => p.at + p.dur <= 5 && p.at + p.dur >= 1.5 && (/[,;:.!?]$/.test(p.w) || (parole[i + 1] && parole[i + 1].at - (p.at + p.dur) > 0.35)));
    const fine = fineFrase && fineFrase.at + fineFrase.dur <= 5 ? Math.max(1.5, fineFrase.at + fineFrase.dur)
      : pause.length ? pause[pause.length - 1].at + pause[pause.length - 1].dur : 5;
    intervalli.push([0, fine + 0.6]);
  }
  if (g.titoli && g.tipoTitoli === 'frasi') for (const k of piano.keywords) intervalli.push([k.at, k.at + k.dur]);
  if (!intervalli.length) return;
  try {
    const { py, modello } = await preparaMediaPipe();
    let t = 0, n = 0;
    for (const [i, c] of piano.clips.entries()) {
      const dur = c.end - c.start;
      const sovrapposti = intervalli.map(([a, b]) => [Math.max(a, t), Math.min(b, t + dur)]).filter(([a, b]) => b - a > 0.1);
      if (sovrapposti.length && c.orient !== 'h' && !c.inserto) {
        const da = Math.min(...sovrapposti.map(([a]) => a)) - t, a = Math.max(...sovrapposti.map(([, b]) => b)) - t;
        const out = `rit_${String(i).padStart(3, '0')}.webm`;
        run(py, [path.join(ROOT, 'scripts', 'ritaglio.py'), path.join(MEDIA, c.file), path.join(MEDIA, out), modello, (a - da).toFixed(3), da.toFixed(3)], { stdio: ['ignore', 'pipe', 'inherit'] });
        c.ritaglio = { file: out, da: +da.toFixed(3), dur: +(a - da).toFixed(3) };
        n++;
      }
      t += dur;
    }
    log(`ritagli della persona: ${n}`);
  } catch (e) {
    log('ritaglio della persona non riuscito: scritte davanti', e.message.split('\n')[0]);
    for (const c of piano.clips) delete c.ritaglio;
  }
}

// con tanti video in parallelo Groq può andare al limite orario: si passa al modello turbo (quota separata).
// lingua null: la riconosce Whisper (video di esempio, spesso in inglese)
// nomi: marchi e prodotti del brief ("Prodotto: Ajazz AK980"), suggeriti a Whisper per scriverli giusti
async function trascrivi(file, lingua = 'it', nomi = []) {
  const mp3 = path.join(WORK, `${path.parse(file).name}.trascrizione.mp3`);
  run('ffmpeg', ['-y', '-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '48k', mp3]);
  for (const modello of ['whisper-large-v3', 'whisper-large-v3-turbo']) {
    const form = new FormData();
    form.append('file', new Blob([fs.readFileSync(mp3)]), path.basename(mp3));
    form.append('model', modello);
    if (lingua) form.append('language', lingua);
    if (nomi.length) form.append('prompt', nomi.join(', '));
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

// Marchi e nomi di prodotto: Whisper li sbaglia ("Ajax" per Ajazz, 980 del 20/10) e negli stili
// con le parole a schermo l'errore si vede. Si scrivono nel brief ("Prodotto: Ajazz AK980" o
// "Nomi: ..."): una parola trascritta con la maiuscola o con cifre quasi uguale a uno di questi
// (stessa iniziale, 1–2 lettere di differenza) diventa quella giusta, punteggiatura compresa.
export function nomiDelBrief(brief) {
  const righe = [...String(brief || '').matchAll(/\b(?:prodott[oi]|nomi|marc(?:a|he))\s*:\s*([^.\n]+)/gi)].map((m) => m[1]);
  return [...new Set(righe.flatMap((r) => r.match(/[\p{L}\p{N}][\p{L}\p{N}-]{2,}/gu) || []))];
}
const nucleo = (w) => String(w).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
function distanzaParole(a, b) {
  let riga = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const nuova = [i];
    for (let j = 1; j <= b.length; j++) nuova[j] = Math.min(riga[j] + 1, nuova[j - 1] + 1, riga[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    riga = nuova;
  }
  return riga[b.length];
}
export function correggiNomi(parole, nomi) {
  if (!nomi.length) return parole;
  return parole.map((p) => {
    const m = /^([^\p{L}\p{N}]*)([\p{L}\p{N}][\p{L}\p{N}'-]*)(.*)$/u.exec(String(p.w).trim());
    if (!m || !(/^\p{Lu}/u.test(m[2]) || /\d/.test(m[2]))) return p;
    const n = nucleo(m[2]);
    const giusto = nomi.find((x) => {
      const k = nucleo(x);
      return k !== n && k.length >= 4 && k[0] === n[0] && distanzaParole(n, k) <= (k.length >= 5 ? 2 : 1);
    });
    return giusto ? { ...p, w: `${m[1]}${giusto}${m[3]}` } : p;
  });
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
    .replace('{{GRAFICA}}', stileSuMisura ? promptSuMisura(stileSuMisura.grafica, stileSuMisura.testoAI, { stock: fontiStock().length > 0 && !(analisiCorrente && materialeProprio(analisiCorrente)) })
      : fs.readFileSync(path.join(ROOT, 'scripts', 'stili', `${stileCorrente}.md`), 'utf8').trim());
  if (regiaPrecedente) {
    p += `\n\n## MODALITÀ CORREZIONE\nEsiste già un montaggio, questa è la sua regia:\n\`\`\`json\n${JSON.stringify(regiaPrecedente, null, 1)}\n\`\`\`\nDenis l'ha guardato e chiede queste modifiche:\n\n> ${CORREZIONE.replace(/\n/g, '\n> ')}\n\nParti da questa regia e applica SOLO quello che chiede, lasciando invariato il resto. I tempi li ricalcola lo script. Nella \`note\` elenca in breve cosa hai cambiato.`;
  }
  if (discorso && !regiaPrecedente) {
    const durata = discorso.durata;
    // cartelli a tutto schermo (Motion): pochi, uno ogni ~45 s (Manifestazioni, 21/10: 7 in 2 minuti erano troppi)
    const cartelli = stileSuMisura?.grafica.tipoTitoli === 'cartelli';
    const quante = cartelli ? Math.max(1, Math.min(4, Math.round(durata / 45))) : Math.max(3, Math.min(20, Math.round(durata / 20)));
    // stili senza scritte grandi (12K Quality): niente keywords da distribuire
    const scritte = !stileSuMisura || stileSuMisura.grafica.titoli
      ? `Il video dura circa ${Math.round(durata)} s: distribuisci ${cartelli ? 'al massimo' : 'circa'} ${quante} ${cartelli ? 'cartelli' : 'scritte grandi'} su tutta la durata (${cartelli ? 'uno ogni ~45 s' : 'una ogni ~20 s'}), sulle frasi più forti; questo vale più del numero indicato nella sezione Grafica.`
      : 'Questo stile non ha scritte grandi: `keywords` vuoto.';
    const { conBroll } = discorso;
    p += `\n\n## MODALITÀ DISCORSO (regola di Denis: nella cartella c'è un solo video parlato)\nÈ un discorso di Denis da montare così com'è: NIENTE regia. Non togliere frasi per accorciare, non riordinare, non scegliere cosa tenere: la sequenza l'ha già decisa lo script (tutte le frasi in ordine, tolte solo pause, false partenze e ripetizioni) e nella regia va copiata identica:\n\`\`\`json\n"sequenza": ${JSON.stringify(discorso.sequenza)}\n\`\`\`\nIl tuo lavoro è SOLO la grafica dello stile (sezione Grafica): \`titolo\`, \`soggetto\`, \`copertina\`, \`enfasi\` se lo stile ha l'apertura a lettere enormi (sulle prime parole del discorso), le \`keywords\` con le regole dello stile e, se lo stile ha il bianco e nero nei momenti, \`"bn": true\` su qualche elemento della sequenza${stileSuMisura?.grafica.fumo || stileSuMisura?.grafica.stock ? '; se la sezione Grafica li prevede, puoi aggiungere agli elementi anche `fumo`, `stock` e `inserto` (sempre con la stessa `frase`)' : ''}. ${scritte} ${conBroll ? 'Nella cartella ci sono anche dei B-roll di Denis (vedi Sorgenti e fogli provino): mettili sopra la voce aggiungendo all\'elemento `"broll": "<id>", "da": <secondi>` (stessa `frase`), dove mostrano quello che dice in quel momento, circa uno ogni 8–12 s, mai sull\'aggancio né sulla chiusura: usali TUTTI almeno una volta (anche le registrazioni dello schermo e le immagini, come `inserto`). Le regole sui B-roll valgono (niente bocca che parla, non riusare lo stesso momento); ignora quelle su durata, scaletta e scelta delle frasi.' : 'Ignora le regole su durata, scaletta, inquadrature e B-roll.'} \`scaletta\` = i 3–6 temi del discorso, \`testo_montato\` vuoto.`;
  }
  // discorso: fogli provino solo dei B-roll, se ci sono
  const fogliDaLeggere = !discorso || discorso.conBroll;
  p += modo === 'claude'
    ? `\n\n## Come consegnare\n${!fogliDaLeggere ? 'Scrivi' : 'Leggi i fogli provino con lo strumento Read, tutti nello stesso turno (letture in parallelo), poi scrivi'} la regia con lo strumento Write in \`work/regia.json\` e rispondi con 3 righe di riepilogo.`
    : `\n\n## Come consegnare\n${!fogliDaLeggere ? '' : 'I fogli provino sono allegati in ordine, ognuno preceduto dal suo nome. '}Rispondi SOLO con il JSON della regia.`;
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
        // discorso: la sequenza è fissa (la decide lo script), una rilettura sprecherebbe una richiesta
        const problemi = discorso ? [] : difetti(risultato);
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
// stanno su Drive in "12 · Risorse/Stili/<nome>/" (DIR_STILI: stile.txt, esempi/, asset/):
// uno stile nuovo si costruisce da lì e si aggiunge qui, in Root.tsx e in scripts/stili/<nome>.md
// (le istruzioni di grafica per l'AI, inserite nel prompt al posto di {{GRAFICA}}).
// Gli altri stili sono "su misura": una cartella su Drive in DIR_STILI con stile.txt e asset/,
// renderizzata dalla composizione SuMisura (scripts/stile-su-misura.mjs, src/SuMisura.tsx).
const STILI = ['Blueprint', 'Cinematico'];
let stileCorrente = STILI[0];
let stileSuMisura = null; // { nome, grafica, testoAI, avvisi }
let LUT_STILE = null;     // LUT creativa dello stile su misura
// look 12K (Look: teal e arancio): esposizione misurata pezzo per pezzo + lut/12k.cube + nitidezza
let LOOK_12K = false;
// look fatto in ffmpeg al taglio dei pezzi ("Look: chiaro caldo"): { esposizione, filtro }
let LOOK_STILE = null;
const NITIDEZZA_12K = 0.5;
const normNome = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
function scegliStile(brief) {
  const richiesto = (/stile\s*:\s*([^\n.,;]+)/i.exec(brief || '') || [])[1]?.trim();
  stileSuMisura = null;
  LUT_STILE = null;
  LOOK_12K = false;
  LOOK_STILE = null;
  if (!richiesto) return { stile: STILI[0] };
  const trovato = STILI.find((x) => x.toLowerCase() === richiesto.toLowerCase());
  if (trovato) return { stile: trovato };
  try {
    const cartelle = JSON.parse(rclone('lsjson', remote(DIR_STILI), '--dirs-only')).map((d) => d.Name).filter((d) => !d.startsWith('_'));
    const nome = cartelle.find((d) => normNome(d) === normNome(richiesto));
    if (nome) {
      caricaStile(nome);
      return { stile: 'SuMisura', avviso: stileSuMisura.avvisi.join(' · ') || undefined };
    }
  } catch (e) { log('stili su Drive non leggibili', e.message); }
  return { stile: STILI[0], avviso: `lo stile "${richiesto}" non esiste in ${DIR_STILI}: ho usato ${STILI[0]}` };
}

// scarica da Drive stile.txt e asset/ (niente video di esempio), legge la grafica e prepara
// font, musica e LUT in public/stili/<nome>/ per il render
function caricaStile(nome) {
  const dir = path.join(WORK, 'stile');
  const pub = path.join(ROOT, 'public', 'stili', 'corrente');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(pub, { recursive: true, force: true });
  fs.mkdirSync(pub, { recursive: true });
  rclone('copy', remote(DIR_STILI, nome), dir, '--exclude', 'esempi/**', '--exclude', '*.{mp4,MP4,mov,MOV,m4v,webm,insv}', '--max-size', '80M');
  const tutti = [];
  const giro = (d) => { for (const x of fs.existsSync(d) ? fs.readdirSync(d) : []) { const p = path.join(d, x); if (fs.statSync(p).isDirectory()) giro(p); else tutti.push(p); } };
  giro(dir);
  const txt = tutti.find((p) => /^stile\.txt$/i.test(path.basename(p)));
  const avvisi = [];
  if (!txt) avvisi.push(`stile ${nome}: manca stile.txt, uso le impostazioni base (copia quello del modello)`);
  const { grafica, testoAI, musica, volumeMusica } = leggiStile(txt ? fs.readFileSync(txt, 'utf8') : '', nome);
  // font: file in asset/ con il nome indicato, altrimenti Google Fonts
  const fileFont = tutti.filter((p) => /\.(ttf|otf|woff2?)$/i.test(p));
  for (const k of ['fontApertura', 'fontSottotitoli', 'fontTitoli']) {
    const ft = grafica[k];
    const file = fileFont.find((p) => normNome(path.parse(p).name).replace(/[-_ ]/g, '') === normNome(ft.famiglia).replace(/[-_ ]/g, ''))
      || fileFont.find((p) => normNome(path.parse(p).name).replace(/[-_ ]/g, '').startsWith(normNome(ft.famiglia).replace(/[-_ ]/g, '')));
    if (file) {
      const dest = `font-${path.basename(file).replace(/[^\w.-]+/g, '_')}`;
      fs.copyFileSync(file, path.join(pub, dest));
      ft.file = `stili/corrente/${dest}`;
    }
  }
  // musica: un brano a caso tra quelli in asset/, o quello indicato
  const brani = tutti.filter((p) => /\.(mp3|m4a|aac|wav|ogg)$/i.test(p));
  if (musica) {
    const scelto = musica === '*' ? brani[Math.floor(Math.random() * brani.length)] : brani.find((p) => normNome(path.basename(p)).includes(normNome(musica)));
    if (scelto) {
      const dest = `musica${path.extname(scelto).toLowerCase()}`;
      fs.copyFileSync(scelto, path.join(pub, dest));
      grafica.musica = { file: `stili/corrente/${dest}`, volume: volumeMusica };
      log(`stile ${nome}: musica ${path.basename(scelto)}`);
    } else avvisi.push(`stile ${nome}: musica richiesta ma nessun brano in asset/`);
  }
  // LUT: quella in asset/ dello stile; con "Look: teal e arancio" il look 12K del repo (lut/12k.cube,
  // scripts/look/lut12k.py) con l'esposizione adattata a ogni pezzo
  const lutAsset = tutti.find((p) => /\.cube$/i.test(p));
  LOOK_12K = !lutAsset && grafica.look === 'teal';
  const lut = lutAsset || (LOOK_12K ? path.join(ROOT, 'lut', '12k.cube') : null);
  if (lut) { LUT_STILE = lut; log(`stile ${nome}: LUT ${path.basename(lut)}${LOOK_12K ? ' (look 12K: esposizione per pezzo e nitidezza)' : ''}`); }
  LOOK_STILE = LOOK_FFMPEG[grafica.look] || null;
  if (LOOK_STILE) log(`stile ${nome}: look ${grafica.look} (volto ben esposto pezzo per pezzo, ${LOOK_STILE.filtro})`);
  stileSuMisura = { nome: grafica.nome || nome, grafica, testoAI, avvisi };
  log(`stile su misura ${nome}: ${JSON.stringify(grafica)}`);
}

// Remotion scrive la matrice BT.709 ma lascia "sconosciuti" primari e curva: si dichiarano tutti
// (flusso h264 e atomo colr dell'mp4) senza ricodificare, così Instagram non deve indovinarli
function dichiaraColori(file) {
  const tmp = file.replace(/(\.mp4)?$/i, '.colori.mp4');
  try {
    run('ffmpeg', ['-y', '-v', 'error', '-i', file, '-map', '0', '-c', 'copy',
      '-bsf:v', 'h264_metadata=video_full_range_flag=0:colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1',
      ...TAG_709, '-movflags', '+faststart+write_colr', tmp]);
    fs.renameSync(tmp, file);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    log('metadati colore non scritti (il video resta com\'è)', e.message.split('\n')[0]);
  }
}

function renderizza(out, stile = STILI[0]) {
  // Il primo render a volte fallisce per un errore transitorio del compositor
  // (visto nel test del 16/10): fino a 3 tentativi.
  for (let tentativo = 1; ; tentativo++) {
    try {
      // 1080×1920 a ~15 Mbps: il formato che TikTok/Instagram caricano meglio (meglio di un 4K pesante).
      // Fotogrammi PNG (senza perdite: col JPEG 80 di default si perdeva dettaglio nelle ombre) e
      // colori BT.709 a gamma limitata: prima usciva "yuvj420p" BT.601 a gamma piena, che app e
      // lettori possono leggere con neri grigi o colori spostati (prova del 20/10: col JPEG 100 +
      // BT.709 Remotion sbaglia i colori, col PNG sono esatti)
      run('npx', ['remotion', 'render', 'src/index.ts', stile, out, `--props=${path.join(WORK, 'piano.json')}`,
        '--codec=h264', '--video-bitrate=15M', '--max-rate=16M', '--buffer-size=32M', '--audio-bitrate=320k', '--concurrency=100%',
        '--image-format=png', '--color-space=bt709',
        // browser già installato (es. Chrome sul PC) invece di quello che Remotion scarica
        ...(process.env.REMOTION_BROWSER ? [`--browser-executable=${process.env.REMOTION_BROWSER}`] : [])],
      { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
      dichiaraColori(out);
      return;
    } catch (e) {
      if (tentativo >= 3) throw e;
      log(`render fallito (tentativo ${tentativo}), riprovo`);
    }
  }
}

// ---------- copertina per Reel e TikTok ----------
// Un fotogramma pulito (dai pezzi già tagliati e colorati, senza scritte) di un'inquadratura con la
// voce principale, il più nitido tra alcuni candidati, e il titolo che l'AI ha scritto in `copertina`
// (senza: il titolo del video), nei font e colori dello stile (src/Copertina.tsx). Restituisce il jpg
function nitidezza(file) {
  try {
    const r = spawnSync('ffmpeg', ['-v', 'info', '-i', file, '-vf', 'scale=540:-2,blurdetect', '-f', 'null', '-'], { encoding: 'utf8' });
    const m = /blur mean:\s*([\d.]+)/.exec(r.stderr || '');
    return m ? Number(m[1]) : 99;
  } catch { return 99; }
}
function copertina(piano, regia, analisi, out) {
  try {
    const voci = new Set(analisi.sorgenti.filter((x) => x.principale || x.sync).map((x) => x.id));
    let t = 0;
    const pezzi = piano.clips.map((c) => { const p = { c, da: t }; t += c.end - c.start; return p; })
      .filter(({ c }) => voci.has(c.sorgente) && !c.inserto && c.end - c.start >= 0.6);
    if (!pezzi.length) return null;
    // fino a 6 inquadrature sparse sul video, tre fotogrammi ciascuna: vince il meno mosso
    const scelti = pezzi.length <= 6 ? pezzi : Array.from({ length: 6 }, (_, i) => pezzi[Math.round((i * (pezzi.length - 1)) / 5)]);
    const dir = path.join(WORK, 'copertina');
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    let migliore = null;
    scelti.forEach(({ c }, i) => [0.3, 0.5, 0.7].forEach((q, j) => {
      const jpg = path.join(dir, `${i}-${j}.jpg`);
      run('ffmpeg', ['-y', '-v', 'error', '-ss', ((c.end - c.start) * q).toFixed(2), '-i', path.join(MEDIA, c.file), '-frames:v', '1', '-q:v', '2', jpg]);
      const b = nitidezza(jpg);
      if (!migliore || b < migliore.b) migliore = { jpg, b };
    }));
    fs.copyFileSync(migliore.jpg, path.join(MEDIA, 'copertina-sfondo.jpg'));
    const cop = regia.copertina && typeof regia.copertina === 'object' ? regia.copertina : {};
    const testo = String(cop.testo || piano.titolo || '').trim().slice(0, 60);
    const props = { sfondo: 'media/copertina-sfondo.jpg', testo, evidenzia: [].concat(cop.evidenzia || []).map(String).slice(0, 3), grafica: piano.grafica || null };
    fs.writeFileSync(path.join(WORK, 'copertina.json'), JSON.stringify(props));
    run('npx', ['remotion', 'still', 'src/index.ts', 'Copertina', out, `--props=${path.join(WORK, 'copertina.json')}`, '--image-format=jpeg', '--jpeg-quality=92',
      ...(process.env.REMOTION_BROWSER ? [`--browser-executable=${process.env.REMOTION_BROWSER}`] : [])], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
    log(`copertina: "${testo}" su un fotogramma di ${path.basename(migliore.jpg)} (sfocatura ${migliore.b.toFixed(2)})`);
    return out;
  } catch (e) { log('copertina non fatta', e.message); return null; }
}
// la copertina al bot (come foto e come file in qualità piena, per TikTok)
async function inviaCopertina(file, nome) {
  if (!process.env.NOTIFY_URL || !file) return;
  try {
    const form = new FormData();
    form.append('nome', nome);
    form.append('foto', new Blob([fs.readFileSync(file)], { type: 'image/jpeg' }), path.basename(file));
    const r = await fetchRiprova(process.env.NOTIFY_URL.replace(/\/notify$/, '/copertina'), { method: 'POST', headers: { 'x-regista-token': process.env.NOTIFY_TOKEN || '' }, body: form }, 2);
    log(`copertina al bot: ${r.status}`);
  } catch (e) { log('copertina non mandata al bot', e.message); }
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
      // tgFile: ci sono le chiavi per scaricare i video mandati in chat (il bot avvisa se mancano)
      // azione e prova: il bot sceglie la scheda giusta (video, render di prova, esempi, prova regia)
      body: JSON.stringify({ run_url: RUN_URL, run_id: process.env.GITHUB_RUN_ID, origine: SRC_DIR === OUT_DIR ? '98' : '97', richiesto: process.env.CARTELLA || '', tgFile: CHIAVI_TELEGRAM,
        azione: process.env.AZIONE || 'monta', ...(PROVA_SECONDI ? { prova: PROVA_SECONDI } : {}), ...payload }),
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

// 8 fotogrammi del finale in una griglia 4×2, in _regista, per controllarlo senza scaricarlo:
// l'apertura, il centro delle scritte grandi (si vede se passano dietro alla persona) e il resto
// distribuito sul video. Con tante scritte (discorso di 4–5 minuti) se ne prendono 7 sparse su
// tutta la durata, non le prime 7
function fotogrammiFinale(outFile, durata, piano) {
  const out = path.join(WORK, 'fotogrammi.jpg');
  const dir = path.join(WORK, 'fotogrammi');
  try {
    const scritte = (piano.keywords || []).map((k) => k.at + Math.min(1, k.dur * 0.6)).filter((t) => t < durata - 0.1);
    const sparse = scritte.length > 7 ? Array.from({ length: 7 }, (_, i) => scritte[Math.round((i * (scritte.length - 1)) / 6)]) : scritte;
    const tempi = [Math.min(1.2, durata / 2), ...sparse];
    for (let i = 0; i < 8 && tempi.length < 8; i++) {
      const t = (durata * (i + 0.5)) / 8;
      if (tempi.every((x) => Math.abs(x - t) > 1.5)) tempi.push(t);
    }
    const scelti = tempi.slice(0, 8).sort((a, b) => a - b);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    scelti.forEach((t, i) => run('ffmpeg', ['-y', '-v', 'error', '-ss', t.toFixed(2), '-i', outFile, '-frames:v', '1', '-vf', 'scale=360:-2', '-q:v', '4', path.join(dir, `${String(i).padStart(2, '0')}.jpg`)]));
    run('ffmpeg', ['-y', '-v', 'error', '-i', path.join(dir, '%02d.jpg'), '-vf', `tile=4x${Math.ceil(scelti.length / 4)}`, '-frames:v', '1', '-q:v', '4', out]);
    return out;
  } catch (e) { log('fotogrammi del finale non riusciti', e.message); return null; }
}

// il fotogramma di copertina: a metà della prima parola chiave (o a 1/3 del video); serve anche
// come copertina del Reel quando si pubblica dal bot
const tempoCopertina = (piano, durata) => {
  const k = piano.keywords?.[0];
  return k ? Math.min(durata - 0.1, k.at + Math.min(1, k.dur / 2)) : durata / 3;
};

function anteprima(outFile, piano, durata) {
  const t = tempoCopertina(piano, durata);
  const jpg = path.join(WORK, 'anteprima.jpg');
  try {
    run('ffmpeg', ['-y', '-v', 'error', '-ss', String(t), '-i', outFile, '-frames:v', '1', '-vf', 'scale=540:-2', '-q:v', '4', jpg]);
    return fs.readFileSync(jpg).toString('base64');
  } catch { return undefined; }
}

// ---------- didascalie per i social (tasto 📤 Pubblica del bot) ----------
// Una chiamata breve a Gemini sul testo montato: didascalia di Instagram e titolo/descrizione
// per YouTube, nella voce di Denis. Senza Gemini (o se non risponde) niente didascalie: il bot
// le fa scrivere a mano prima di pubblicare.
const PROMPT_DIDASCALIE = `Scrivi i testi per pubblicare questo video verticale di Denis, creator italiano che parla di prodotti e della sua vita.
Rispondi SOLO con JSON: {"instagram": "...", "youtube_titolo": "...", "youtube_descrizione": "..."}

Regole:
- Italiano, in prima persona come se scrivesse Denis; mai "Denis" in terza persona.
- Solo cose dette nel video o scritte nel brief: niente prezzi, dati tecnici o giudizi inventati. Se dà un giudizio, usa le sue parole.
- instagram: prima riga = gancio breve (massimo 70 caratteri) che fa fermare chi scorre; poi 1–3 righe brevi su cosa si vede e cosa ne pensa; poi una riga vuota e 4–6 hashtag pertinenti (soprattutto italiani). Al massimo 3 emoji. Niente link, niente "link in bio".
- Se il brief parla di sponsor o collaborazione pagata: "#adv" all'inizio della prima riga.
- youtube_titolo: massimo 70 caratteri, chiaro e cercabile (prodotto + cosa succede), senza hashtag.
- youtube_descrizione: 2–3 righe, poi 3 hashtag tra cui #shorts.`;

async function scriviDidascalie({ titolo, testo, brief, keywords }) {
  if (!process.env.GEMINI_API_KEY || !testo) return null;
  const headers = { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY };
  const dati = [`Titolo del video: ${titolo}`, `Testo detto nel video (montato): ${testo}`, `Scritte a schermo: ${keywords.join(' · ') || '—'}`, `Brief: ${brief || '—'}`].join('\n');
  const body = JSON.stringify({ contents: [{ role: 'user', parts: [{ text: `${PROMPT_DIDASCALIE}\n\n${dati}` }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.7 } });
  for (const modello of await modelliGemini(headers)) {
    const esito = await chiamaGemini(modello, body, headers);
    if (!esito.risposta) { log(`didascalie: ${modello} ${esito.motivo}`); continue; }
    try {
      const j = await esito.risposta.json();
      const d = JSON.parse((j.candidates?.[0]?.content?.parts || []).map((x) => x.text || '').join('').replace(/^```(?:json)?\s*|\s*```$/g, ''));
      const testoDi = (x, max) => String(x || '').trim().slice(0, max);
      const out = { instagram: testoDi(d.instagram, 2200), youtube_titolo: testoDi(d.youtube_titolo, 100), youtube_descrizione: testoDi(d.youtube_descrizione, 4000) };
      if (out.instagram) return out;
    } catch (e) { log(`didascalie: risposta di ${modello} non usabile`, e.message); }
  }
  return null;
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
// fps del video finito: quelli della camera principale (la voce), altrimenti del girato più lungo.
// 23,98 → 24 (la differenza è un fotogramma ogni 40 s), 50 → 25 e 60 → 30 (uno sì e uno no, fluido).
// A 30 fps fissi la Sony a 23,98 (980, 20/10) ripeteva un fotogramma ogni quattro: movimenti a scatti
export function fpsVideo(sorgenti) {
  const video = sorgenti.filter((s) => s.tipo === 'video' && s.fps > 0);
  const base = video.some((s) => s.principale) ? video.filter((s) => s.principale) : video;
  const durata = new Map();
  for (const s of base) {
    const n = s.fps < 24.5 ? 24 : s.fps < 26 ? 25 : s.fps < 48 ? 30 : s.fps < 55 ? 25 : 30;
    durata.set(n, (durata.get(n) || 0) + (s.durata || 1));
  }
  return [...durata.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 30;
}

export async function analizza(nome, brief, cache) {
  const parolePrecedenti = (file) => (file ? (cache?.sorgenti || cache?.video || []).find((v) => v.file === file || v.voce === file)?.parole : undefined);
  const sorgenti = [];
  const foto = [];
  const idUsati = new Set();
  const logRiconosciuti = [], logScuri = []; // clip I-Log riconosciute dai colori, clip I-Log sottoesposte
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
      // I-Log (Insta360) e HDR: conversione tecnica a Rec.709 (scripts/colore.mjs)
      const lg = riconosciLog(src, info, disp, brief || '', WORK);
      const iLog = lg.iLog;
      if (lg.riconosciuto) {
        logRiconosciuti.push(id);
        log(`  ${id}: 10 bit e colori spenti (saturazione ${lg.sat.toFixed(1)}): la tratto come I-Log`);
      }
      const hdr = !iLog && HDR.includes(info.colore?.trc);
      log(`video ${f} (${NOMI_DISPOSITIVO[disp]}, ${info.durata.toFixed(1)} s, ${info.w}x${info.h}, ${info.fps} fps${iLog ? ', I-Log → Rec709' : hdr ? ', HDR → SDR' : ''})`);
      if (disp === 'insta') log(`  ${id}: colore ${JSON.stringify(info.colore)} · metadati ${JSON.stringify(info.tags).slice(0, 800)}`);
      if (iLog) {
        if (lg.scuro) logScuri.push(id);
        if (lg.luce !== null) log(`  ${id}: luminosità dopo la LUT ${lg.luce.toFixed(2)}${info.colore.alza ? `, schiarita a ${info.colore.alza.a}` : ''}`);
        confrontoColore(src, id, info.durata, info.colore);
      }
      // `file` è il nome logico usato dalla regia; i pezzi veri si tagliano dall'originale dopo la regia
      // registrazione dello schermo (nome tipico o formato da telefono più stretto di 9:16): ottima come inserto
      const schermo = /screen|registraz|rpreplay|schermo|scherm/i.test(f) || (info.h > info.w && info.w / info.h < 0.5);
      sorgenti.push({ id, file: `${id}.mp4`, originale: src, tipo: 'video', dispositivo: disp, nomeDispositivo: NOMI_DISPOSITIVO[disp],
        durata: +info.durata.toFixed(2), orient: info.w > info.h ? 'h' : 'v', haAudio: info.audio, colore: info.colore, data: dataRipresa(info.tags, f), fps: info.fps,
        ...(schermo ? { schermo: true } : {}) });
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
  // registrazioni dello schermo e video scaricati (TikTok salva col nome "v12044g…"): mai voce.
  // Beats pokemon, 22/10: Whisper aveva "sentito" un "Grazie a tutti" sulla musica della
  // registrazione dello schermo, diventata seconda voce: niente discorso e B-roll scelti a caso
  const altriVideo = sorgenti.filter((x) => x.tipo === 'video' && !x.schermo).length > 0;
  for (const s of sorgenti.filter((x) => x.tipo === 'video')) {
    const perche = s.schermo && altriVideo ? 'registrazione dello schermo'
      : /^v\d{5}g[a-z0-9]{16,}$/i.test(s.id) ? 'video scaricato da TikTok'
      : /tik ?tok|reel|export|montat|hq.?grade/i.test(s.id) ? 'video già montato'
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
    return { cartella: nome, brief, sorgenti, frasi: cache.frasi, foto, fps: fpsVideo(sorgenti) };
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
      if (!p.principale) continue; // voce scartata (niente parole): non aggancia più nessuno
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
  for (let k = 0; k < principali.length; k++) {
    const p = principali[k];
    if (!p.voce) { p.voce = `${p.id}.voce.wav`; estraiVoce(p.originale, path.join(MEDIA, p.voce)); }
    let parole = parolePrecedenti(p.file) || parolePrecedenti(p.voce);
    if (!parole && process.env.GROQ_API_KEY) {
      parole = await trascrivi(path.join(MEDIA, p.voce), 'it', nomiDelBrief(brief));
      consumi.groqSec += p.durata;
    }
    p.parole = correggiNomi(parole || [], nomiDelBrief(brief));
    // vento, musica, rumore scambiati per voce: meno di 10 parole al minuto = B-roll
    if (p.parole.length < Math.max(3, (p.durata / 60) * 10)) {
      log(`${p.id}: quasi nessuna parola trascritta (${p.parole.length}), la tratto come B-roll`);
      p.principale = false; p.parlato = false; p.parole = [];
      // chi era agganciato a questa "voce" torna in gioco e può essere la voce vera (980, 19/10:
      // la clip parlata Ak980 agganciata per sbaglio a una ripresa col solo rumore della tastiera,
      // scartata quella, restava senza trascrizione e il montaggio usava solo 22 s di parlato)
      for (const s of sorgenti.filter((x) => x.sync?.con === p.id)) {
        delete s.sync;
        if (s.parlato && !prova(s)) { s.principale = true; principali.push(s); log(`${s.id}: diventa voce principale`); }
      }
      continue;
    }
    for (const f of frasi(p.parole, db.get(p.id), p.durata, DISCORSO ? { pausaMax: 0.5 } : {})) tutteFrasi.push({ ...f, principale: p.id });
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

  // fogli provino: per le camere sincronizzate i tempi scritti sono quelli della voce. Nel discorso
  // non servono (niente scelte di inquadrature): su 4–5 minuti di girato si risparmia tempo
  const senzaFogli = DISCORSO && tutteFrasi.length >= 3;
  for (const s of sorgenti.filter((x) => x.tipo === 'video')) {
    if (senzaFogli) { s.fogli = []; continue; }
    const fp = fogliProvino(s.originale, s.id, s.durata, s.sync ? s.sync.offset : 0, s.colore);
    s.fogli = fp.fogli; s.passoFogli = fp.passo;
  }
  // camere con audio muto e non sincronizzate: Denis deve saperlo (di solito un
  // ricevitore wireless collegato alla presa microfono ma spento, che esclude il microfono interno)
  const avvisi = sorgenti.filter((s) => s.provataVisiva).map((s) => s.sync
    ? `${s.id} (${s.nomeDispositivo}) ha registrato solo fruscio (microfono collegato ma spento?): l'ho agganciata dalle immagini. Se il labiale non torna, dimmelo.`
    : `${s.id} (${s.nomeDispositivo}) ha registrato solo fruscio, senza voce (microfono collegato ma spento?) e non sono riuscito ad agganciarla nemmeno dalle immagini: l'ho usata solo come B-roll. Lascia acceso il microfono della camera, anche quello interno basta.`);
  if (logRiconosciuti.length) avvisi.push(`${logRiconosciuti.join(', ')}: riconosciut${logRiconosciuti.length > 1 ? 'e' : 'a'} come I-Log (10 bit, colori spenti) e convertit${logRiconosciuti.length > 1 ? 'e' : 'a'} con la LUT Insta360. Se non era in I-Log scrivi "senza i-Log" nel brief.`);
  if (logScuri.length) avvisi.push(`${logScuri.join(', ')}: molto scur${logScuri.length > 1 ? 'e' : 'a'} anche dopo la LUT, ho schiarito il possibile. In I-Log con poca luce meglio aggiungere luce o esporre +0,7 EV.`);
  if (/\bi-?log\b/i.test(brief || '') && !/\b(senza|no)\s+i-?log\b/i.test(brief || '') && !sorgenti.some((s) => s.colore?.log)) {
    avvisi.push('nel brief c\'è "i-Log" ma nessuna clip è riconosciuta come Insta360: colori lasciati come sono');
  }
  return { cartella: nome, brief, sorgenti, frasi: tutteFrasi, foto, avvisi, fps: fpsVideo(sorgenti) };
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
  // un solo video (discorso): come nel montaggio vero, sequenza fissa e l'AI sceglie solo le scritte
  DISCORSO = modoDiscorso(analisi.sorgenti.filter((s) => s.tipo === 'video').length, analisi.brief) && analisi.frasi.length >= 3;
  if (DISCORSO) preparaDiscorso(analisi);
  const testoMateriale = `${materialePerAI(analisi)}\n\n(Prova veloce: i fogli provino non sono inclusi, scegli le inquadrature solo in base alle sorgenti.)`;
  await fase(nome, `📝 Prova della regia${discorso ? ' del discorso' : ''}: solo il testo, senza render`, 'regia');
  const { regia, risultato: { piano, avvisi } } = await chiediRegia(testoMateriale, [], null, (r) => risolviRegia(perRegia(r), analisi));
  if (discorso) Object.assign(regia, { sequenza: conSequenza(regia).sequenza, discorso: true });
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
  await notifica('📝 prova regia', nome, testo, { ok: true });
}

// azione "esempi": fogli di fotogrammi dei video di riferimento di uno stile (CARTELLA = nome dello
// stile), salvati su Drive in Stili/<nome>/esempi/_analisi: leggeri, così Claude li studia tutti
// (il collegamento a Drive da cui lavora Claude non scarica video oltre ~5 MB)
async function analizzaEsempi() {
  const nome = process.env.CARTELLA;
  const dir = path.join(WORK, 'esempi');
  const out = path.join(WORK, 'analisi');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  rclone('copy', remote(DIR_STILI, nome), dir, '--include', '*.{mp4,MP4,mov,MOV,m4v,webm}', '--exclude', '_analisi/**');
  const video = [];
  const giro = (d) => { for (const x of fs.existsSync(d) ? fs.readdirSync(d) : []) { const p = path.join(d, x); if (fs.statSync(p).isDirectory()) giro(p); else video.push(p); } };
  giro(dir);
  if (!video.length) throw new Error(`nessun video di esempio in ${DIR_STILI}/${nome}`);
  const righe = [];
  for (const [i, v] of video.entries()) {
    const info = probe(v);
    const base = `es${i + 1}`;
    // tutto il video: 24 fotogrammi; l'apertura: i primi 6 s, un fotogramma ogni 0,5 s a risoluzione piena
    run('ffmpeg', ['-y', '-v', 'error', '-i', v, '-vf', `fps=${(24 / Math.max(1, info.durata)).toFixed(4)},scale=216:-2,tile=6x4`, '-frames:v', '1', '-q:v', '4', path.join(out, `${base}-tutto.jpg`)]);
    run('ffmpeg', ['-y', '-v', 'error', '-t', '6', '-i', v, '-vf', 'fps=2,scale=360:-2,tile=6x2', '-frames:v', '1', '-q:v', '4', path.join(out, `${base}-apertura.jpg`)]);
    // fotogrammi singoli lungo il video (scritte, inserti, colore) e un ritaglio al centro a
    // risoluzione nativa (nitidezza, grana: stili "di qualità" come 12K Quality, 19/10)
    for (const q of [0.15, 0.3, 0.5, 0.7, 0.85]) run('ffmpeg', ['-y', '-v', 'error', '-ss', (info.durata * q).toFixed(2), '-i', v, '-frames:v', '1', '-vf', 'scale=540:-2', '-q:v', '2', path.join(out, `${base}-${Math.round(q * 100)}.jpg`)]);
    run('ffmpeg', ['-y', '-v', 'error', '-ss', (info.durata * 0.5).toFixed(2), '-i', v, '-frames:v', '1', '-vf', 'crop=min(iw\\,720):min(ih\\,720)', '-q:v', '2', path.join(out, `${base}-dettaglio.jpg`)]);
    // copia piccola (432 px, ~3 MB al minuto al massimo) da studiare fotogramma per fotogramma: il
    // collegamento a Drive di Claude non scarica file oltre ~5 MB (stile Esplicativo, 19/10)
    run('ffmpeg', ['-y', '-v', 'error', '-i', v, '-vf', 'scale=432:-2', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30', '-maxrate', '400k', '-bufsize', '800k',
      '-c:a', 'aac', '-b:a', '48k', '-movflags', '+faststart', path.join(out, `${base}-piccolo.mp4`)]);
    // il parlato con i tempi delle parole: come spiegano e quanto in fretta (lingua riconosciuta da sola)
    let parlato = '';
    if (info.audio && process.env.GROQ_API_KEY) {
      try {
        const parole = await trascrivi(v, null);
        fs.writeFileSync(path.join(out, `${base}-parlato.txt`), parole.map((p) => `${p.s.toFixed(2)}–${p.e.toFixed(2)}\t${p.w.trim()}`).join('\n'));
        const tempo = parole.length ? parole.at(-1).e - parole[0].s : 0;
        parlato = ` · parlato: ${parole.length} parole${tempo ? ` (${(parole.length / tempo).toFixed(1)} al secondo)` : ''}`;
      } catch (e) { log('parlato non trascritto', e.message); }
    }
    // ritmo: cambi di inquadratura (scene change) e durata media delle inquadrature
    let tagli = [];
    try {
      const tmp = path.join(WORK, 'tagli.txt');
      fs.rmSync(tmp, { force: true });
      run('ffmpeg', ['-y', '-v', 'error', '-i', v, '-vf', `scale=320:-2,select='gt(scene,0.3)',metadata=print:file='${perFiltro(tmp)}'`, '-an', '-f', 'null', '-']);
      tagli = [...fs.readFileSync(tmp, 'utf8').matchAll(/pts_time:([\d.]+)/g)].map((m) => Number(m[1]));
    } catch (e) { log('tagli non rilevati', e.message); }
    const c = probe(v).colore || {};
    righe.push(`${base}: ${path.basename(v)} · ${info.durata.toFixed(1)} s · ${info.w}x${info.h} · ${c.pix || '?'} ${c.trc || ''}${info.audio ? ' · audio' : ''}`
      + ` · ${tagli.length} tagli (inquadratura media ${(info.durata / (tagli.length + 1)).toFixed(2)} s): ${tagli.map((t) => t.toFixed(1)).join(' ')}${parlato}`);
  }
  fs.writeFileSync(path.join(out, 'indice.txt'), righe.join('\n'));
  rclone('copy', out, remote(DIR_STILI, nome, 'esempi', '_analisi'));
  let link = '';
  try {
    const id = JSON.parse(rclone('lsjson', remote(DIR_STILI, nome, 'esempi'), '--dirs-only')).find((d) => d.Name === '_analisi')?.ID;
    if (id) link = `https://drive.google.com/drive/folders/${id}`;
  } catch (e) { log('cartella _analisi senza ID', e.message); }
  await notifica('🔎 esempi analizzati', nome, `${video.length} video di riferimento: fogli di fotogrammi in Stili/${nome}/esempi/_analisi.\n${righe.join('\n')}`,
    { ok: true, info: { esempi: video.length, link } });
}

async function main() {
  if (process.env.AZIONE === 'esempi') {
    return analizzaEsempi().catch(async (e) => {
      log(e.stack || e.message);
      await notifica('⚠️ analisi esempi', process.env.CARTELLA || '—', `Errore: ${e.message}`);
      process.exitCode = 1;
    });
  }
  if (process.env.AZIONE === 'regia') {
    return provaRegia().catch(async (e) => {
      log(e.stack || e.message);
      await notifica('⚠️ prova regia', process.env.CARTELLA || '—', `Errore: ${e.message}`);
      process.exitCode = 1;
    });
  }
  try { job = trovaCartella() || {}; } catch (e) {
    log(e.stack || e.message);
    await notifica('⚠️ non montato', process.env.CARTELLA || '—', `Errore: ${e.message}`);
    process.exitCode = 1;
    return;
  }
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
      if (!CHIAVI_TELEGRAM) throw new Error(`i video mandati in chat non sono ancora attivi: servono i secret TG_API_ID, TG_API_HASH e TELEGRAM_BOT_TOKEN su GitHub (vedi la Guida del bot). Intanto carica i file su Drive in ${IN_DIR}.`);
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
        '--exclude', '*.XML', '--exclude', '*.xml', '--exclude', '*FINALE*', '--exclude', '* - PROVA *', '--exclude', '_VAI_*', '--exclude', '*.txt');
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
    const brief = unisciBrief(briefFile, process.env.BRIEF_EXTRA, CORREZIONE || RIRENDER ? cache?.brief : '');
    const videoInCartella = fs.readdirSync(SCARICO).filter((f) => VIDEO_EXT.includes(path.extname(f).toLowerCase()) && !isNostro(f));
    DISCORSO = modoDiscorso(videoInCartella.length, brief);
    discorso = null;
    if (DISCORSO) log(`modalità discorso: ${videoInCartella.length === 1 ? 'un solo video in cartella' : 'chiesta nel brief'} (niente regia, solo pulizia e stile)`);
    const analisi = await analizza(nome, brief, cache);
    const { immagini, foglio: foglioImmagini } = preparaImmagini(analisi.foto || []);
    analisi.immagini = immagini;
    analisiCorrente = analisi;
    analisi.foglioImmagini = foglioImmagini;
    fs.writeFileSync(path.join(WORK, 'materiale.json'), JSON.stringify(analisi, null, 1));
    const testoMateriale = materialePerAI(analisi);
    fs.writeFileSync(path.join(WORK, 'materiale.md'), testoMateriale);
    const fogli = [...analisi.sorgenti.flatMap((s) => s.fogli || []), ...(analisi.foglioImmagini ? [analisi.foglioImmagini] : [])];

    const sinc = analisi.sorgenti.filter((s) => s.sync).length;
    const voci = analisi.sorgenti.filter((s) => s.principale).map((s) => `${s.id} (${s.nomeDispositivo})`).join(', ');
    const stima = stimaToken(fs.readFileSync(path.join(ROOT, 'scripts', 'prompt-regista.md'), 'utf8') + testoMateriale, fogli);
    consumi.stima = { totale: stima.totale, esatta: false };
    log(`stima materiale per l'AI: ${stima.testo} token di testo + ${stima.immagini} di immagini (${fogli.length} fogli)`);
    // lo stile chiesto al bot (input brief) vale più di quello scritto in brief.txt o nel giro precedente
    const { stile, avviso: avvisoStile } = scegliStile([process.env.BRIEF_EXTRA || '', brief].join('\n'));
    stileCorrente = stile;
    if (stile !== STILI[0]) log(`stile: ${stile}`);
    const pesoAI = ` · materiale ≈ ${kTok(stima.totale)} token`;
    // modalità discorso: la sequenza la decide lo script (tutte le frasi in ordine, tolte solo false
    // partenze e ripetizioni); l'AI sceglie solo le scritte dello stile. Se il video non ha parlato
    // (un solo video di sole riprese) si torna alla regia normale
    if (DISCORSO && analisi.frasi.length < 3) { DISCORSO = false; log('un solo video ma quasi senza parlato: regia normale'); }
    if (!DISCORSO && analisi.frasi.length >= 3 && discorsoConBroll(analisi.sorgenti, brief)) {
      DISCORSO = true;
      log('modalità discorso: un solo video parlato, gli altri sono B-roll (tutto il parlato, B-roll sopra la voce)');
    }
    // nel discorso l'AI vede solo i fogli dei B-roll (le inquadrature della voce non si scelgono)
    const fogliDiscorso = analisi.sorgenti.filter((s) => !s.principale).flatMap((s) => s.fogli || []);
    const nuovaRegia = !(RIRENDER && regiaPrecedente); // "Solo render" riusa la regia salvata
    if (DISCORSO && nuovaRegia && !CORREZIONE) {
      const d = preparaDiscorso(analisi), { durata } = d;
      log(`discorso: ${d.sequenza.length} frasi su ${analisi.frasi.length} (${durata.toFixed(0)} s)${d.tolte.length ? `, tolte ${d.tolte.map((x) => `${x.id} ${x.motivo}`).join(', ')}` : ''}`);
      await fase(nome, `🎙️ Discorso: tengo tutto il parlato in ordine (${d.sequenza.length} frasi, ${Math.round(durata)} s), tolgo pause e ripetizioni; l'AI sceglie solo le scritte`, 'regia');
    }
    if (RIRENDER) await fase(nome, regiaPrecedente ? '🎨 Rifaccio solo il render: stessa regia, colore e grafica aggiornati' : '⚠️ Nessuna regia precedente: la riscrivo', 'regia');
    else if (!discorso) await fase(nome, CORREZIONE ? `🧠 Applico la correzione: “${CORREZIONE.slice(0, 120)}”${pesoAI}`
      : `🧠 Scelgo i tagli: ${analisi.sorgenti.length} sorgenti, voce da ${voci || '—'}, ${sinc} camere sincronizzate, ${analisi.frasi.length} frasi${brief ? ', con brief' : ''}${pesoAI}`, 'regia');
    // azione "render": stessa regia del giro prima, si rifanno solo colore, tagli e grafica
    const { regia, risultato: primo } = !nuovaRegia
      ? (fs.writeFileSync(path.join(WORK, 'regia.json'), JSON.stringify(regiaPrecedente, null, 1)), { regia: regiaPrecedente, risultato: risolviRegia(perRegia(regiaPrecedente), analisi) })
      : await chiediRegia(testoMateriale, discorso ? fogliDiscorso : fogli, CORREZIONE ? regiaPrecedente : null, (r) => risolviRegia(perRegia(r), analisi)).catch((e) => {
        // discorso: senza AI il video esce lo stesso, con i sottotitoli dello stile ma senza scritte grandi
        if (!discorso) throw e;
        log(`regia del discorso senza AI (${e.message.split('\n')[0]}): niente scritte grandi`);
        const r = { titolo: nome, soggetto: '', sequenza: discorso.sequenza, keywords: [], flickers: [], note: 'scritte grandi non scelte: AI non disponibile', discorso: true };
        return { regia: r, risultato: risolviRegia(r, analisi) };
      });
    let { piano, avvisi } = primo;
    // B-roll di repertorio: si scaricano le ricerche dell'AI e si rifà il piano con quei video
    if (stileSuMisura?.grafica.stock && await scaricaStock(conSequenza(regia), analisi)) ({ piano, avvisi } = risolviRegia(perRegia(regia), analisi));
    // salvata con la sequenza vera: "Solo render" e "Correggi" ripartono da questa
    if (DISCORSO && nuovaRegia) { Object.assign(regia, { sequenza: conSequenza(regia).sequenza, discorso: true }); fs.writeFileSync(path.join(WORK, 'regia.json'), JSON.stringify(regia, null, 1)); }
    if (avvisi.length) log('avvisi regia:', avvisi.join(' | '));
    if (regia.scaletta) log('scaletta:', [].concat(regia.scaletta).join(' → '));
    log('testo montato:', piano.testo);
    if (avvisoStile) analisi.avvisi = [...(analisi.avvisi || []), avvisoStile];
    if (analisi.avvisi?.length) piano.note = [...analisi.avvisi.map((a) => `⚠️ ${a}`), piano.note].filter(Boolean).join(' · ');
    if (discorso) piano.note = [`🎙️ Discorso (un solo video): tenute tutte le ${discorso.sequenza.length} frasi in ordine${discorso.tolte.length ? `, tolte ${discorso.tolte.length} tra false partenze e ripetizioni` : ''}`, piano.note].filter(Boolean).join(' · ');
    // effetti sonori sotto la voce: più bassa la voce registrata, più bassi gli effetti (~12–16 dB sotto)
    const livelloVoce = Math.max(-60, ...analisi.sorgenti.filter((s) => s.principale && s.livello != null).map((s) => s.livello));
    piano.sfx = process.env.REGISTA_SFX === '0' ? false
      : { volume: +Math.min(0.6, Math.max(0.1, livelloVoce > -60 ? 10 ** ((livelloVoce + 2) / 20) : 0.25)).toFixed(3) };
    if (stileSuMisura) piano.grafica = stileSuMisura.grafica;
    piano.fps = analisi.fps || 30;
    if (piano.fps !== 30) log(`video a ${piano.fps} fps (come la camera principale)`);
    // b/n solo se lo stile lo prevede: con "Bianco e nero: no" (o uno stile pronto) i "bn" della regia
    // non valgono (12K Quality rifatto sulla regia del Narrativo, 19/10: un pezzo era uscito in b/n)
    if (!stileSuMisura || stileSuMisura.grafica.biancoNero === 'no') for (const c of piano.clips) delete c.bn;
    const nomeStile = stileSuMisura?.nome || stile;
    const durataPiano = piano.clips.reduce((s, c) => s + (c.end - c.start), 0);
    const camereUsate = new Set(piano.clips.map((c) => c.file)).size;
    await fase(nome, `🎬 Render: ${durataPiano.toFixed(0)} s, ${piano.clips.length} tagli da ${camereUsate} sorgenti, ${piano.keywords.length} parole chiave`, 'render');
    if (PROVA_SECONDI) { troncaPiano(piano, PROVA_SECONDI); log(`render di prova: primi ${PROVA_SECONDI} s (${piano.clips.length} tagli)`); }
    // solo adesso si ricodificano i pezzi scelti, poi gli originali non servono più
    tagliaSegmenti(piano, analisi);
    await risaltoPersona(piano);
    await ritagliPersona(piano);
    // prima di cancellarli, gli originali devono essere su Drive; se la copia fallisce il video si consegna lo stesso
    if (copiaOriginali) {
      try { await copiaOriginali; } catch (e) { avvisoOriginali = `⚠️ originali non copiati in ${IN_DIR}/${nome} (${e.message}): restano nella chat Telegram`; log(avvisoOriginali); }
    }
    fs.rmSync(SCARICO, { recursive: true, force: true });
    fs.writeFileSync(path.join(WORK, 'piano.json'), JSON.stringify(piano, null, 1));
    validaPiano(piano);

    // nome con versione: FINALE, FINALE v2, FINALE v3...
    const versioni = files.filter((f) => /FINALE( v\d+)?\.mp4$/i.test(f.Name)).length;
    const finale = PROVA_SECONDI ? `${nome} - PROVA ${PROVA_SECONDI}s ${nomeStile}.mp4` : `${nome} - FINALE${versioni ? ` v${versioni + 1}` : ''}.mp4`;
    const outFile = path.join(ROOT, 'out', finale);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    renderizza(outFile, stile);
    await fase(nome, '📤 Carico su Drive', 'carico');

    const durataN = probe(outFile).durata;
    const durata = durataN.toFixed(1);
    const note = [
      `${CORREZIONE ? `Correzione (“${CORREZIONE}”)` : 'Montato automaticamente'} il ${new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' })} in ${trascorso()}`,
      `Durata: ${durata} s · ${stile === 'Blueprint' ? piano.tavola : `stile ${nomeStile}`} · ${piano.clips.length} tagli da ${camereUsate} sorgenti · voce: ${voci || 'audio delle clip'}`,
      `Parole chiave: ${piano.keywords.map((k) => `${k.word} @${k.at.toFixed(1)}s`).join(', ') || '—'}`,
      piano.testo ? `Testo: ${piano.testo}` : '',
      piano.note ? `Note: ${piano.note}` : '',
      analisi.sorgenti.some((s) => s.stock && piano.clips.some((c) => c.sorgente === s.id)) ? `Repertorio: ${analisi.sorgenti.filter((s) => s.stock && piano.clips.some((c) => c.sorgente === s.id)).map((s) => s.crediti).join(', ')}` : '',
      `File: ${OUT_DIR}/${nome}/${finale}`,
      DA_TELEGRAM ? (avvisoOriginali || `Originali: ${IN_DIR}/${nome}`) : '',
      rigaConsumi(),
    ].filter(Boolean).join('\n');
    fs.writeFileSync(path.join(WORK, 'NOTE.txt'), note);

    rclone('copyto', outFile, remote(DEST, nome, finale));
    // copertina (non nelle prove): stesso nome del video, su Drive accanto a lui
    const fileCopertina = PROVA_SECONDI ? null : copertina(piano, regia, analisi, outFile.replace(/\.mp4$/i, ' - COPERTINA.jpg'));
    if (fileCopertina) rclone('copyto', fileCopertina, remote(DEST, nome, path.basename(fileCopertina)));
    rclone('copyto', path.join(WORK, 'NOTE.txt'), remote(DEST, nome, 'NOTE.txt'));
    for (const f of ['regia.json', 'piano.json', 'materiale.json']) rclone('copyto', path.join(WORK, f), remote(DEST, nome, CACHE, f));
    for (const f of fs.readdirSync(WORK).filter((x) => /^colore-.+\.jpg$/.test(x))) rclone('copyto', path.join(WORK, f), remote(DEST, nome, CACHE, f));
    if (fotogrammiFinale(outFile, durataN, piano)) rclone('copyto', path.join(WORK, 'fotogrammi.jpg'), remote(DEST, nome, CACHE, 'fotogrammi.jpg'));
    if (vai) rclone('moveto', remote(SRC_DIR, nome, vai), remote(SRC_DIR, nome, vaiUsato));
    if (SRC_DIR === IN_DIR && !DA_TELEGRAM) rclone('moveto', remote(IN_DIR, nome), remote(OUT_DIR, nome));

    // per il tasto 📤 Pubblica: didascalie (con 🎨 Solo render quelle già scritte) e ID del file su Drive
    let didascalie = null;
    if (!PROVA_SECONDI) try {
      const salvate = path.join(WORK, 'cache', 'didascalie.json');
      didascalie = RIRENDER && fs.existsSync(salvate) ? JSON.parse(fs.readFileSync(salvate, 'utf8'))
        : await scriviDidascalie({ titolo: piano.titolo || nome, testo: piano.testo, brief, keywords: piano.keywords.map((k) => k.word) });
      if (didascalie) {
        fs.writeFileSync(path.join(WORK, 'didascalie.json'), JSON.stringify(didascalie, null, 1));
        rclone('copyto', path.join(WORK, 'didascalie.json'), remote(OUT_DIR, nome, CACHE, 'didascalie.json'));
      }
    } catch (e) { log('didascalie non scritte', e.message); }
    let fileId = null;
    try { fileId = JSON.parse(run('rclone', ['lsjson', remote(OUT_DIR, nome, finale)]))[0]?.ID || null; } catch (e) { log('ID del video su Drive non trovato', e.message); }
    let copertinaId = null;
    if (fileCopertina) try { copertinaId = JSON.parse(run('rclone', ['lsjson', remote(OUT_DIR, nome, path.basename(fileCopertina))]))[0]?.ID || null; } catch (e) { log('ID della copertina su Drive non trovato', e.message); }

    // dati per la scheda del bot
    const info = {
      file: finale, durata: +durataN.toFixed(1), tagli: piano.clips.length, sorgenti: camereUsate, voce: voci,
      keywords: piano.keywords.map((k) => k.word), note: piano.note || '', ai: consumi.ai,
      minuti: Math.round((Date.now() - T0) / 60000), correzione: CORREZIONE || '', versione: VERSIONE, stile: nomeStile,
      ...(fileId ? { link: `https://drive.google.com/file/d/${fileId}/view` } : {}),
      ...(PROVA_SECONDI ? { prova: PROVA_SECONDI } : {}),
      ...(fileId && !PROVA_SECONDI ? { pubblica: { fileId, file: finale, didascalia: didascalie?.instagram || '', copertina: Math.round(tempoCopertina(piano, durataN) * 1000), ...(copertinaId ? { copertinaId } : {}), youtube: didascalie ? { titolo: didascalie.youtube_titolo, descrizione: didascalie.youtube_descrizione } : null } } : {}),
    };
    // anteprima: prima provo il video in chat, se non passa mando la foto
    const inviato = await inviaVideo(outFile, nome, note, durataN, info);
    if (!inviato) await notifica('✅ pronto', nome, note, { ok: true, foto: anteprima(outFile, piano, durataN), info });
    await inviaCopertina(fileCopertina, nome);
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
// quindi bitrate calcolato per stare sotto ~45 MB (1080 o 720 secondo quanto resta).
async function inviaVideo(outFile, nome, testo, durata, info) {
  if (!process.env.NOTIFY_URL) return false;
  try {
    const anteprimaMp4 = path.join(WORK, 'anteprima.mp4');
    // il bot accetta fino a 50 MB: a piena risoluzione (1080) quando il bitrate lo permette, così in
    // Telegram si giudica la qualità vera e non un 720p sgranato; sotto i 3,5 Mbps meglio il 720 e
    // sotto 1 Mbps il 540 (discorsi lunghi, fino a ~15 min: oltre arriva solo il messaggio)
    const kbpsAudio = durata > 300 ? 96 : 128;
    const kbps = Math.max(300, Math.min(8000, Math.floor((45 * 8 * 1000) / Math.max(1, durata)) - kbpsAudio - 32));
    run('ffmpeg', ['-y', '-v', 'error', '-i', outFile, '-vf', `scale=${kbps >= 3500 ? 1080 : kbps >= 1000 ? 720 : 540}:-2:flags=lanczos`, '-c:v', 'libx264', '-preset', 'medium',
      '-b:v', `${kbps}k`, '-maxrate', `${kbps}k`, '-bufsize', `${kbps * 2}k`, '-pix_fmt', 'yuv420p', ...TAG_709,
      '-c:a', 'aac', '-b:a', `${kbpsAudio}k`, '-movflags', '+faststart', anteprimaMp4]);
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
export { fogliProvino, chiediRegia, rigaConsumi, tagliaSegmenti, scriviDidascalie, scaricaStock, WORK, MEDIA, SCARICO };
