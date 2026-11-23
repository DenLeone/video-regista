import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { archiviaOriginali, candidatiProdotto, collegaDaArchivio, MAPPA, ordinaArchivio, PREFISSO_BROLL, scaricaBrollProdotto, tipiFile } from './archivio.mjs';

// Drive finto: percorso → { size, link } (link = collegamento). Solo i comandi che usa archivio.mjs.
function driveFinto(file = {}) {
  const d = new Map(Object.entries(file));
  const via = (p) => p.replace(/^gdrive:/, '').replace(/\/$/, '');
  const figli = (dir) => [...d.keys()].filter((k) => k.startsWith(`${dir}/`)).map((k) => k.slice(dir.length + 1));
  const rclone = (cmd, ...a) => {
    if (cmd === 'lsjson') {
      const dir = via(a[0]);
      const sotto = figli(dir);
      if (!sotto.length) throw new Error('directory not found');
      if (a.includes('-R')) return JSON.stringify(sotto.map((Path) => ({ Path, Name: Path.split('/').pop(), Size: d.get(`${dir}/${Path}`).size })));
      if (a.includes('--dirs-only')) return JSON.stringify([...new Set(sotto.filter((s) => s.includes('/')).map((s) => s.split('/')[0]))].map((Name) => ({ Name })));
      return JSON.stringify(sotto.filter((s) => !s.includes('/')).filter((s) => !(a.includes('--drive-skip-shortcuts') && d.get(`${dir}/${s}`).link)).map((Name) => ({ Name, Size: d.get(`${dir}/${Name}`).size })));
    }
    if (cmd === 'cat') { const x = d.get(via(a[0])); if (!x) throw new Error('not found'); return x.testo; }
    if (cmd === 'moveto') { const [da, a2] = a.map(via); if (!d.has(da)) throw new Error('not found'); d.set(a2, d.get(da)); d.delete(da); return ''; }
    if (cmd === 'backend' && a[0] === 'shortcut') { d.set(a[3], { size: d.get(a[2]).size, link: a[2] }); return ''; }
    if (cmd === 'copy') {
      const dir = via(a[0]);
      const lista = fs.readFileSync(a[a.indexOf('--files-from-raw') + 1], 'utf8').split('\n').filter(Boolean);
      for (const n of lista) fs.writeFileSync(path.join(a[1], n), 'x');
      return '';
    }
    throw new Error(`comando non previsto: ${cmd}`);
  };
  return { d, rclone };
}
const isMedia = (f) => /\.(mp4|mov|jpg|wav)$/i.test(f.Name);

test('nome del prodotto dalla cartella del video', () => {
  assert.deepEqual(candidatiProdotto('CreateMate'), ['CreateMate']);
  assert.deepEqual(candidatiProdotto('CreateMate · Video 03'), ['CreateMate · Video 03', 'CreateMate']);
  assert.deepEqual(candidatiProdotto('CreateMate 2'), ['CreateMate 2', 'CreateMate']);
});

test('B-roll solo se il Regista l\'ha visto senza voce; mai visto = null', () => {
  const tipo = tipiFile({ sorgenti: [
    { originale: '/s/VOCE.mp4', tipo: 'video', parlato: true },
    { originale: '/s/MIC.wav', tipo: 'audio' },
    { originale: '/s/B1.mp4', tipo: 'video', parlato: false },
  ], immagini: [{ originale: 'FOTO.jpg' }, { originale: 'Assets/Loghi/x.png', libreria: true }] });
  assert.equal(tipo('VOCE.mp4'), 'Parlato');
  assert.equal(tipo('MIC.wav'), 'Parlato');
  assert.equal(tipo('B1.mp4'), 'B-roll');
  assert.equal(tipo('FOTO.jpg'), 'B-roll');
  assert.equal(tipo('SCONOSCIUTO.mp4'), null);
});

const analisi = { sorgenti: [{ originale: '/s/VOCE.mp4', tipo: 'video', parlato: true }, { originale: '/s/B1.mp4', tipo: 'video' }, { originale: '/s/B2.mp4', tipo: 'video' }] };

test('fine montaggio: originali in 05 divisi, collegamenti al loro posto, il resto non si tocca', () => {
  const { d, rclone } = driveFinto({
    '01 · Da editare/CreateMate/VOCE.mp4': { size: 10 },
    '01 · Da editare/CreateMate/B1.mp4': { size: 5 },
    '01 · Da editare/CreateMate/brief.txt': { size: 1 },
    '01 · Da editare/CreateMate/CreateMate FINALE.mp4': { size: 9 },
    '05 · Archivio/Altro/B-roll/Z.mp4': { size: 1 },
  });
  const e = archiviaOriginali({ rclone, R: 'gdrive', dir: '01 · Da editare', nome: 'CreateMate', analisi, isMedia: (f) => isMedia(f) && !/FINALE/.test(f.Name) });
  assert.deepEqual([e.broll, e.parlato, e.falliti], [1, 1, 0]);
  assert.equal(d.get('05 · Archivio/CreateMate/Parlato/CreateMate/VOCE.mp4').size, 10);
  assert.equal(d.get('05 · Archivio/CreateMate/B-roll/B1.mp4').size, 5);
  assert.equal(d.get('01 · Da editare/CreateMate/VOCE.mp4').link, '05 · Archivio/CreateMate/Parlato/CreateMate/VOCE.mp4');
  assert.equal(d.get('01 · Da editare/CreateMate/B1.mp4').link, '05 · Archivio/CreateMate/B-roll/B1.mp4');
  assert.ok(d.has('01 · Da editare/CreateMate/brief.txt'));
  assert.ok(!d.get('01 · Da editare/CreateMate/CreateMate FINALE.mp4').link);
});

test('secondo video dello stesso prodotto: va nella stessa cartella, i nomi uguali non si sovrascrivono', () => {
  const { d, rclone } = driveFinto({
    '05 · Archivio/CreateMate/B-roll/B1.mp4': { size: 5 },
    '05 · Archivio/CreateMate/B-roll/B2.mp4': { size: 7 },
    '01 · Da editare/CreateMate 2/VOCE.mp4': { size: 11 },
    '01 · Da editare/CreateMate 2/B1.mp4': { size: 5 },  // stesso file già archiviato
    '01 · Da editare/CreateMate 2/B2.mp4': { size: 8 },  // stesso nome, file diverso
  });
  const e = archiviaOriginali({ rclone, R: 'gdrive', dir: '01 · Da editare', nome: 'CreateMate 2', analisi, isMedia });
  assert.deepEqual([e.broll, e.parlato, e.doppioni], [1, 1, 1]);
  assert.ok(d.has('05 · Archivio/CreateMate/Parlato/CreateMate 2/VOCE.mp4'));
  assert.ok(d.has('05 · Archivio/CreateMate/B-roll/_doppioni/CreateMate 2 - B1.mp4'));
  assert.equal(d.get('05 · Archivio/CreateMate/B-roll/B2.mp4').size, 7);
  assert.equal(d.get('05 · Archivio/CreateMate/B-roll/2 - B2.mp4').size, 8);
});

test('cartella della Squadra (solo collegamenti): niente da spostare', () => {
  const { d, rclone } = driveFinto({
    '05 · Archivio/Ajazz/C0001.mp4': { size: 3 },
    '01 · Da editare/Ajazz/C0001.mp4': { size: 3, link: '05 · Archivio/Ajazz/C0001.mp4' },
  });
  const e = archiviaOriginali({ rclone, R: 'gdrive', dir: '01 · Da editare', nome: 'Ajazz', analisi, isMedia });
  assert.deepEqual([e.broll, e.parlato], [0, 0]);
  assert.equal(d.size, 2);
});

test('prima del montaggio: arrivano tutti i B-roll del prodotto, tranne quelli già nella cartella', () => {
  const { rclone } = driveFinto({
    '05 · Archivio/CreateMate/B-roll/B1.mp4': { size: 5 },
    '05 · Archivio/CreateMate/B-roll/VECCHIO.mp4': { size: 5 },
    '05 · Archivio/CreateMate/B-roll/_doppioni/X.mp4': { size: 5 },
  });
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'archivio-'));
  const dest = path.join(base, 'scarico');
  fs.mkdirSync(dest);
  fs.writeFileSync(path.join(dest, 'B1.mp4'), 'x');
  const n = scaricaBrollProdotto({ rclone, R: 'gdrive', nome: 'CreateMate 2', dest, isMedia });
  assert.equal(n, 1);
  assert.deepEqual(fs.readdirSync(dest).sort(), ['B1.mp4', `${PREFISSO_BROLL}VECCHIO.mp4`]);
  assert.equal(scaricaBrollProdotto({ rclone, R: 'gdrive', nome: 'Nuovo', dest, isMedia }), 0);
  fs.rmSync(base, { recursive: true, force: true });
});

test('lancio da 05: collegamenti in 01, B-roll e Parlato saltati, poi a fine montaggio si ordina in 05', () => {
  const { d, rclone } = driveFinto({
    '05 · Archivio/CreateMate/VOCE.mp4': { size: 10 },
    '05 · Archivio/CreateMate/Giorno 2/B1.mp4': { size: 5 },
    '05 · Archivio/CreateMate/B-roll/VECCHIO.mp4': { size: 3 },
    '05 · Archivio/CreateMate/Parlato/Altro video/V.mp4': { size: 3 },
    '05 · Archivio/CreateMate/_servizio/x.mp4': { size: 1 },
  });
  const scrivi = (dove, testo) => d.set(dove, { size: testo.length, testo });
  const n = collegaDaArchivio({ rclone, R: 'gdrive', sorgente: 'CreateMate', dir: '01 · Da editare', nome: 'CreateMate', isMedia, scrivi });
  assert.equal(n, 2);
  assert.equal(d.get('01 · Da editare/CreateMate/VOCE.mp4').link, '05 · Archivio/CreateMate/VOCE.mp4');
  assert.equal(d.get('01 · Da editare/CreateMate/Giorno 2 - B1.mp4').link, '05 · Archivio/CreateMate/Giorno 2/B1.mp4');
  assert.ok(d.has(`01 · Da editare/CreateMate/${MAPPA}`));

  // il Regista ha visto i collegamenti con questi nomi
  const vista = { sorgenti: [{ originale: '/s/VOCE.mp4', tipo: 'video', parlato: true }, { originale: '/s/Giorno 2 - B1.mp4', tipo: 'video' }] };
  // a fine montaggio non c'è niente di vero in 01: archiviaOriginali non tocca niente
  assert.equal(archiviaOriginali({ rclone, R: 'gdrive', dir: '01 · Da editare', nome: 'CreateMate', analisi: vista, isMedia }).broll, 0);
  const e = ordinaArchivio({ rclone, R: 'gdrive', dir: '01 · Da editare', nome: 'CreateMate', analisi: vista });
  assert.deepEqual([e.broll, e.parlato, e.falliti], [1, 1, 0]);
  assert.ok(d.has('05 · Archivio/CreateMate/B-roll/B1.mp4'));
  assert.ok(d.has('05 · Archivio/CreateMate/B-roll/VECCHIO.mp4'));
  assert.ok(d.has('05 · Archivio/CreateMate/Parlato/CreateMate/VOCE.mp4'));
  assert.ok(!d.has('05 · Archivio/CreateMate/VOCE.mp4'));
});

test('lancio da 05 senza girato: errore chiaro', () => {
  const { rclone } = driveFinto({ '05 · Archivio/Vuoto/B-roll/X.mp4': { size: 1 } });
  assert.throws(() => collegaDaArchivio({ rclone, R: 'gdrive', sorgente: 'Vuoto', dir: '01', nome: 'Vuoto', isMedia, scrivi: () => {} }), /non c'è girato/);
});

test('lancio da 05 con due parlati: quello non usato dal Regista resta dov\'è', () => {
  const { d, rclone } = driveFinto({
    '05 · Archivio/P/NUOVO.mp4': { size: 10 },
    '05 · Archivio/P/VECCHIO.mp4': { size: 9 },
    '05 · Archivio/P/B1.mp4': { size: 5 },
  });
  const scrivi = (dove, testo) => d.set(dove, { size: testo.length, testo });
  collegaDaArchivio({ rclone, R: 'gdrive', sorgente: 'P', dir: '01', nome: 'P', isMedia, scrivi });
  const vista = { sorgenti: [{ originale: '/s/NUOVO.mp4', tipo: 'video', parlato: true }, { originale: '/s/B1.mp4', tipo: 'video' }] };
  const e = ordinaArchivio({ rclone, R: 'gdrive', dir: '01', nome: 'P', analisi: vista });
  assert.deepEqual([e.broll, e.parlato, e.lasciati], [1, 1, 1]);
  assert.ok(d.has('05 · Archivio/P/VECCHIO.mp4'));
  assert.ok(d.has('05 · Archivio/P/Parlato/P/NUOVO.mp4'));
});
