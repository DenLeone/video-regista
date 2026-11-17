// ✨ Motion da Telegram (17/11): loghi animati, intro, «dal codice al logo» e titoli, scritti in codice
// (motion/*.html) e trasformati in MP4 da Chrome + ffmpeg. Niente AI: i modelli sono già pronti, cambiano
// solo testi e formato, quindi nessun credito. Chrome lo pilotiamo direttamente (protocollo DevTools):
// nessun pacchetto in più.
//
//   MODELLO=luce|intro|codice|titolo  TESTI='{"testo":"…","sotto":"…","invito":"…"}'
//   FORMATO=verticale|orizzontale  QUALITA=1080|4k  USCITA=out/motion/x.mp4  node scripts/motion.mjs
//
// Repo pubblico: nel log solo modello, formato e tempi, mai i testi.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { apri } from './motion-chrome.mjs';
import { fileURLToPath } from 'node:url';

const QUI = path.dirname(fileURLToPath(import.meta.url));
const MOTION = path.join(QUI, '..', 'motion');
export const MODELLI = {
  luce: { pagina: 'luce.html', nome: '✨ Logo che si accende' },
  intro: { pagina: 'luce.html', nome: '⚡ Intro in una lama di luce' },
  codice: { pagina: 'codice.html', nome: '💻 Dal codice al logo' },
  titolo: { pagina: 'titolo.html', nome: '🔤 Titolo animato' },
  numero: { pagina: 'numero.html', nome: '🔢 Numero che sale' },
  idea: { pagina: 'idea.html', nome: '✍️ Idea tua (scritta dall\'AI)' },
};

// testi puliti e corti: entrano nello schermo e non rompono il codice delle pagine
const riga = (s, max) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
export function parametri({ modello, testi, formato }) {
  if (!MODELLI[modello]) throw new Error(`modello sconosciuto: ${modello}`);
  let t = testi;
  if (typeof t === 'string') { try { t = JSON.parse(t || '{}'); } catch { t = { testo: t }; } }
  if (modello === 'idea') {
    const prompt = String(t?.testo ?? '').replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').trim().slice(0, 1500);
    if (!prompt) throw new Error('manca la descrizione');
    return { modello, testo: prompt, correzione: riga(t?.correzione, 600), base: String(t?.base || '').slice(0, 60000), formato: formato === 'orizzontale' ? 'orizzontale' : 'verticale' };
  }
  const testo = riga(t?.testo, modello === 'titolo' ? 60 : 28);
  if (!testo) throw new Error('manca il testo');
  return { modello, testo, sotto: riga(t?.sotto, 40), invito: modello === 'luce' ? riga(t?.invito, 48) : '', formato: formato === 'orizzontale' ? 'orizzontale' : 'verticale',
    ...(t?.trasparente ? { trasparente: true } : {}) };
}

export async function renderMotion({ modello, testi, formato, qualita = '1080', uscita, fps = 30, html = null, alfa = false }) {
  const p = html ? { modello, formato: formato === 'orizzontale' ? 'orizzontale' : 'verticale', ...(alfa ? { trasparente: true } : {}) } : parametri({ modello, testi: alfa ? { ...(typeof testi === 'string' ? JSON.parse(testi) : testi), trasparente: true } : testi, formato });
  const scala = qualita === '4k' ? 2 : 1;
  // copia di lavoro dei modelli + i parametri di questo giro
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'motion-'));
  fs.cpSync(MOTION, dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'params.js'), `window.PARAMS = ${JSON.stringify(p)};\n`);
  if (html) fs.writeFileSync(path.join(dir, MODELLI[modello].pagina), html);
  const t0 = Date.now();
  const { valuta, chiudi } = await apri(dir, MODELLI[modello].pagina, `t=0&scala=${scala}`);
  try {
    const durata = await valuta('window.TOTAL'), n = Math.round(durata * fps);
    fs.mkdirSync(path.dirname(path.resolve(uscita)), { recursive: true });
    const codifica = alfa ? ['-c:v', 'qtrle', '-pix_fmt', 'argb'] : ['-c:v', 'libx264', '-preset', 'medium', '-crf', scala === 2 ? '16' : '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', alfa ? 'png' : 'mjpeg', '-i', '-',
      ...codifica, path.resolve(uscita)], { stdio: ['pipe', 'ignore', 'inherit'] });
    const tipo = alfa ? "'image/png'" : "'image/jpeg', 0.95";
    const fine = new Promise((ok, ko) => ff.on('close', (c) => (c === 0 ? ok() : ko(new Error('ffmpeg non ha creato il video')))));
    for (let f = 0; f < n; f++) {
      const b64 = await valuta(`(async () => { await renderAt(${f / fps}); return document.getElementById('c').toDataURL(${tipo}).split(',')[1]; })()`);
      if (!ff.stdin.write(Buffer.from(b64, 'base64'))) await new Promise((ok) => ff.stdin.once('drain', ok));
      if (f % (fps * 2) === 0) console.log(`motion: ${f}/${n} fotogrammi`);
    }
    ff.stdin.end(); await fine;
    const minuti = Math.round((Date.now() - t0) / 6000) / 10;
    console.log(`motion: ${modello} · ${p.formato} · ${qualita} · ${durata}s · ${minuti} min`);
    return { durata, minuti, parametri: { modello: p.modello, formato: p.formato } };
  } finally { await chiudi(); fs.rmSync(dir, { recursive: true, force: true }); }
}

// fermi immagine (per controllare un modello senza fare il video)
export async function proveMotion({ modello, testi, formato, tempi, cartella }) {
  const p = parametri({ modello, testi, formato });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'motion-'));
  fs.cpSync(MOTION, dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'params.js'), `window.PARAMS = ${JSON.stringify(p)};\n`);
  const { valuta, chiudi } = await apri(dir, MODELLI[modello].pagina, 't=0&scala=1');
  try {
    fs.mkdirSync(cartella, { recursive: true });
    for (const t of tempi) {
      const b64 = await valuta(`(async () => { await renderAt(${t}); return document.getElementById('c').toDataURL('image/jpeg', 0.9).split(',')[1]; })()`);
      fs.writeFileSync(path.join(cartella, `${modello}-${p.formato}-${t.toFixed(2).padStart(5, '0')}.jpg`), Buffer.from(b64, 'base64'));
    }
  } finally { await chiudi(); fs.rmSync(dir, { recursive: true, force: true }); }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const e = process.env;
  try {
    if (e.PROVE) await proveMotion({ modello: e.MODELLO, testi: e.TESTI, formato: e.FORMATO, tempi: e.PROVE.split(',').map(Number), cartella: e.USCITA });
    else if (e.MODELLO === 'idea') {
      const { creaIdea } = await import('./motion-ai.mjs');
      const p = parametri({ modello: 'idea', testi: e.TESTI, formato: e.FORMATO });
      const idea = await creaIdea({ prompt: p.testo, correzione: p.correzione, base: p.base, formato: p.formato });
      fs.mkdirSync(path.dirname(path.resolve(e.USCITA)), { recursive: true });
      fs.writeFileSync(e.USCITA.replace(/\.mp4$/i, '.html'), idea.html);
      fs.writeFileSync(e.USCITA.replace(/\.mp4$/i, '.js'), idea.codice);
      const r = await renderMotion({ modello: 'idea', formato: p.formato, qualita: e.QUALITA, uscita: e.USCITA, html: idea.html });
      if (e.GITHUB_OUTPUT) fs.appendFileSync(e.GITHUB_OUTPUT, `durata=${r.durata}\nminuti=${r.minuti}\ntentativi=${idea.tentativi}\n`);
    } else {
      const r = await renderMotion({ modello: e.MODELLO, testi: e.TESTI, formato: e.FORMATO, qualita: e.QUALITA, uscita: e.USCITA });
      if (e.GITHUB_OUTPUT) fs.appendFileSync(e.GITHUB_OUTPUT, `durata=${r.durata}\nminuti=${r.minuti}\n`);
    }
  } catch (err) { console.error(`motion: ${err.message}`); process.exit(1); }
}
