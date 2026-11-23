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
  return (nome) => (broll.has(nome) && !voce.has(nome) ? BROLL : PARLATO);
}

const nomi = (rclone, dove) => {
  try { return new Map(JSON.parse(rclone('lsjson', dove, '--files-only')).map((f) => [f.Name, f.Size])); } catch { return new Map(); }
};

// Fine montaggio: i file veri di <dir>/<nome> vanno nell'archivio del prodotto, al loro posto un collegamento.
// Se il collegamento non riesce il file è comunque al sicuro in 05.
export function archiviaOriginali({ rclone, R, dir, nome, analisi, isMedia, log = () => {} }) {
  const qui = `${dir}/${nome}`;
  let veri;
  try { veri = JSON.parse(rclone('lsjson', `${R}:${qui}`, '--files-only', '--drive-skip-shortcuts')).filter(isMedia); } catch { veri = []; }
  const esito = { broll: 0, parlato: 0, doppioni: 0, senzaCollegamento: 0, falliti: 0 };
  if (!veri.length) return esito;
  // prodotto nuovo: il nome senza « · Video 03» (il numero finale resta: «iPhone 17» non è «iPhone»)
  const prodotto = prodottoEsistente(rclone, R, nome) || pulisci(nome).split(' · ')[0].trim();
  const tipo = tipiFile(analisi);
  const cartelle = { [BROLL]: `${DIR_ARCHIVIO}/${prodotto}/${BROLL}`, [PARLATO]: cartellaParlato(prodotto, nome) };
  const gia = { [BROLL]: nomi(rclone, `${R}:${cartelle[BROLL]}`), [PARLATO]: nomi(rclone, `${R}:${cartelle[PARLATO]}`) };
  for (const f of veri) {
    const t = tipo(f.Name);
    let dest = cartelle[t];
    let nuovo = f.Name;
    const doppio = gia[t].has(f.Name) && gia[t].get(f.Name) === f.Size;
    if (doppio) { dest = `${cartelle[t]}/${DOPPIONI}`; nuovo = `${pulisci(nome)} - ${f.Name}`; }
    else for (let k = 2; gia[t].has(nuovo); k++) nuovo = `${k} - ${f.Name}`;
    try { rclone('moveto', `${R}:${qui}/${f.Name}`, `${R}:${dest}/${nuovo}`); } catch { esito.falliti++; continue; }
    if (!doppio) gia[t].set(nuovo, f.Size);
    esito[doppio ? 'doppioni' : t === BROLL ? 'broll' : 'parlato']++;
    try { rclone('backend', 'shortcut', `${R}:`, `${dest}/${nuovo}`, `${qui}/${f.Name}`); } catch { esito.senzaCollegamento++; }
  }
  log(`archivio: ${esito.broll} B-roll e ${esito.parlato} parlato in 05${esito.doppioni ? `, ${esito.doppioni} doppioni messi da parte` : ''}${esito.senzaCollegamento ? `, ${esito.senzaCollegamento} senza collegamento` : ''}${esito.falliti ? `, ${esito.falliti} NON spostati` : ''}`);
  return esito;
}

// Prima del montaggio: tutti i B-roll del prodotto (anche dei video vecchi) entrano nel materiale; l'AI sceglie.
// Si saltano quelli che ci sono già (stesso nome nella cartella del video).
export function scaricaBrollProdotto({ rclone, R, nome, dest, isMedia, log = () => {} }) {
  const prodotto = prodottoEsistente(rclone, R, nome);
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
