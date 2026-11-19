// ✨ Ultron 2 + Black Den Motion (18/11, Denis: «grafiche create perfettamente, con sfx e 3D vero, ultra precise»).
// L'animazione speciale di Ultron non si scrive più da zero: Claude compone una scena con il motore della skill
// Black Den Motion (motion/bdm: preset provati, 3D con three.js, effetti sonori sincronizzati al fotogramma).
// La scena vive in una FASCIA trasparente sopra la testa (1080×700 in verticale), poi si sovrappone al video:
// non può mai finire sulla faccia o sui sottotitoli. Prima di usarla:
//   1) prova in Chrome: errori, fotogrammi vuoti o fermi, testi fuori dalla fascia o sovrapposti (misurati sul DOM);
//   2) revisione: Claude guarda 6 fotogrammi messi sopra il video vero e corregge (una volta);
//   3) render con trasparenza (qtrle) + i suoni della scena in un .wav (motion/bdm/cue_wav.py).
// Repo pubblico: nel log solo tempi e conteggi, mai i testi.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const QUI = path.dirname(fileURLToPath(import.meta.url));
const MOTION = path.join(QUI, '..', 'motion');
const BDM = path.join(MOTION, 'bdm');
const log = (...a) => console.log('bdm:', ...a);
const aspetta = (ms) => new Promise((r) => setTimeout(r, ms));

// fascia sopra la testa: verticale 1080×700 (y 60–760 sul video 1080×1920), orizzontale 1920×470 (y 40–510)
export const FASCIA = { verticale: { w: 1080, h: 700, y: 60 }, orizzontale: { w: 1920, h: 470, y: 40 } };

/* ---------- la guida per Claude ---------- */
// 19/11: la skill Black Den Motion sta nel repo (.claude/skills/blackden-motion): le sue regole di regia entrano nella
// guida (per Claude e per Gemini), e Claude può leggere la skill intera e le scene fatte a mano migliori
const SKILL = path.join(QUI, '..', '.claude', 'skills', 'blackden-motion');
const REGIA = (() => { try { return fs.readFileSync(path.join(SKILL, 'references', 'regia.md'), 'utf8').slice(0, 4000); } catch { return ''; } })();
const ESEMPI_CLAUDE = `\n\nYou may Read (only to learn, never to copy whole): .claude/skills/blackden-motion/SKILL.md, its references/ and esempi/, and the best hand-made scenes in this repo: motion/scene/skill-vinile.js (3D vinyl, one camera curve, transformations) and motion/scene/prodotto-3d.js (product card). In those files DATI, M3.R and THREE are available; here use only the API above.`;
export const GUIDA = ({ w, h, dur, media = [] }) => `You are a senior motion designer. You write ONE short animation for a viral vertical video (TikTok/Reels)
of an Italian tech creator, using the Black Den Motion engine (already loaded: globals M, P, add, M3).
The animation plays on a TRANSPARENT band ${w}×${h} px placed above the creator's head: everything you draw must stay inside
x 0–${w}, y 0–${h}, and the background must stay transparent (the video shows through). Duration: exactly ${dur} s.

Return ONLY a JavaScript code block (\`\`\`js … \`\`\`), no HTML. The code runs inside an async module after M3.init
(if you use 3D) and must end with nothing (the page calls M3.boot()/M.boot() itself). Set nothing in M.META.

## Engine (2D, HTML elements — crisp text)
- M.el(tag, {id, cls, text, html, src, style, parent}) creates an element inside #content (absolute positioning: use style
  {left, top, width, fontSize…} in px, or cls 'abs row' for a full-width centred row with style {top}).
- add(...tracks) registers animation. Keyframe track: { el: '#id', keys: [ {t, x, y, s, r, rx, ry, o, blur, clip, clipY, ls, glow, ease} ] }
  (ease: linear | in | out | inOut | expoOut | expoInOut | back; ease applies to the segment ARRIVING at that key).
- Function track: { fn: t => { … } } — deterministic only (no Math.random, no timers, no CSS animation/transition).
- Classes: .h1 .h2 .h3 (titles), .sub (small caps), .txt, .accent (accent colour), .row, .abs. CSS vars: --accent #FF6A13, --accent2 #FFD39A, --fg #fff, --panel.
- Presets (each returns tracks for add): P.enter(sel,{t,dur,from:'up'|'down'|'left'|'right'|'scale'|'blur'|'pop',out,outDur}),
  P.lettersIn(sel,{t,step,dur,from,out}), P.wordsIn(sel,{t,step,dur,from,out}), P.reveal(sel,{t,dur,dir:'x'|'y',out}),
  P.decode(sel,{t,dur,seed}), P.typewriter(sel,{t,cps,cursor,hideCursorAfter}), P.counter(sel,{t,dur,from,to,decimals,prefix,suffix}),
  P.glitch(sel,{t,dur,seed,amount}), P.punch(t,{amount,dur}), P.drift({from,to}), P.lowerThird({title,sub,t,hold,x,y}),
  P.logoReveal({t,src,text,y,size,lines,out}), P.phone({t,hold,src,x,y,w}).
  NEVER use P.flash or P.particles (they paint the whole band). Presets add their own sound effects (whoosh, ticks, impact…).
- Extra sound: M.sfx(t, 'whoosh'|'swipe'|'riser'|'impact'|'hit'|'shimmer'|'data'|'type'|'tick'|'ding'|'success'|'pop'|'click'|'glitch', {gain}).
  Max one strong sound every 0.3 s.

## Engine (3D, real three.js — already initialised for this band, transparent, one key light)
- M3.D = camera distance where 1 unit = 1 px at z = 0. Band centre = (0,0); y up is positive (top of band = +${Math.round(h / 2)}).
- M3.card({src, ui:'grafico'|'chat'|'lista', w, h, r, spessore, x, y, z, rx, ry, rz, s, trasparente}) → rounded card with thickness
  (screenshot/logo with src; trasparente:true for a PNG logo without a slab). Keep cards ≤ ${Math.round(w * 0.8)} wide, ≤ ${Math.round(h * 0.75)} tall at z = 0.
- M3.anim(obj, [{t, x, y, z, rx, ry, rz, s, o, ease}]) (degrees), M3.riflesso(card, t, dur) (light sweep + shimmer sound),
  M3.oscilla(obj, {ampiezza, velocita, fase}), M3.camera([{pos:[x,y,z], guarda:[x,y,z]}, …], {da, a, ease}) one continuous curve.
- Use 3D when it makes the idea more striking (a logo or screenshot flying in, turning, stacking); text stays in HTML on top.

## Files you may use (in assets/): ${media.length ? media.map((m) => `assets/${m}`).join(', ') : 'none'}
Use real logos/screenshots from this list when the idea mentions them. Never draw brand logos from memory.

## Direction rules (they matter more than anything)
- Every shot TRANSFORMS into the next (a shape becomes the next shape) — no cross-dissolves between unrelated things.
- The subject is centred; something always moves (a slow drift is enough); motion never reverses direction.
- Fast in (0.3–0.6 s), then hold long enough to read; exit in the last 0.35 s (the overlay fades out anyway).
- Text: big, bold, max 5 words per line, max 2 lines, Italian, inside the band with 40 px margins. Only facts given in the request.
  Width budget (.row is nowrap!): .h1 (128px) fits ~${Math.floor((w - 80) / 80)} characters per line, .h2 (84px) ~${Math.floor((w - 80) / 52)}, .h3 (56px) ~${Math.floor((w - 80) / 35)}. Longer → smaller class or set style.fontSize, or split in two rows.
- Contrast on video: white text with the accent colour on the key word; add text-shadow 0 4px 18px rgba(0,0,0,.75) to text.
- Never overlap two readable texts at the same time. Nothing outside the band. Nothing covers the whole band with a solid colour.
${REGIA ? `\n## Black Den Motion direction rules (from the skill, Italian)\n${REGIA}` : ''}`;

/* ---------- la pagina ---------- */
export function pagina(codice, { w, h, dur, tre }) {
  const corpo = tre
    ? `<script type="importmap">{ "imports": { "three": "./vendor/three.module.min.js", "three/addons/": "./vendor/addons/" } }</script>
<script src="brand.js"></script><script src="motion.js"></script>
<script type="module">
import './motion3d.js';
const { P, add } = M;
M.META = { width: ${w}, height: ${h}, fps: 30, duration: ${dur} };
M3.init({ fov: 35, bg: null, nebbia: false, fuoco: false, bagliore: false, esposizione: 1.25, ambiente: 0.6 });
try {
${codice}
} catch (e) { window.__errore = String(e && e.stack || e); }
M3.boot();
</script>`
    : `<script src="brand.js"></script><script src="motion.js"></script>
<script>
const { P, add } = M;
M.META = { width: ${w}, height: ${h}, fps: 30, duration: ${dur} };
try {
${codice}
} catch (e) { window.__errore = String(e && e.stack || e); }
M.boot();
</script>`;
  return `<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><style>
  #stage{background:transparent!important} html,body{background:transparent!important}
  .h1,.h2,.h3,.txt,.sub{text-shadow:0 4px 18px rgba(0,0,0,.75)}
</style></head><body>
<div id="stage"><div id="camera"><div id="bg"></div><div id="punch"><div id="content"></div></div></div><div id="fx"></div></div>
${corpo}
</body></html>`;
}
export const usa3D = (codice) => /\bM3\./.test(codice);
export function estraiCodice(testo) {
  const m = /```(?:js|javascript)?\s*\n([\s\S]*?)```/.exec(String(testo || ''));
  const c = (m ? m[1] : String(testo || '')).trim();
  if (!c || c.length < 40) throw new Error('nessun codice nella risposta');
  if (/<\/?script|<html/i.test(c)) throw new Error('il codice contiene HTML: serve solo JavaScript');
  if (/Math\.random|setTimeout|setInterval|requestAnimationFrame/.test(c)) throw new Error('niente Math.random, timer o requestAnimationFrame: usa M.rand(seed) e le tracce');
  if (/P\.(flash|particles)\s*\(/.test(c)) throw new Error('P.flash e P.particles non si usano nella fascia');
  return c;
}

/* ---------- Chrome (DevTools) ---------- */
const CANDIDATI = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
function trovaChrome() {
  const c = [process.env.CHROME, ...CANDIDATI].find((p) => p && fs.existsSync(p));
  if (c) return c;
  for (const base of [path.join(process.cwd(), 'node_modules', '.remotion'), '/opt/regista-npm/node_modules/.remotion']) {
    if (!fs.existsSync(base)) continue;
    const pila = [base];
    while (pila.length) {
      const d = pila.pop();
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const f = path.join(d, e.name);
        if (e.isDirectory()) pila.push(f); else if (e.name === 'chrome-headless-shell') return f;
      }
    }
  }
  return null;
}

// cartella di lavoro: motore, three.js, font, assets, la pagina
export function preparaCartella(codice, opz, media = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bdm-'));
  for (const f of ['motion.js', 'motion3d.js', 'brand.js']) fs.copyFileSync(path.join(BDM, f), path.join(dir, f));
  fs.cpSync(path.join(BDM, 'vendor'), path.join(dir, 'vendor'), { recursive: true });
  fs.cpSync(path.join(MOTION, 'fonts'), path.join(dir, 'fonts'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'assets'));
  for (const m of media) if (fs.existsSync(m.file)) fs.copyFileSync(m.file, path.join(dir, 'assets', m.nome));
  fs.writeFileSync(path.join(dir, 'scena.html'), pagina(codice, { ...opz, tre: usa3D(codice) }));
  return dir;
}

export async function apriScena(dir, { w, h }) {
  const TIPI = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
  const server = http.createServer((req, res) => {
    const f = path.join(dir, decodeURIComponent(req.url.split('?')[0]));
    if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TIPI[path.extname(f).toLowerCase()] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const chrome = trovaChrome();
  if (!chrome) throw new Error('Chrome non trovato (variabile CHROME)');
  const profilo = fs.mkdtempSync(path.join(os.tmpdir(), 'bdm-chrome-'));
  // WebGL per il 3D: SwiftShader (sui computer di GitHub non c'è la scheda video)
  const proc = spawn(chrome, ['--headless=new', '--no-sandbox', '--hide-scrollbars', '--mute-audio', '--no-first-run', '--no-default-browser-check',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-background-networking', '--disable-component-update',
    '--remote-debugging-port=0', `--user-data-dir=${profilo}`, 'about:blank'], { stdio: 'ignore' });
  let porta;
  for (let i = 0; i < 150 && !porta; i++) { await aspetta(100); try { porta = fs.readFileSync(path.join(profilo, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch { /* non ancora */ } }
  if (!porta) throw new Error('Chrome non è partito');
  const schede = await (await fetch(`http://127.0.0.1:${porta}/json`)).json();
  const ws = new WebSocket(schede.find((s) => s.type === 'page').webSocketDebuggerUrl);
  await new Promise((ok, ko) => { ws.onopen = ok; ws.onerror = () => ko(new Error('DevTools non risponde')); });
  let id = 0; const attese = new Map(); const errori = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (attese.has(m.id)) { attese.get(m.id)(m); attese.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errori.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'errore');
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errori.push(m.params.args.map((a) => a.value || a.description).join(' '));
  };
  const manda = (method, params = {}) => new Promise((ok) => { const n = ++id; attese.set(n, ok); ws.send(JSON.stringify({ id: n, method, params })); });
  const valuta = async (codice) => {
    const m = await manda('Runtime.evaluate', { expression: codice, awaitPromise: true, returnByValue: true });
    if (m.result?.exceptionDetails) throw new Error(`errore nella pagina: ${(m.result.exceptionDetails.exception?.description || m.result.exceptionDetails.text || '').slice(0, 300)}`);
    return m.result?.result?.value;
  };
  await manda('Runtime.enable');
  await manda('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await manda('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  await manda('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/scena.html?render=1&alpha=1` });
  for (let i = 0; i < 150; i++) { await aspetta(200); if (await valuta('typeof window.__seek === "function" || !!window.__errore').catch(() => false)) break; }
  const errPagina = await valuta('window.__errore || null');
  if (errPagina) errori.push(errPagina);
  await valuta('Promise.resolve(window.__ready).then(() => true)').catch((e) => errori.push(e.message));
  const foto = async (t) => {
    await valuta(`window.__seek(${t})`);
    const r = await manda('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: w, height: h, scale: 1 } });
    return Buffer.from(r.result.data, 'base64');
  };
  // testi visibili a t: rettangoli (per «fuori dalla fascia» e «testi sovrapposti»)
  const testi = (t) => valuta(`(() => { window.__seek(${t}); const out = [];
    for (const el of document.querySelectorAll('#content *')) {
      if (el.children.length && [...el.children].some((c) => c.textContent.trim())) continue;
      const tx = el.textContent.trim(); if (!tx) continue;
      let o = 1, e = el; while (e && e.id !== 'stage') { const cs = getComputedStyle(e); o *= +cs.opacity; if (cs.visibility === 'hidden' || cs.display === 'none') o = 0; e = e.parentElement; }
      if (o < 0.35) continue;
      const rg = document.createRange(); rg.selectNodeContents(el); const r = rg.getBoundingClientRect(); if (r.width < 4 || r.height < 4) continue;
      out.push({ x: r.left, y: r.top, w: r.width, h: r.height, n: tx.length });
    } return out; })()`);
  const chiudi = async () => {
    try { ws.close(); } catch { /* già chiuso */ }
    const uscito = new Promise((ok) => proc.once('exit', ok)); proc.kill(); await Promise.race([uscito, aspetta(3000)]); server.close();
    try { fs.rmSync(profilo, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temporanea */ }
  };
  return { valuta, foto, testi, chiudi, errori };
}

/* ---------- prova ---------- */
const TEMPI = [0.12, 0.28, 0.45, 0.62, 0.8, 0.94];
const copertura = (png, dir, i) => {
  const f = path.join(dir, `s${i}.png`); fs.writeFileSync(f, png);
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', f, '-vf', 'alphaextract,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-', '-f', 'null', '-'], { encoding: 'utf8' });
  return Number((/YAVG=([\d.]+)/.exec(r.stdout || '') || [])[1] || 0) / 255;
};
// regole misurate: errori, fascia vuota o piena, niente che si muove, testi fuori dalla fascia o uno sopra l'altro
export function giudica({ errori, coperture, uguali, rettangoli, w, h }) {
  if (errori.length) return `errore JavaScript: ${errori[0].slice(0, 300)}`;
  if (coperture.every((c) => c < 0.004)) return 'non si vede niente: la fascia è vuota in tutti i fotogrammi';
  if (coperture.some((c) => c > 0.85)) return 'un fotogramma copre quasi tutta la fascia con un colore pieno: lascia trasparente lo sfondo';
  if (uguali) return 'i fotogrammi sono tutti uguali: l\'animazione non si muove';
  // primo e ultimo fotogramma sono entrate/uscite (scale, scivolate): lì un testo può sbordare per un attimo.
  // Nei fotogrammi in mezzo, quando si legge, deve stare dentro (un testo in uscita può sbordare del 30% della sua altezza)
  for (const [i, rs] of rettangoli.entries()) {
    const transizione = i === 0 || i === rettangoli.length - 1;
    for (const r of rs) {
      if (transizione) continue;
      const fuori = [r.x < -2 && `a sinistra di ${Math.round(-r.x)} px`, r.x + r.w > w + 2 && `a destra di ${Math.round(r.x + r.w - w)} px`,
        r.y < -0.3 * r.h && `sopra di ${Math.round(-r.y)} px`, r.y + r.h > h + 0.3 * r.h && `sotto di ${Math.round(r.y + r.h - h)} px`].filter(Boolean);
      if (fuori.length) return `un testo largo ${Math.round(r.w)} px esce dalla fascia ${fuori.join(', ')} (fotogramma ${i + 1} di ${rettangoli.length}): rimpiccioliscilo (font più piccolo, meno parole per riga) o spostalo dentro ${w}×${h}`;
    }
    for (let a = 0; a < rs.length; a++) for (let b = a + 1; b < rs.length; b++) {
      const A = rs[a], B = rs[b];
      const ix = Math.max(0, Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x)), iy = Math.max(0, Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y));
      if (ix * iy > 0.2 * Math.min(A.w * A.h, B.w * B.h) && A.n > 1 && B.n > 1) return `due testi si sovrappongono (fotogramma ${i + 1}): separali nel tempo o nello spazio`;
    }
  }
  return null;
}

export async function prova(codice, opz, media) {
  const dir = preparaCartella(codice, opz, media);
  const s = await apriScena(dir, opz);
  try {
    const png = [], coperture = [], rettangoli = [];
    for (const [i, f] of TEMPI.entries()) {
      const t = +(opz.dur * f).toFixed(3);
      png.push(await s.foto(t)); coperture.push(copertura(png[i], dir, i));
      rettangoli.push(await s.testi(t).catch(() => []));
    }
    const uguali = png.every((p) => p.equals(png[0]));
    const errore = giudica({ errori: s.errori, coperture, uguali, rettangoli, w: opz.w, h: opz.h });
    return { errore, fotogrammi: png, dir };
  } finally { await s.chiudi(); }
}

/* ---------- Claude ---------- */
function claudePronto() {
  if (!process.env.CLAUDE_CODE_OAUTH_TOKEN) return false;
  const c = spawnSync('claude', ['--version'], { encoding: 'utf8' });
  if (!c.error && c.status === 0) return true;
  return spawnSync('npm', ['install', '-g', '@anthropic-ai/claude-code'], { encoding: 'utf8', timeout: 180_000 }).status === 0;
}
function claude(testo, { strumenti = '', cwd } = {}) {
  const args = ['-p', 'Follow the instructions received in input.', '--model', process.env.MOTION_CLAUDE || 'sonnet', '--output-format', 'json'];
  if (strumenti) args.push('--allowedTools', strumenti);
  const r = spawnSync('claude', args, { encoding: 'utf8', input: testo, cwd, timeout: 8 * 60_000, maxBuffer: 1 << 26 });
  let j = {};
  try { j = JSON.parse(r.stdout || '{}'); } catch { /* non JSON */ }
  if (r.status !== 0 || j.is_error || !j.result) {
    // token scaduti o limite dell'abbonamento: lo dico nel log (senza testi del video) e si passa a Gemini
    const motivo = /limit|quota|usage|credit|expired|unauthori|401|login/i.test(`${j.result || ''} ${r.stderr || ''}`) ? 'limite o token scaduto' : `uscita ${r.status}`;
    throw new Error(`Claude non ha risposto (${motivo})`);
  }
  return String(j.result);
}

// i 6 fotogrammi messi sopra il video vero (così si vede se copre, se si legge sul fondo vero): griglia 3×2
function griglia(fotogrammi, sfondi, dir, { w, h }) {
  for (const [i, p] of fotogrammi.entries()) fs.writeFileSync(path.join(dir, `g${i}.png`), p);
  const ingressi = [], filtri = [];
  fotogrammi.forEach((_, i) => {
    const sf = sfondi?.[i];
    if (sf && fs.existsSync(sf)) { ingressi.push('-i', sf); } else { ingressi.push('-f', 'lavfi', '-i', `color=c=0x303030:s=${w}x${h}:d=1`); }
    ingressi.push('-i', path.join(dir, `g${i}.png`));
    filtri.push(`[${i * 2}:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}[b${i}];[b${i}][${i * 2 + 1}:v]overlay=0:0,scale=540:-2[c${i}]`);
  });
  const out = path.join(dir, 'griglia.jpg');
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...ingressi, '-filter_complex', `${filtri.join(';')};${fotogrammi.map((_, i) => `[c${i}]`).join('')}xstack=inputs=6:layout=0_0|w0_0|w0+w1_0|0_h0|w0_h0|w0+w1_h0[g]`, '-map', '[g]', '-frames:v', '1', out], { encoding: 'utf8' });
  return r.status === 0 ? out : null;
}

// se Claude cade una volta (token scaduti, limite), per il resto del giro si usa direttamente Gemini
let claudeGiu = false;

// crea la scena: scrive (Claude, poi Gemini se Claude non c'è), prova e corregge (fino a 3 volte), poi una revisione visiva
export async function creaScena({ prompt, dur, formato = 'verticale', media = [], sfondi = null, gemini = null }) {
  const opz = { ...FASCIA[formato], dur };
  const sistema = GUIDA({ ...opz, media: media.map((m) => m.nome) });
  const conClaude = () => !claudeGiu && claudePronto();
  const scrivi = async (testo) => {
    if (conClaude()) { try { return { testo: claude(`${sistema}${ESEMPI_CLAUDE}\n\n---\n\n${testo}`, { strumenti: 'Read', cwd: path.join(QUI, '..') }), chi: 'claude' }; } catch (e) { claudeGiu = true; log(`${e.message}: da qui in avanti Gemini`); } }
    if (!gemini) throw new Error('né Claude né Gemini disponibili');
    const r = await gemini([{ text: testo }], sistema);
    return { testo: r.testo, chi: r.modello };
  };
  const richiesta = `Animation request (Italian, from the video's director): ${prompt}\nDuration: ${dur} s. Band: ${opz.w}×${opz.h}.`;
  let codice = null, ultimo = null, messaggio = richiesta;
  for (let n = 0; n < 3 && !codice; n++) {
    const { testo, chi } = await scrivi(messaggio);
    let c;
    try { c = estraiCodice(testo); } catch (e) { log(`tentativo ${n + 1} (${chi}): ${e.message}`); messaggio = `${richiesta}\n\nYour previous answer was not usable: ${e.message}. Answer again with only the js code block.`; continue; }
    const p = await prova(c, opz, media);
    if (!p.errore) { codice = c; ultimo = p; log(`tentativo ${n + 1} (${chi}): ok${usa3D(c) ? ' · 3D' : ''}`); break; }
    log(`tentativo ${n + 1} (${chi}): da correggere (${p.errore.split(':')[0].slice(0, 60)})`);
    fs.rmSync(p.dir, { recursive: true, force: true });
    messaggio = `${richiesta}\n\nYour program:\n\`\`\`js\n${c}\n\`\`\`\nTesting it in Chrome found this problem: ${p.errore}\nFix it and return the full program.`;
  }
  if (!codice) throw new Error('nessuna scena valida dopo 3 tentativi');
  // revisione visiva: Claude (o Gemini, se Claude è giù) guarda la griglia dei fotogrammi sopra il video vero
  const g = (conClaude() || gemini) ? griglia(ultimo.fotogrammi, sfondi, ultimo.dir, opz) : null;
  if (g) {
    const giudizio = `Judge it as a demanding motion designer for a viral reel: readable on this background? anything cut, overlapping, too small, too empty, ugly, static, off-centre?
If it is already excellent answer exactly OK. Otherwise return the full improved program in one js code block.`;
    const rivedi = async () => {
      const base = `${richiesta}\n\nThis is your program:\n\`\`\`js\n${codice}\n\`\`\`\n`;
      if (conClaude()) {
        try { return claude(`${sistema}\n\n---\n\n${base}Read the image ${g}: 6 frames of it (left→right, top→bottom, start→end) composited over the real video band.\n${giudizio}`, { strumenti: 'Read', cwd: ultimo.dir }); } catch (e) { claudeGiu = true; log(`revisione: ${e.message}, la fa Gemini`); }
      }
      if (!gemini) throw new Error('nessuno per la revisione');
      const r = await gemini([{ text: `${base}The image shows 6 frames of it (left→right, top→bottom, start→end) composited over the real video band.\n${giudizio}` },
        { inline_data: { mime_type: 'image/jpeg', data: fs.readFileSync(g).toString('base64') } }], sistema);
      return r.testo;
    };
    {
      try {
        const testo = await rivedi();
        if (!/^\s*OK\b/i.test(testo)) {
          const c2 = estraiCodice(testo), p2 = await prova(c2, opz, media);
          if (!p2.errore) { fs.rmSync(ultimo.dir, { recursive: true, force: true }); codice = c2; ultimo = p2; log('revisione: migliorata'); } else { fs.rmSync(p2.dir, { recursive: true, force: true }); log('revisione scartata (non passa le prove)'); }
        } else log('revisione: ok');
      } catch (e) { log(`revisione saltata: ${e.message.slice(0, 100)}`); }
    }
  }
  fs.rmSync(ultimo.dir, { recursive: true, force: true });
  return { codice, opz };
}

/* ---------- render ---------- */
// .mov con trasparenza (qtrle) + i suoni della scena in .wav (se c'è numpy); ritorna { mov, wav, durata }
export async function renderScena({ codice, opz, media = [], uscita, fps = 30 }) {
  const dir = preparaCartella(codice, opz, media);
  const s = await apriScena(dir, opz);
  try {
    if (s.errori.length) throw new Error(`errore nella scena: ${s.errori[0].slice(0, 200)}`);
    const n = Math.round(opz.dur * fps);
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-', '-c:v', 'qtrle', '-pix_fmt', 'argb', uscita], { stdio: ['pipe', 'ignore', 'inherit'] });
    const fine = new Promise((ok, ko) => ff.on('close', (c) => (c === 0 ? ok() : ko(new Error('ffmpeg non ha creato la scena')))));
    for (let f = 0; f < n; f++) {
      const png = await s.foto(f / fps);
      if (!ff.stdin.write(png)) await new Promise((ok) => ff.stdin.once('drain', ok));
    }
    ff.stdin.end(); await fine;
    const cues = (await s.valuta('window.__cues || []')) || [];
    let wav = null;
    if (cues.length) {
      fs.writeFileSync(path.join(dir, 'cues.json'), JSON.stringify(cues));
      const w = uscita.replace(/\.mov$/, '.wav');
      const suona = () => spawnSync('python3', [path.join(BDM, 'cue_wav.py'), path.join(dir, 'cues.json'), String(opz.dur), w], { encoding: 'utf8' });
      let r = suona();
      if (r.status !== 0 && /numpy/.test(r.stderr || '')) {
        // i suoni si sintetizzano con numpy: sui computer di GitHub lo installo al primo uso
        for (const extra of [[], ['--user', '--break-system-packages']]) {
          if (spawnSync('python3', ['-m', 'pip', 'install', '--quiet', ...extra, 'numpy'], { encoding: 'utf8', timeout: 180_000 }).status === 0) break;
        }
        r = suona();
      }
      if (r.status === 0) wav = w; else log(`suoni saltati: ${(r.stderr || '').split('\n').filter(Boolean).pop()?.slice(0, 120)}`);
    }
    return { mov: uscita, wav, durata: opz.dur, suoni: cues.length };
  } finally { await s.chiudi(); fs.rmSync(dir, { recursive: true, force: true }); }
}
