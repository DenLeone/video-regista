// Rinomina file dentro UNA cartella di 05 · Archivio (Denis, 26/11: i numeri delle immagini di Natale erano fuori ordine).
// moveto sullo stesso Drive: il file resta lo stesso (stesso ID, i collegamenti continuano a funzionare). Niente si cancella e
// niente si sovrascrive: due passaggi (prima nomi provvisori, poi i nomi nuovi) così scambi e catene non si scontrano, e se
// qualcosa va storto si torna ai nomi di prima. Repo pubblico: nel log solo i numeri, mai i nomi dei file.
import { execFileSync } from 'node:child_process';

const ARCHIVIO = process.env.DIR_ARCHIVIO || '05 · Archivio';

/** Controlla la mappa vecchio→nuovo contro i nomi presenti. Restituisce un testo di errore o null. */
export function controlla(presenti, mappa) {
  const voci = Object.entries(mappa);
  if (!voci.length) return 'nessun nome da cambiare';
  const set = new Set(presenti);
  for (const [v, n] of voci) {
    if (!v || !n || /[\\/]/.test(v) || /[\\/]/.test(n) || n.startsWith('.')) return 'nome non valido';
    if (!set.has(v)) return 'un file da rinominare non c\'è';
  }
  const nuovi = voci.map(([, n]) => n);
  if (new Set(nuovi).size !== nuovi.length) return 'due file avrebbero lo stesso nome';
  const vecchi = new Set(voci.map(([v]) => v));
  for (const n of nuovi) if (set.has(n) && !vecchi.has(n)) return 'un nome nuovo è già preso da un altro file';
  return null;
}

/** rclone(...args) → testo. Ritorna quanti file ha rinominato. */
export function rinomina({ rclone, R = 'gdrive', cartella, mappa, log = () => {} }) {
  if (!cartella || cartella.includes('..') || cartella.startsWith('/')) throw new Error('cartella non valida');
  const dir = `${ARCHIVIO}/${cartella}`;
  const presenti = JSON.parse(rclone('lsjson', `${R}:${dir}`, '--files-only')).map((f) => f.Name);
  const errore = controlla(presenti, mappa);
  if (errore) throw new Error(errore);
  const voci = Object.entries(mappa).filter(([v, n]) => v !== n);
  const prov = voci.map(([v, n], i) => [v, `.rin${i}_${Date.now().toString(36)}`, n]);
  const fatti = [];
  try {
    for (const [v, p] of prov) { rclone('moveto', `${R}:${dir}/${v}`, `${R}:${dir}/${p}`); fatti.push([v, p]); }
    for (const [, p, n] of prov) { rclone('moveto', `${R}:${dir}/${p}`, `${R}:${dir}/${n}`); }
  } catch (e) {
    // si torna ai nomi di prima: quelli ancora provvisori e quelli già nuovi
    for (const [v, p, n] of prov) {
      for (const da of [p, n]) { try { rclone('moveto', `${R}:${dir}/${da}`, `${R}:${dir}/${v}`); break; } catch { /* non era lì */ } }
    }
    throw new Error('rinomina fermata: i nomi sono tornati come prima');
  }
  log(`rinominati ${prov.length} file`);
  return prov.length;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const rclone = (...a) => String(execFileSync('rclone', a, { stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 24 }));
  try {
    const mappa = JSON.parse(process.env.MAPPA || '{}');
    rinomina({ rclone, R: process.env.REGISTA_REMOTE || 'gdrive', cartella: process.env.CARTELLA || '', mappa, log: console.log });
  } catch (e) {
    console.log(`::error::${e.message}`);
    process.exit(1);
  }
}
