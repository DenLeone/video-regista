// ✍️ Motion da una descrizione (17/11): come la skill BlackDen Motion, ma da Telegram e con l'AI gratis.
// 1) Gemini scrive il codice dell'animazione (canvas 2D, attrezzi di motion/motore.js);
// 2) la proviamo davvero in Chrome: errori, schermo vuoto, niente movimento → l'errore torna a Gemini (max 3 giri);
// 3) Gemini GUARDA 6 fotogrammi e corregge quello che non rispetta la richiesta (1 giro di revisione);
// 4) il render lo fa scripts/motion.mjs. Chiave gratuita prima (Pro, poi Flash); a pagamento i modelli di MOTION_MODELLI_PAGAMENTO, poi Flash-Lite.
// Repo pubblico: nel log solo tentativi ed esiti, mai la descrizione né il codice.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { apri } from './motion-chrome.mjs';

const MOTION = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'motion');
const log = (...a) => console.log('motion-ai:', ...a);

export const GUIDA = (formato, trasparente = false) => {
  const oriz = formato === 'orizzontale', W = oriz ? 1920 : 1080, H = oriz ? 1080 : 1920;
  return `You are a senior motion designer who animates in code. Write ONE JavaScript program that draws a short, premium
motion graphic on an HTML canvas, frame by frame, as a pure function of time t (seconds).

CANVAS: ${W}x${H} logical pixels (${oriz ? 'horizontal 16:9' : 'vertical 9:16, for Reels/TikTok'}). It may be rendered at 2x: never use raw pixel sizes
of the real canvas, always the helpers below.

AVAILABLE (already loaded, use them):
- const M = MOTORE, B = BASE; const { cv, ctx, W, H, S } = M.tela(${W}, ${H});  // S = render scale. Call this exactly once at the top.
- M.clamp(v), M.lerp(a,b,k), M.prog(t,a,b) (0→1 between a and b), easings M.outCubic, M.outExpo, M.inCubic, M.inOut, M.sine (k 0→1)
- M.fondo(ctx, cv, {x, y, centro:'#hex', bordo:'#hex'}) dark radial background with one soft light (resets transform)
- M.spinta(ctx, cv, S, t, durata, quanto=0.06, cy=0.47) slow centred camera push: sets the transform ctx uses afterwards (logical units)
- M.parole(ctx, S, 'Text here.', {font:'600 90px Inter', colore:'#fff', x, y, t, da: startTime, passo:0.08, durata:0.5}) word-by-word reveal
- M.linea(ctx, S, cx, y, width, alpha, glow) thin glowing light line
- M.grana(ctx, cv, t) subtle grain, call it LAST every frame
- M.avvia(render, DURATION_SECONDS, [document.fonts.load('600 90px Inter')]) MUST be the last line.
- BASE.argento(ctx, y, size) silver text gradient. Fonts: 'Inter' (100–900), 'Corm' (600, elegant serif), 'Mono' (400, code).
- After M.spinta, draw in logical coordinates (0..W, 0..H). For effects needing a separate layer: const L = document.createElement('canvas'); L.width = cv.width; L.height = cv.height; then L.getContext('2d').setTransform(ctx.getTransform()).
- Blur/glow: ctx.filter = \`blur(\${8 * S}px)\` and ctx.shadowBlur = 30 * S (always multiply by S). Reset ctx.filter = 'none' after.

RULES (they make it look expensive):
- render(t) must be deterministic: no Math.random() at draw time (use a seeded function like Math.sin(i*12.9898)*43758.5453 % 1), no Date, no timers, no images or network.
- Clear/redraw the whole frame each call: start render(t) with ctx.setTransform(1,0,0,1,0,0); ctx.globalAlpha=1; ctx.filter='none'; then M.fondo or your own full background fill.
- Duration 5–8 s unless asked. All key times in ONE object T at the top.
- Each shot turns into the next (no cross-dissolves). The important thing stays dead centre. Something always moves (slow drift, float, push).
- Entrances fast then slow (outCubic/outExpo); motion never reverses direction abruptly; continuous gentle loops use Math.sin(t*…) with small amplitude.
- One main light source; glows subtle; depth by blur on background elements. Leave ≥ 8% margin: nothing important cut by the edges.
- Text: short, sentence case, Inter or Corm. Brand logos: draw a SIMPLE generic icon evoking it (shapes/colours), never write fake trademarks; album covers or products = abstract gradients/shapes, never real artwork.
- "Liquid glass" = translucent rounded shape: semi-transparent white fill (alpha .08–.18), a blurred copy of what is behind, a bright thin top edge highlight, soft shadow.
- A cursor click: an arrow cursor moves in on a curve, small press (scale .9) with a ripple ring, then the reaction.
- Keep the code under 260 lines, readable, comments in Italian.

${trasparente ? `OVERLAY MODE (important): this graphic goes ON TOP of a video of a person talking. Keep the background fully transparent: never fill the
whole canvas and never call M.fondo; start render(t) with ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,cv.width,cv.height); then M.spinta(...).
Keep every element inside the TOP 38% of the frame (y < H*0.38), horizontally centred, away from the face. Duration 3–4 s.
Text and shapes need soft dark shadows (ctx.shadowColor='rgba(0,0,0,.6)') to read on any video. No M.grana.
` : ''}OUTPUT: only the JavaScript program inside one \`\`\`js code block. No HTML, no explanations.`;
};

// la pagina intera: noi mettiamo font, canvas e attrezzi; il modello scrive solo lo script
export function pagina(codice) {
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Motion · idea</title>
<style>@font-face{font-family:Corm;src:url("fonts/CormorantGaramond-600.woff2");font-weight:600}@font-face{font-family:Mono;src:url("fonts/JetBrainsMono-400.woff2")}
@font-face{font-family:Inter;src:url("fonts/Inter-var.woff2");font-weight:100 900}
html,body{margin:0;background:#000;height:100%}body{display:flex;align-items:center;justify-content:center}canvas{max-width:100vw;max-height:100vh;display:block}</style></head>
<body><canvas id="c"></canvas><script src="params.js"></script><script src="motore.js"></script><script src="base.js"></script>
<script>
${codice}
</script></body></html>
`;
}

export function estraiCodice(testo) {
  const t = String(testo || '');
  const blocco = /```(?:js|javascript)?\s*\n([\s\S]*?)```/i.exec(t);
  const c = (blocco ? blocco[1] : t).trim();
  if (!/M\.avvia|MOTORE\.avvia/.test(c)) throw new Error('il codice non chiama M.avvia');
  if (/<\/script/i.test(c)) throw new Error('il codice contiene </script>');
  return c;
}

// giri di chiave e modello: gratis prima (Pro, poi Flash); poi la chiave a pagamento.
// A pagamento: i modelli di MOTION_MODELLI_PAGAMENTO (Denis 18/11: Pro per le motion graphic), poi Flash-Lite.
// La chiave gratuita resta sui suoi modelli: Pro e Flash gratis non si saltano mai.
function giri() {
  const lista = (v, def) => (v || def).split(',').map((s) => s.trim()).filter(Boolean);
  const gratis = [], pagati = [];
  if (process.env.GEMINI_API_KEY_GRATIS) for (const m of lista(process.env.MOTION_MODELLI, 'gemini-pro-latest,gemini-flash-latest')) gratis.push([process.env.GEMINI_API_KEY_GRATIS, m]);
  if (process.env.GEMINI_API_KEY) for (const m of lista(process.env.MOTION_MODELLI_PAGAMENTO, '')) pagati.push([process.env.GEMINI_API_KEY, m]);
  const lite = process.env.GEMINI_API_KEY ? [[process.env.GEMINI_API_KEY, 'gemini-flash-lite-latest']] : [];
  // Denis 19/11: per le motion graphic prima la chiave a pagamento (Pro), poi quella gratuita (spesso esaurita), poi Flash-Lite
  return process.env.MOTION_PAGAMENTO_PRIMA === '1' ? [...pagati, ...gratis, ...lite] : [...gratis, ...pagati, ...lite];
}
export async function gemini(parti, sistema, json = false) {
  const base = process.env.GEMINI_URL || 'https://generativelanguage.googleapis.com/v1beta';
  for (const [chiave, modello] of giri()) {
    try {
      const r = await fetch(`${base}/models/${modello}:generateContent`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': chiave }, signal: AbortSignal.timeout(240_000),
        body: JSON.stringify({ systemInstruction: { parts: [{ text: sistema }] }, contents: [{ role: 'user', parts: parti }], generationConfig: { temperature: 0.6, ...(json ? { responseMimeType: 'application/json' } : {}) } }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { log(`${modello}: HTTP ${r.status}`); continue; }
      const testo = (j.candidates?.[0]?.content?.parts || []).map((x) => x.text || '').join('');
      if (testo) return { testo, modello };
      log(`${modello}: risposta vuota`);
    } catch (e) { log(`${modello}: ${e.message}`); }
  }
  throw new Error('nessun modello Gemini ha risposto');
}

// ✨ Ultron 2 (18/11): l'animazione speciale la scrive Claude (abbonamento di Denis, CLAUDE_CODE_OAUTH_TOKEN, comando
// `claude` come la regia). Senza token o se Claude non risponde, si torna a Gemini.
export function claudePronto() {
  if (!process.env.CLAUDE_CODE_OAUTH_TOKEN) return false;
  const c = spawnSync('claude', ['--version'], { encoding: 'utf8' });
  if (!c.error && c.status === 0) return true;
  const i = spawnSync('npm', ['install', '-g', '@anthropic-ai/claude-code'], { encoding: 'utf8', timeout: 180_000 });
  return i.status === 0;
}
export async function claude(parti, sistema) {
  const modello = process.env.MOTION_CLAUDE || 'sonnet';
  const testo = `${sistema}\n\n---\n\n${parti.map((x) => x.text || '').join('\n')}`;
  const r = spawnSync('claude', ['-p', 'Follow the instructions received in input. Answer with the program only, do not use tools.', '--model', modello, '--output-format', 'json'],
    { encoding: 'utf8', input: testo, timeout: 8 * 60_000, maxBuffer: 1 << 26 });
  let j = {};
  try { j = JSON.parse(r.stdout || '{}'); } catch { /* non JSON */ }
  if (r.status !== 0 || j.is_error || !j.result) throw new Error(`Claude non ha risposto (${r.status})`);
  return { testo: String(j.result), modello: `claude-${modello}` };
}

// prova la pagina in Chrome: errori, durata, schermo vuoto, animazione ferma; 6 fotogrammi per la revisione
const TEMPI = [0.15, 0.3, 0.5, 0.65, 0.8, 0.97];
export function giudica(stat, durata) {
  if (!(durata >= 1.5 && durata <= 20)) return `durata ${durata}: deve essere tra 2 e 15 secondi (M.avvia)`;
  if (stat.every((s) => s.sd < 3)) return 'tutti i fotogrammi sono vuoti o di un colore solo: non si vede niente';
  const diff = (a, b) => a.px.reduce((x, v, i) => x + Math.abs(v - b.px[i]), 0) / a.px.length;
  const mov = Math.max(...stat.slice(1).map((s, i) => diff(s, stat[i])));
  if (mov < 0.6) return 'i fotogrammi sono tutti uguali: l\'animazione non si muove nel tempo';
  return null;
}
export async function prova(codice, formato, trasparente = false) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'motion-idea-'));
  fs.cpSync(MOTION, dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'params.js'), `window.PARAMS = ${JSON.stringify({ modello: 'idea', formato, ...(trasparente ? { trasparente: true } : {}) })};\n`);
  fs.writeFileSync(path.join(dir, 'idea.html'), pagina(codice));
  let aperta;
  try {
    aperta = await apri(dir, 'idea.html', 't=0&scala=0.5');
    const durata = await aperta.valuta('window.TOTAL');
    const ris = await aperta.valuta(`(async () => { const out = [];
      for (const k of ${JSON.stringify(TEMPI)}) { const t = k * window.TOTAL; await renderAt(t);
        const c = document.getElementById('c'), s = document.createElement('canvas'); s.width = 48; s.height = Math.round(48 * c.height / c.width);
        const g = s.getContext('2d'); g.drawImage(c, 0, 0, s.width, s.height); const d = g.getImageData(0, 0, s.width, s.height).data;
        let sum = 0, sq = 0; const px = []; for (let i = 0; i < d.length; i += 4) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; sum += l; sq += l * l; px.push(l); }
        const m = sum / px.length; out.push({ m, sd: Math.sqrt(Math.max(0, sq / px.length - m * m)), px, jpg: c.toDataURL('image/jpeg', 0.8).split(',')[1] }); }
      return out; })()`);
    return { errore: giudica(ris, durata), durata, fotogrammi: ris.map((r) => r.jpg) };
  } catch (e) {
    return { errore: e.message.replace(/^errore nella pagina: /, '').slice(0, 600), fotogrammi: [] };
  } finally { if (aperta) await aperta.chiudi(); fs.rmSync(dir, { recursive: true, force: true }); }
}

// 6 fotogrammi in una griglia (per farli guardare a Gemini)
function griglia(fotogrammi) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'motion-griglia-'));
  fotogrammi.forEach((b, i) => fs.writeFileSync(path.join(d, `${i}.jpg`), Buffer.from(b, 'base64')));
  const out = path.join(d, 'griglia.jpg');
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', path.join(d, '%d.jpg'), '-vf', 'scale=360:-2,tile=3x2:padding=6', '-frames:v', '1', '-q:v', '4', out]);
  const b = r.status === 0 ? fs.readFileSync(out).toString('base64') : null;
  fs.rmSync(d, { recursive: true, force: true });
  return b;
}

export async function creaIdea({ prompt, correzione = '', base = '', formato = 'verticale', tentativi = 3, trasparente = false, revisione = true, ai = 'gemini' }) {
  const conClaude = ai === 'claude' && claudePronto();
  const scrivi = async (parti, sistema) => {
    if (conClaude) { try { return await claude(parti, sistema); } catch (e) { log(`${e.message}: provo con Gemini`); } }
    return gemini(parti, sistema);
  };
  const sistema = GUIDA(formato, trasparente);
  const richiesta = base
    ? `Here is the current animation program:\n\`\`\`js\n${base}\n\`\`\`\nOriginal request (Italian): ${prompt}\nChange requested now (Italian): ${correzione}\nApply the change, keep everything else. Return the full program.`
    : `Request (Italian): ${prompt}`;
  let codice = null, ultimo = null, n = 0;
  let parti = [{ text: richiesta }];
  for (; n < tentativi; n++) {
    const { testo, modello } = await scrivi(parti, sistema);
    let c;
    try { c = estraiCodice(testo); } catch (e) { log(`tentativo ${n + 1} (${modello}): ${e.message}`); parti = [{ text: `${richiesta}\n\nYour previous answer was not usable: ${e.message}. Answer again with only the js code block.` }]; continue; }
    const p = await prova(c, formato, trasparente);
    if (!p.errore) { codice = c; ultimo = p; log(`tentativo ${n + 1} (${modello}): ok, ${p.durata}s`); break; }
    log(`tentativo ${n + 1} (${modello}): da correggere`);
    parti = [{ text: `${richiesta}\n\nYour program:\n\`\`\`js\n${c}\n\`\`\`\nIt fails when tested in Chrome: ${p.errore}\nFix it and return the full program.` }];
  }
  if (!codice) throw new Error('l\'AI non è riuscita a scrivere un\'animazione che funzioni: prova a descriverla in modo più semplice');
  // revisione: Gemini guarda i fotogrammi e corregge (tengo la versione nuova solo se passa le prove)
  const img = revisione ? griglia(ultimo.fotogrammi) : null;
  if (img) {
    try {
      const { testo } = await gemini([
        { text: `Request (Italian): ${prompt}${correzione ? `\nChange requested: ${correzione}` : ''}\n\nThese are 6 frames of your animation (left→right, top→bottom, from start to end).\nCheck as a demanding motion designer: is everything in the request there and recognisable? Anything cut by the edges, overlapping, unreadable, too empty, too dark, ugly? If it is good, answer exactly OK. Otherwise return the full corrected program.\n\`\`\`js\n${codice}\n\`\`\`` },
        { inline_data: { mime_type: 'image/jpeg', data: img } },
      ], sistema);
      if (!/^\s*OK\b/i.test(testo)) {
        const c2 = estraiCodice(testo), p2 = await prova(c2, formato, trasparente);
        if (!p2.errore) { codice = c2; log('revisione: migliorata'); } else log('revisione scartata (non passa le prove)');
      } else log('revisione: ok');
    } catch (e) { log(`revisione saltata: ${e.message}`); }
  }
  return { html: pagina(codice), codice, tentativi: n + 1 };
}
