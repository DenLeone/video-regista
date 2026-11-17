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
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const QUI = path.dirname(fileURLToPath(import.meta.url));
const MOTION = path.join(QUI, '..', 'motion');
export const MODELLI = {
  luce: { pagina: 'luce.html', nome: '✨ Logo che si accende' },
  intro: { pagina: 'luce.html', nome: '⚡ Intro in una lama di luce' },
  codice: { pagina: 'codice.html', nome: '💻 Dal codice al logo' },
  titolo: { pagina: 'titolo.html', nome: '🔤 Titolo animato' },
};

// testi puliti e corti: entrano nello schermo e non rompono il codice delle pagine
const riga = (s, max) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
export function parametri({ modello, testi, formato }) {
  if (!MODELLI[modello]) throw new Error(`modello sconosciuto: ${modello}`);
  let t = testi;
  if (typeof t === 'string') { try { t = JSON.parse(t || '{}'); } catch { t = { testo: t }; } }
  const testo = riga(t?.testo, modello === 'titolo' ? 60 : 28);
  if (!testo) throw new Error('manca il testo');
  return { modello, testo, sotto: riga(t?.sotto, 40), invito: modello === 'luce' ? riga(t?.invito, 48) : '', formato: formato === 'orizzontale' ? 'orizzontale' : 'verticale' };
}

const CANDIDATI = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', 'C:/Program Files/Google/Chrome/Application/chrome.exe'];
const trovaChrome = () => [process.env.CHROME, ...CANDIDATI].find((p) => p && fs.existsSync(p));
const aspetta = (ms) => new Promise((r) => setTimeout(r, ms));

// una pagina servita in locale (font e script si caricano come su un sito), una scheda di Chrome pilotata via DevTools
async function apri(dir, pagina, query) {
  const TIPI = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2' };
  const server = http.createServer((req, res) => {
    const f = path.join(dir, decodeURIComponent(req.url.split('?')[0]));
    if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TIPI[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const chrome = trovaChrome();
  if (!chrome) throw new Error('Chrome non trovato (variabile CHROME)');
  const profilo = fs.mkdtempSync(path.join(os.tmpdir(), 'motion-chrome-'));
  const proc = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--mute-audio', '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-component-update', '--disable-sync', '--remote-debugging-port=0',
    `--user-data-dir=${profilo}`, 'about:blank'], { stdio: 'ignore' });
  let porta;
  for (let i = 0; i < 150 && !porta; i++) { await aspetta(100); try { porta = fs.readFileSync(path.join(profilo, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch { /* non ancora */ } }
  if (!porta) throw new Error('Chrome non è partito');
  const schede = await (await fetch(`http://127.0.0.1:${porta}/json`)).json();
  const ws = new WebSocket(schede.find((s) => s.type === 'page').webSocketDebuggerUrl);
  await new Promise((ok, ko) => { ws.onopen = ok; ws.onerror = () => ko(new Error('DevTools non risponde')); });
  let id = 0; const attese = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (attese.has(m.id)) { attese.get(m.id)(m); attese.delete(m.id); } };
  const manda = (method, params = {}) => new Promise((ok) => { const n = ++id; attese.set(n, ok); ws.send(JSON.stringify({ id: n, method, params })); });
  const valuta = async (codice) => {
    const m = await manda('Runtime.evaluate', { expression: codice, awaitPromise: true, returnByValue: true });
    if (m.result?.exceptionDetails) throw new Error(`errore nella pagina: ${JSON.stringify(m.result.exceptionDetails).slice(0, 300)}`);
    return m.result?.result?.value;
  };
  await manda('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/${pagina}?${query}` });
  for (let i = 0; i < 100; i++) { await aspetta(200); if (await valuta('typeof window.renderAt === "function" && window.ready !== undefined').catch(() => false)) break; }
  await valuta('Promise.resolve(window.ready).then(() => true)');
  const chiudi = async () => {
    try { ws.close(); } catch { /* già chiuso */ }
    const uscito = new Promise((ok) => proc.once('exit', ok)); proc.kill(); await Promise.race([uscito, aspetta(3000)]); server.close();
    try { fs.rmSync(profilo, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* resta nella cartella temporanea */ }
  };
  return { valuta, chiudi };
}

export async function renderMotion({ modello, testi, formato, qualita = '1080', uscita, fps = 30 }) {
  const p = parametri({ modello, testi, formato });
  const scala = qualita === '4k' ? 2 : 1;
  // copia di lavoro dei modelli + i parametri di questo giro
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'motion-'));
  fs.cpSync(MOTION, dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'params.js'), `window.PARAMS = ${JSON.stringify(p)};\n`);
  const t0 = Date.now();
  const { valuta, chiudi } = await apri(dir, MODELLI[modello].pagina, `t=0&scala=${scala}`);
  try {
    const durata = await valuta('window.TOTAL'), n = Math.round(durata * fps);
    fs.mkdirSync(path.dirname(path.resolve(uscita)), { recursive: true });
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', scala === 2 ? '16' : '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.resolve(uscita)], { stdio: ['pipe', 'ignore', 'inherit'] });
    const fine = new Promise((ok, ko) => ff.on('close', (c) => (c === 0 ? ok() : ko(new Error('ffmpeg non ha creato il video')))));
    for (let f = 0; f < n; f++) {
      const b64 = await valuta(`(async () => { await renderAt(${f / fps}); return document.getElementById('c').toDataURL('image/jpeg', 0.95).split(',')[1]; })()`);
      if (!ff.stdin.write(Buffer.from(b64, 'base64'))) await new Promise((ok) => ff.stdin.once('drain', ok));
      if (f % (fps * 2) === 0) console.log(`motion: ${f}/${n} fotogrammi`);
    }
    ff.stdin.end(); await fine;
    const minuti = Math.round((Date.now() - t0) / 6000) / 10;
    console.log(`motion: ${modello} · ${p.formato} · ${qualita} · ${durata}s · ${minuti} min`);
    return { durata, minuti, parametri: p };
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
    else {
      const r = await renderMotion({ modello: e.MODELLO, testi: e.TESTI, formato: e.FORMATO, qualita: e.QUALITA, uscita: e.USCITA });
      if (e.GITHUB_OUTPUT) fs.appendFileSync(e.GITHUB_OUTPUT, `durata=${r.durata}\nminuti=${r.minuti}\n`);
    }
  } catch (err) { console.error(`motion: ${err.message}`); process.exit(1); }
}
