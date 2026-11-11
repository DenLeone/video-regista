// Banco di prova degli stili (11/11): dopo ogni modifica, fotogrammi di Cinematico, Kal e Ultra su
// un montaggio finto e sempre uguale, in un foglio solo (out/banco/banco.jpg). Serve ad accorgersi
// subito se un cambio rompe uno stile: scritte sulla faccia, schede sopra le scritte, render che
// non parte. Le scene sono generate qui con ffmpeg (sagoma grigia al posto della persona): niente
// girato di Denis, il foglio si può pubblicare.
//
//   node scripts/banco.mjs            → tutti e tre
//   node scripts/banco.mjs Kal Ultra  → solo questi
//
// REMOTION_BROWSER = Chrome già installato (facoltativo).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { leggiStile } from './stile-su-misura.mjs';
import { regolaStile } from './regolatore.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MEDIA = path.join(ROOT, 'public', 'media');
const OUT = path.join(ROOT, 'out', 'banco');

const ff = (...a) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...a], { stdio: 'inherit' });

// ---------- scene finte ----------
// volto: fondo da studio con la sagoma della persona (testa beige, busto grigio) dove starebbe Denis,
// così si vede subito se una scritta o una scheda gli finisce sulla faccia
function preparaMedia() {
  fs.mkdirSync(MEDIA, { recursive: true });
  const f = (n) => path.join(MEDIA, n);
  if (!fs.existsSync(f('banco_volto.mp4'))) {
    ff('-f', 'lavfi', '-i', 'color=c=0x2b3340:s=1080x1920:r=30:d=12', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=12',
      '-vf', ['drawbox=x=0:y=1500:w=1080:h=420:color=0x3d3328:t=fill', 'drawbox=x=300:y=900:w=480:h=820:color=0x6b7280:t=fill',
        'drawbox=x=420:y=520:w=240:h=320:color=0xd9b99b:t=fill', 'drawbox=x=470:y=640:w=40:h=24:color=0x222222:t=fill',
        'drawbox=x=570:y=640:w=40:h=24:color=0x222222:t=fill'].join(','),
      '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', f('banco_volto.mp4'));
  }
  if (!fs.existsSync(f('banco_broll.mp4'))) {
    ff('-f', 'lavfi', '-i', 'testsrc2=s=1080x1920:r=30:d=12', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-an', f('banco_broll.mp4'));
  }
  if (!fs.existsSync(f('banco_img_q.jpg'))) {
    ff('-f', 'lavfi', '-i', 'color=c=0x0f766e:s=1000x1000', '-vf', 'drawbox=x=200:y=200:w=600:h=600:color=0xf59e0b:t=fill', '-frames:v', '1', f('banco_img_q.jpg'));
  }
  if (!fs.existsSync(f('banco_img_l.jpg'))) {
    ff('-f', 'lavfi', '-i', 'color=c=0x1e3a8a:s=1600x900', '-vf', 'drawbox=x=100:y=100:w=700:h=700:color=0xe5e7eb:t=fill', '-frames:v', '1', f('banco_img_l.jpg'));
  }
}

// ---------- il montaggio finto ----------
const FRASE = ('questo è il prodotto che uso tutti i giorni costa quaranta euro la batteria dura due settimane ' +
  'si ricarica in un ora e il microfono isola bene la voce quindi per me è promosso lo consiglio').split(' ');
const parole = FRASE.map((w, i) => ({ at: +(0.2 + i * 0.36).toFixed(2), dur: 0.34, w }));
const base = { titolo: 'Banco di prova', tavola: '', soggetto: 'BANCO', flickers: [], sponsor: null, parole, fps: 30 };
const volto = (start, end, extra = {}) => ({ file: 'banco_volto.mp4', start, end, ...extra });
const broll = (start, end) => ({ file: 'banco_broll.mp4', start, end, broll: true, muto: true });
const img = (file, ar) => ({ file, tipo: 'immagine', ar });

export const CASI = {
  Cinematico: {
    id: 'Cinematico',
    piano: () => ({ ...base, clips: [volto(0, 3), broll(0, 3), volto(3, 6), broll(3, 5)],
      keywords: [{ at: 0.5, dur: 2.5, word: 'PRODOTTO X', tag: 'Marca', note: 'il mio preferito' }, { at: 3.6, dur: 2.5, word: '40 €', tag: 'Prezzo' },
        { at: 8.6, dur: 2.4, word: '2 settimane', tag: 'Batteria', note: 'con una carica' }] }),
    secondi: [1.5, 2.6, 4.5, 7, 9.5],
  },
  Kal: {
    id: 'Kal',
    piano: () => ({ ...base, clips: [volto(0, 3.4), broll(0, 3), volto(3.4, 6.4, { inserto: img('banco_img_q.jpg', 1) }), volto(6.4, 10)],
      keywords: [{ at: 0.4, dur: 2.4, word: 'PRODOTTO X', note: 'Pro' }, { at: 7, dur: 2.4, word: 'DUE SETTIMANE', note: 'davvero' }] }),
    secondi: [1.4, 2.9, 4.8, 6.8, 8.2],
  },
  Ultra: {
    id: 'SuMisura',
    piano: () => {
      const g = leggiStile(fs.readFileSync(path.join(ROOT, 'scripts', 'banco', 'Ultra.txt'), 'utf8'), 'Ultra');
      const grafica = g.grafica ?? g;
      const p = { ...base, grafica, keywords: [], enfasi: ['prodotto', 'quaranta', 'settimane', 'microfono', 'promosso'],
        clips: [volto(0, 3, { inserto: img('banco_img_q.jpg', 1) }), volto(3, 6, { inserto: img('banco_img_l.jpg', 16 / 9), bn: true }),
          broll(0, 4), volto(6, 9, { inserto: img('banco_img_l.jpg', 16 / 9), bn: true })] };
      const tolti = regolaStile(p, grafica);
      console.log(`[banco] Ultra: il regolatore ha tolto ${tolti.inserti} schede e ${tolti.bn} b/n (attesi 1 e 1)`);
      if (tolti.inserti !== 1 || tolti.bn !== 1) throw new Error('regolatore di Ultra: risultato diverso dal previsto');
      return p;
    },
    secondi: [1.4, 4.2, 7.5, 11, 12.6],
  },
};

function main() {
  const scelti = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CASI);
  preparaMedia();
  fs.mkdirSync(OUT, { recursive: true });
  const fogli = [];
  let rotti = 0;
  for (const nome of scelti) {
    const caso = CASI[nome];
    if (!caso) { console.error(`[banco] stile sconosciuto: ${nome}`); rotti++; continue; }
    const filePiano = path.join(OUT, `${nome}.json`);
    const foglio = path.join(OUT, `${nome}.jpg`);
    try {
      fs.writeFileSync(filePiano, JSON.stringify(caso.piano()));
      execFileSync('node', [path.join(ROOT, 'scripts', 'fotogrammi.mjs'), caso.id, filePiano, foglio, ...caso.secondi.map(String)], { stdio: 'inherit', env: { ...process.env, SCALA: process.env.SCALA || '0.4' } });
      fogli.push(foglio);
    } catch (e) { console.error(`[banco] ${nome} ROTTO: ${String(e.message).split('\n')[0]}`); rotti++; }
  }
  if (fogli.length) {
    const tutti = path.join(OUT, 'banco.jpg');
    // uno sotto l'altro, nello stesso ordine (Cinematico, Kal, Ultra): stessa larghezza, 5 fotogrammi ciascuno
    if (fogli.length === 1) fs.copyFileSync(fogli[0], tutti);
    else ff(...fogli.flatMap((f) => ['-i', f]), '-filter_complex', `${fogli.map((_, i) => `[${i}:v]`).join('')}vstack=inputs=${fogli.length}`, '-q:v', '3', tutti);
    console.log(`[banco] foglio: ${tutti}`);
  }
  if (rotti) { console.error(`[banco] ${rotti} stili rotti`); process.exit(1); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(ROOT, 'scripts', 'banco.mjs')) main();
