// 05 · Archivio, casa unica del girato (Denis, 23/11). Un file vero (video, foto, audio) sta solo qui:
//   05 · Archivio/<Prodotto>/B-roll              i B-roll, riusati da ogni video nuovo dello stesso prodotto
//   05 · Archivio/<Prodotto>/Parlato/<video>     la voce di ogni video
// In 01 e 02 restano solo collegamenti di Drive (zero spazio; rclone li legge come file veri, quindi
// «Rifai» continua a funzionare). Niente si cancella: i file si spostano e basta.
// Il nome del prodotto è quello della cartella del video (Denis, 23/11).
// Repo pubblico: nei log solo conteggi, mai nomi di file o di prodotti.
import fs from 'node:fs';
import path from 'node:path';

export const DIR_ARCHIVIO = process.env.DIR_ARCHIVIO || '05 · Archivio';
export const BROLL = 'B-roll';
export const PARLATO = 'Parlato';
// doppioni (stesso nome e stesso peso di un file già archiviato): messi da parte, non mescolati ai B-roll
export const DOPPIONI = '_doppioni';
// prefisso dei B-roll presi dall'archivio sul runner: id diversi da quelli dei file del video
export const PREFISSO_BROLL = 'BR_';

export const pulisci = (s) => String(s).replace(/[\/\\:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();

// «CreateMate · Video 03» → CreateMate; «CreateMate 2» (nome libero della Squadra) → CreateMate, solo se c'è già
export function candidatiProdotto(nome) {
  const n = pulisci(nome);
  const base = n.split(' · ')[0].trim();
  const senzaNumero = base.replace(/\s+\d+$/, '').trim();
  return [...new Set([n, base, senzaNumero].filter(Boolean))];
}

export function prodottoEsistente(rclone, R, nome) {
  let cartelle;
  try { cartelle = new Set(JSON.parse(rclone('lsjson', `${R}:${DIR_ARCHIVIO}`, '--dirs-only')).map((d) => d.Name)); } catch { return null; }
  return candidatiProdotto(nome).find((c) => cartelle.has(c)) || null;
}

// la cartella del parlato di un video (la stessa per archiviare e per ritrovarlo in «Rifai»)
export const cartellaParlato = (prodotto, nome) => `${DIR_ARCHIVIO}/${prodotto}/${PARLATO}/${pulisci(nome)}`;

// B-roll o parlato, dal giudizio del Regista. Nel dubbio parlato: un parlato tra i B-roll finirebbe nei video futuri
export function tipiFile(analisi) {
  const broll = new Set();
  const voce = new Set();
  for (const s of analisi?.sorgenti || []) {
    const n = path.basename(String(s.originale || ''));
    if (s.tipo === 'audio' || s.parlato || s.principale) voce.add(n);
    else if (s.tipo === 'video') broll.add(n);
  }
  for (const i of analisi?.immagini || []) if (!i.libreria) broll.add(path.basename(String(i.originale || '')));
  // null = il Regista non l'ha usato (es. il parlato di un altro video): chi lo chiama decide
  return (nome) => (broll.has(nome) && !voce.has(nome) ? BROLL : voce.has(nome) ? PARLATO : null);
}

const nomi = (rclone, dove) => {
  try { return new Map(JSON.parse(rclone('lsjson', dove, '--files-only')).map((f) => [f.Name, f.Size])); } catch { return new Map(); }
};

// Sposta un file nell'archivio del prodotto (B-roll o Parlato/<video>), senza sovrascrivere niente:
// stesso nome e stesso peso = doppione, messo da parte; stesso nome e peso diverso = «2 - nome».
function archiviatore({ rclone, R, prodotto, nome, analisi }) {
  const tipo = tipiFile(analisi);
  const cartelle = { [BROLL]: `${DIR_ARCHIVIO}/${prodotto}/${BROLL}`, [PARLATO]: cartellaParlato(prodotto, nome) };
  const gia = { [BROLL]: nomi(rclone, `${R}:${cartelle[BROLL]}`), [PARLATO]: nomi(rclone, `${R}:${cartelle[PARLATO]}`) };
  const esito = { broll: 0, parlato: 0, doppioni: 0, senzaCollegamento: 0, falliti: 0, giaAPosto: 0, lasciati: 0 };
  // da = percorso del file su Drive; chi = nome con cui il Regista l'ha visto; size = peso
  // ignoti = PARLATO (file veri da togliere da 01) oppure null (girato di 05 non usato: resta dov'è)
  const sposta = (da, chi, size, ignoti = PARLATO) => {
    const t = tipo(chi) || ignoti;
    if (!t) { esito.lasciati++; return null; }
    const nomeFile = da.split('/').pop();
    if (da.startsWith(`${cartelle[t]}/`)) { esito.giaAPosto++; return null; }
    let dest = cartelle[t];
    let nuovo = nomeFile;
    const doppio = gia[t].has(nomeFile) && gia[t].get(nomeFile) === size;
    if (doppio) { dest = `${cartelle[t]}/${DOPPIONI}`; nuovo = `${pulisci(nome)} - ${nomeFile}`; }
    else for (let k = 2; gia[t].has(nuovo); k++) nuovo = `${k} - ${nomeFile}`;
    try { rclone('moveto', `${R}:${da}`, `${R}:${dest}/${nuovo}`); } catch { esito.falliti++; return null; }
    if (!doppio) gia[t].set(nuovo, size);
    esito[doppio ? 'doppioni' : t === BROLL ? 'broll' : 'parlato']++;
    return `${dest}/${nuovo}`;
  };
  return { sposta, esito };
}
const riassunto = (e) => `archivio: ${e.broll} B-roll e ${e.parlato} parlato in 05${e.giaAPosto ? `, ${e.giaAPosto} già a posto` : ''}${e.lasciati ? `, ${e.lasciati} non usati lasciati dov'erano` : ''}${e.doppioni ? `, ${e.doppioni} doppioni messi da parte` : ''}${e.senzaCollegamento ? `, ${e.senzaCollegamento} senza collegamento` : ''}${e.falliti ? `, ${e.falliti} NON spostati` : ''}`;

// Fine montaggio: i file veri di <dir>/<nome> vanno nell'archivio del prodotto, al loro posto un collegamento.
// Se il collegamento non riesce il file è comunque al sicuro in 05.
export function archiviaOriginali({ rclone, R, dir, nome, analisi, isMedia, log = () => {} }) {
  const qui = `${dir}/${nome}`;
  let veri;
  try { veri = JSON.parse(rclone('lsjson', `${R}:${qui}`, '--files-only', '--drive-skip-shortcuts')).filter(isMedia); } catch { veri = []; }
  if (!veri.length) return { broll: 0, parlato: 0, doppioni: 0, senzaCollegamento: 0, falliti: 0, giaAPosto: 0 };
  // prodotto nuovo: il nome senza « · Video 03» (il numero finale resta: «iPhone 17» non è «iPhone»)
  const prodotto = prodottoEsistente(rclone, R, nome) || pulisci(nome).split(' · ')[0].trim();
  const { sposta, esito } = archiviatore({ rclone, R, prodotto, nome, analisi });
  for (const f of veri) {
    const dove = sposta(`${qui}/${f.Name}`, f.Name, f.Size);
    if (!dove) continue;
    try { rclone('backend', 'shortcut', `${R}:`, dove, `${qui}/${f.Name}`); } catch { esito.senzaCollegamento++; }
  }
  log(riassunto(esito));
  return esito;
}

// 🚀 Lancio da 05 (23/11): in <dir>/<nome> un collegamento per ogni file del girato di 05 · Archivio/<sorgente>.
// Si saltano B-roll/ (arrivano da soli, tutti), Parlato/ (sono di altri video) e le cartelle «_».
// I file nelle sottocartelle prendono davanti il nome della sottocartella (niente nomi uguali).
// La mappa collegamento → file va in <dir>/<nome>/_regista/archivio.json: a fine montaggio serve per ordinarli.
export const MAPPA = '_regista/archivio.json';
export function collegaDaArchivio({ rclone, R, sorgente, dir, nome, isMedia, scrivi, log = () => {} }) {
  const base = `${DIR_ARCHIVIO}/${sorgente}`;
  let tutti;
  try { tutti = JSON.parse(rclone('lsjson', `${R}:${base}`, '-R', '--files-only')); } catch { throw new Error('non riesco a leggere la cartella di 05'); }
  const file = tutti.filter((f) => isMedia(f) && !f.Path.split('/').slice(0, -1).some((x) => x.startsWith('_') || x === BROLL || x === PARLATO));
  if (!file.length) throw new Error('nella cartella di 05 non c\'è girato da montare (fuori da B-roll e Parlato)');
  const mappa = [];
  const usati = new Set();
  // giro interrotto a metà: i collegamenti già fatti non si rifanno (Drive accetta due file con lo stesso nome)
  const fatti = nomi(rclone, `${R}:${dir}/${nome}`);
  for (const f of file) {
    let chi = f.Path.split('/').map(pulisci).join(' - ');
    for (let k = 2; usati.has(chi.toLowerCase()); k++) chi = `${k} - ${f.Name}`;
    usati.add(chi.toLowerCase());
    if (fatti.has(chi)) { mappa.push({ chi, file: `${base}/${f.Path}`, size: f.Size }); continue; }
    try { rclone('backend', 'shortcut', `${R}:`, `${base}/${f.Path}`, `${dir}/${nome}/${chi}`); }
    catch { throw new Error(`Drive non mi lascia creare i collegamenti in 01 (fatti ${mappa.length} su ${file.length})`); }
    mappa.push({ chi, file: `${base}/${f.Path}`, size: f.Size });
  }
  scrivi(`${dir}/${nome}/${MAPPA}`, JSON.stringify({ sorgente, prodotto: sorgente, file: mappa }, null, 1));
  log(`lancio da 05: ${mappa.length} collegamenti`);
  return mappa.length;
}

// Fine montaggio di un lancio da 05: i file veri (già in 05) si ordinano in B-roll o Parlato/<video> del prodotto.
// I collegamenti seguono il file, non il percorso: continuano a funzionare.
export function ordinaArchivio({ rclone, R, dir, nome, analisi, log = () => {} }) {
  let m;
  try { m = JSON.parse(rclone('cat', `${R}:${dir}/${nome}/${MAPPA}`)); } catch { return null; }
  if (!m?.file?.length || !m.prodotto) return null;
  const { sposta, esito } = archiviatore({ rclone, R, prodotto: m.prodotto, nome, analisi });
  for (const f of m.file) sposta(f.file, f.chi, f.size, null);
  log(riassunto(esito));
  return esito;
}

// Cartelle di 05 con girato ancora da montare (file fuori da B-roll/, Parlato/ e dalle cartelle «_»), dalla più
// recente: per i tasti del bot, accanto a quelle di 01. elenco = rclone lsjson -R --files-only di 05.
export function daMontare(elenco, isMedia) {
  const ultimo = new Map();
  for (const f of elenco) {
    const parti = String(f.Path).split('/');
    if (parti.length < 2 || !isMedia(f)) continue;
    if (parti.slice(0, -1).some((x) => x.startsWith('_') || x === BROLL || x === PARLATO)) continue;
    const t = Date.parse(f.ModTime || '') || 0;
    if (!ultimo.has(parti[0]) || ultimo.get(parti[0]) < t) ultimo.set(parti[0], t);
  }
  return [...ultimo].sort((a, b) => b[1] - a[1]).map(([n]) => n);
}

// Il nome della cartella di 05 detto a voce o scritto al volo («pgythech createmate 2611»): maiuscole, spazi e
// simboli non contano, e si tollerano 2 lettere sbagliate. Prima il primo livello, poi uno sotto. Solo se è UNA.
const chiave = (x) => String(x).toLowerCase().replace(/[^a-z0-9]+/g, '');
function distanza(a, b) {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prec = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prec + (a[i - 1] === b[j - 1] ? 0 : 1)); prec = t; }
  }
  return d[b.length];
}
// quanto è lontana la cartella più simile (diagnosi nei log pubblici: solo numeri)
export const piuVicina = (cercata, cartelle) => Math.min(Infinity, ...cartelle.map((c) => Math.min(distanza(chiave(c.split('/').pop()), chiave(cercata)), distanza(chiave(c), chiave(cercata)))));
export function cartellaSimile(cercata, cartelle) {
  const k = chiave(cercata);
  if (!k) return { trovata: null, quante: 0 };
  for (const prova of [(x) => x === k, (x) => distanza(x, k) <= 2]) {
    // «PGYTECH CreateMate 2611» = «PGYTECH/CreateMate 2611»: vale il nome della cartella o il percorso intero
    const ok = cartelle.filter((c) => prova(chiave(c.split('/').pop())) || prova(chiave(c)));
    if (ok.length) return { trovata: ok.length === 1 ? ok[0] : null, quante: ok.length };
  }
  return { trovata: null, quante: 0 };
}

// Prima del montaggio: tutti i B-roll del prodotto (anche dei video vecchi) entrano nel materiale; l'AI sceglie.
// Si saltano quelli che ci sono già (stesso nome nella cartella del video).
// prodotto: dalla mappa del lancio da 05 (<dir>/<nome>/_regista/archivio.json), se c'è; se no dal nome del video
export function scaricaBrollProdotto({ rclone, R, nome, dest, isMedia, dir, log = () => {} }) {
  let prodotto = null;
  if (dir) try { prodotto = JSON.parse(rclone('cat', `${R}:${dir}/${nome}/${MAPPA}`)).prodotto || null; } catch { /* non lanciato da 05 */ }
  prodotto ||= prodottoEsistente(rclone, R, nome);
  if (!prodotto) return 0;
  const dove = `${R}:${DIR_ARCHIVIO}/${prodotto}/${BROLL}`;
  let file;
  try { file = JSON.parse(rclone('lsjson', dove, '--files-only')).filter(isMedia); } catch { return 0; }
  const presenti = new Set(fs.readdirSync(dest));
  const da = file.filter((f) => !presenti.has(f.Name) && !presenti.has(PREFISSO_BROLL + f.Name));
  if (!da.length) return 0;
  const tmp = path.join(dest, '_broll-archivio');
  fs.mkdirSync(tmp, { recursive: true });
  const elenco = path.join(path.dirname(dest), `.broll-${process.pid}.txt`);
  fs.writeFileSync(elenco, da.map((f) => f.Name).join('\n') + '\n');
  try {
    rclone('copy', dove, tmp, '--files-from-raw', elenco, '--max-depth', '1', '--transfers', '8', '--multi-thread-streams', '8');
    let n = 0;
    for (const f of fs.readdirSync(tmp)) { fs.renameSync(path.join(tmp, f), path.join(dest, PREFISSO_BROLL + f)); n++; }
    log(`B-roll dall'archivio del prodotto: ${n}`);
    return n;
  } catch {
    log('B-roll dall\'archivio non scaricati');
    return 0;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(elenco, { force: true });
  }
}

// Riga di comando (regista.yml, elenco del bot): node scripts/archivio.mjs da-montare → una cartella per riga
if (process.argv[2] === 'da-montare' && process.argv[1] && path.resolve(process.argv[1]) === (await import('node:url')).fileURLToPath(import.meta.url)) {
  const { execFileSync } = await import('node:child_process');
  const { AUDIO_EXT, IMAGE_EXT, VIDEO_EXT } = await import('./sorgenti.mjs');
  const R = process.env.REGISTA_REMOTE || 'gdrive';
  const isMedia = (f) => VIDEO_EXT.concat(IMAGE_EXT, AUDIO_EXT).includes(path.extname(f.Name).toLowerCase());
  try {
    const elenco = JSON.parse(String(execFileSync('rclone', ['lsjson', `${R}:${DIR_ARCHIVIO}`, '-R', '--files-only', '--max-depth', '4'], { stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 28 })));
    for (const n of daMontare(elenco, isMedia)) console.log(n);
  } catch { /* 05 non letto: il bot mostra solo 01 */ }
}

// Riga di comando (regista.yml, passo «Dall'archivio»): node scripts/archivio.mjs collega [--auto] <sorgente in 05> <nome in 01>
// --auto: il nome arriva dal bot, dall'app o da Ultron e in 01 non c'è; se non c'è nemmeno in 05 non è un errore qui
// (lo dice il controllo di 01, come sempre)
if (process.argv[2] === 'collega' && process.argv[1] && path.resolve(process.argv[1]) === (await import('node:url')).fileURLToPath(import.meta.url)) {
  const { execFileSync } = await import('node:child_process');
  const os = await import('node:os');
  const { AUDIO_EXT, IMAGE_EXT, VIDEO_EXT } = await import('./sorgenti.mjs');
  const rclone = (...a) => String(execFileSync('rclone', a, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 26 }));
  const R = process.env.REGISTA_REMOTE || 'gdrive';
  const DIR_EDITARE = process.env.DIR_EDITARE || '01 · Da editare';
  const DIR_FATTI = process.env.DIR_FATTI || '02 · Fatti';
  const auto = process.argv[3] === '--auto';
  const [sorgente, nome] = process.argv.slice(auto ? 4 : 3, auto ? 6 : 5).map((x) => String(x || '').trim());
  // il motivo va anche al bot (passo «Avvisa il bot se il giro si è fermato prima di montare»)
  const esce = (t) => {
    console.log(`::error::${t}`);
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `errore=${t.replace(/\n/g, ' ')}\n`);
    process.exit(1);
  };
  if (!sorgente || !nome) esce('servono la cartella di 05 e il nome del video');
  const cartelle = (d) => { try { return JSON.parse(rclone('lsjson', `${R}:${d}`, '--dirs-only')).map((x) => x.Name.toLowerCase()); } catch { return []; } };
  if (cartelle(DIR_FATTI).includes(nome.toLowerCase())) esce(`in ${DIR_FATTI} c'è già un video con questo nome: scegline un altro (es. con « 2»)`);
  // già pronta in 01 (c'è la mappa): rilancio, niente da fare. Senza mappa = giro interrotto, si completa
  const giaPronta = (() => { try { return JSON.parse(rclone('lsjson', `${R}:${DIR_EDITARE}/${nome}/${MAPPA}`)).length > 0; } catch { return false; } })();
  if (giaPronta) { console.log('la cartella c\'è già in 01: niente collegamenti nuovi (rilancio)'); process.exit(0); }
  // il nome della cartella di 05: simile basta (maiuscole, spazi, 2 lettere sbagliate), primo livello o uno sotto
  let in05 = [];
  try { in05 = JSON.parse(rclone('lsjson', `${R}:${DIR_ARCHIVIO}`, '--dirs-only')).map((x) => x.Name).filter((x) => !x.startsWith('_')); } catch { esce(`non riesco a leggere ${DIR_ARCHIVIO}`); }
  let sotto = [];
  let { trovata, quante } = cartellaSimile(sorgente, in05);
  if (!trovata && !quante) {
    try { sotto = JSON.parse(rclone('lsjson', `${R}:${DIR_ARCHIVIO}`, '--dirs-only', '-R', '--max-depth', '2')).map((x) => x.Path).filter((x) => x.includes('/') && !x.split('/').some((y) => y.startsWith('_') || y === BROLL || y === PARLATO)); } catch { /* resta il primo livello */ }
    ({ trovata, quante } = cartellaSimile(sorgente, sotto));
  }
  if (!trovata && !quante) console.log(`cartelle guardate: ${in05.length} al primo livello, ${sotto.length} un livello sotto; la più simile ha ${piuVicina(sorgente, [...in05, ...sotto])} lettere diverse`);
  if (!trovata && !quante && auto) { console.log(`non è né in 01 né in ${DIR_ARCHIVIO}: decide il controllo di 01`); process.exit(0); }
  if (!trovata) esce(quante > 1 ? `in ${DIR_ARCHIVIO} ci sono ${quante} cartelle con un nome simile: scrivi il nome preciso` : `non trovo la cartella in ${DIR_ARCHIVIO}, nemmeno con un nome simile`);
  if (chiave(trovata) !== chiave(sorgente)) console.log(`cartella di 05 trovata con un nome simile${trovata.includes('/') ? ', dentro un\'altra cartella' : ''}`);
  const daUsare = trovata;
  const isMedia = (f) => VIDEO_EXT.concat(IMAGE_EXT, AUDIO_EXT).includes(path.extname(f.Name).toLowerCase());
  const scrivi = (dove, testo) => {
    const tmp = path.join(os.tmpdir(), `archivio-${process.pid}.json`);
    fs.writeFileSync(tmp, testo);
    rclone('copyto', tmp, `${R}:${dove}`);
    fs.rmSync(tmp, { force: true });
  };
  try { collegaDaArchivio({ rclone, R, sorgente: daUsare, dir: DIR_EDITARE, nome, isMedia, scrivi, log: console.log }); }
  // repo pubblico: i messaggi di rclone contengono nomi di file, qui solo il nostro
  catch (e) { esce(/^(nella cartella di 05|non riesco|Drive non mi lascia)/.test(e.message) ? e.message : 'dall\'archivio: collegamenti non creati'); }
}
