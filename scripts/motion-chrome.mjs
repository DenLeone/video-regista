// Motion · Chrome pilotato via DevTools (senza pacchetti): una pagina servita in locale, valuta codice nella scheda.
// Lo usano scripts/motion.mjs (render) e scripts/motion-ai.mjs (prove delle animazioni scritte dall'AI).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';

const CANDIDATI = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', 'C:/Program Files/Google/Chrome/Application/chrome.exe'];
const trovaChrome = () => [process.env.CHROME, ...CANDIDATI].find((p) => p && fs.existsSync(p));
const aspetta = (ms) => new Promise((r) => setTimeout(r, ms));

// una pagina servita in locale (font e script si caricano come su un sito), una scheda di Chrome pilotata via DevTools
export async function apri(dir, pagina, query) {
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
