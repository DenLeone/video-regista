// Passo 4 del flusso locale, stile Presentazione (al posto di regia.mjs): scene con il testo che si accumula sul
// parlato e un'infografica ciascuna, scelta dall'AI locale in base al tema (onda per il suono, aereo su pista per gli
// aerei, curva per la crescita, prompt per le AI…). Le immagini di immagini.json diventano schede foto.
//   node pc/locale/presentazione.mjs <cartella -pulizia> [--titolo X] [--modello qwen3.8:27b] [--pensa no|low] [--rifai-ai] [--fps 29.97]
// - scene: il codice divide il parlato in frasi (pause, punteggiatura, al massimo 8 parole / 3,5 s) e taglia dove
//   entra un'immagine. Il testo a schermo è il parlato vero (parole-pulite.json), l'AI non lo riscrive.
// - AI (a tratti di ~30 s, in cache in presentazione-ai.json): per ogni scena la parola chiave (riga enorme), se va
//   in corallo, la grafica; per le scene con immagine solo l'etichetta della scheda. Il codice controlla tutto
//   (icone che esistono, numeri detti davvero, parole della scena).
// - tre modi, come il reel di riferimento: lui a tutto schermo con una parola alla volta sotto il mento (il grosso
//   del video), diviso (immagine sopra, lui sotto) e grafica piena Tiffany a raffiche sui passaggi chiave (~1/3).
//   Si comincia e si finisce con lui: il video si rivede in loop senza stacco.
// Scrive nella cartella -pulizia: presentazione.json (props della composizione Presentazione), beats.json (modi del
// presentatore per lastra.mjs) ed eventi.json (suoni per pc/rotolo/suoni.py). Immagini in public/presentazione/<nome>/.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chiediLocale } from './ollama.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opz = (k, d = '') => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const ha = (k) => args.includes(k);
const DIR = path.resolve(args[0] || '');
if (!args[0] || !fs.existsSync(path.join(DIR, 'parole-pulite.json'))) { console.error('uso: node pc/locale/presentazione.mjs <cartella -pulizia> [--titolo X]'); process.exit(1); }
const MODELLO = opz('--modello', process.env.MODELLO_REGIA || 'qwen3.8:27b');
const PENSA = opz('--pensa', 'no');
const FPS = Number(opz('--fps', 30000 / 1001));
const PYTHON = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const log = (...a) => console.log('[presentazione]', ...a);
const leggi = (n) => JSON.parse(fs.readFileSync(path.join(DIR, n), 'utf8'));

const tagli = leggi('tagli.json');
// "l" + "'intelligenza", "pre" + "-trained": il pezzo che comincia con apostrofo o trattino si attacca a quello prima
const parole = [];
for (const [i, w] of leggi('parole-pulite.json').entries()) {
  const u = parole.at(-1);
  if (u && (/^['’-]/.test(w.w) || /['’]$/.test(u.w))) { u.w = (u.w + w.w).replace(/’/g, "'"); u.e = w.e; continue; }
  parole.push({ ...w, i });
}
const imm = fs.existsSync(path.join(DIR, 'immagini.json')) ? leggi('immagini.json') : { elementi: [] };
const DURATA = tagli.durataPulita;
const nome = opz('--titolo', path.basename(tagli.sorgente).replace(/\.[^.]+$/, ''));
const slug = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
const CART = `presentazione/${slug}`;
const PUB = path.join(ROOT, 'public', CART);
fs.mkdirSync(PUB, { recursive: true });

// ---------- 1. immagini in public (GIF e clip → mp4 H.264, webp → png, come regia.mjs)
const foto = [];
for (const e of imm.elementi) {
  let file = e.file;
  const da = path.join(imm.cartella, e.file);
  if (/\.(gif|mp4|mov|m4v|webm)$/i.test(file)) {
    file = file.replace(/\.[^.]+$/i, '-clip.mp4');
    if (!fs.existsSync(path.join(PUB, file))) spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', da, '-movflags', '+faststart', '-pix_fmt', 'yuv420p', '-an', '-vf', "scale='min(1920,iw)':'min(1920,ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2", '-c:v', 'libx264', '-crf', '18', path.join(PUB, file)]);
  } else if (/\.webp$/i.test(file)) {
    file = file.replace(/\.webp$/i, '.png');
    if (!fs.existsSync(path.join(PUB, file))) spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', da, path.join(PUB, file)]);
  } else if (!fs.existsSync(path.join(PUB, file))) fs.copyFileSync(da, path.join(PUB, file));
  foto.push({ t: e.inizio, file });
}

// ---------- 2. scene: frasi del parlato, tagliate dove entra un'immagine
const MAX_PAROLE = 7, MAX_DUR = 3.5, PAUSA = 0.35, MIN_DUR = 1.0;
// immagine che entra su questa parola (o nell'aria subito prima): ognuna apre una scena sola
const usate = new Set();
const fotoSu = (w) => {
  const f = foto.find((x) => !usate.has(x) && x.t < w.e && x.t > w.s - 0.25);
  if (f) usate.add(f);
  return f;
};
const gruppi = [];
let cur = [];
for (const w of parole) {
  const prima = cur.at(-1);
  const f = fotoSu(w);
  const rompi = prima && (w.s - prima.e > PAUSA || /[.!?]$/.test(prima.w) || cur.length >= MAX_PAROLE || w.e - cur[0].s > MAX_DUR || f);
  if (rompi) { gruppi.push(cur); cur = []; }
  if (f) cur.foto = f;
  cur.push(w);
}
if (cur.length) gruppi.push(cur);
// frasi troppo corte: si attaccano alla precedente (mai se lì entra un'immagine)
const frasi = [];
for (const g of gruppi) {
  const u = frasi.at(-1);
  if (u && g.at(-1).e - g[0].s < MIN_DUR && !g.foto && u.length + g.length <= MAX_PAROLE + 1 && g.at(-1).e - u[0].s <= MAX_DUR + 0.5) u.push(...g);
  else frasi.push(g);
}
// inizio: il presentatore a tutto schermo sulla prima frase (al massimo 3 s), poi il pannello
const INTRO = 0; // si comincia con lui a tutto schermo: la prima scena non va mai a grafica piena
const scene = frasi.filter((g) => !(INTRO && g[0].s < INTRO)).map((g) => ({ parole: g, foto: g.foto }));
scene.forEach((s, n) => {
  s.da = +(n === 0 ? Math.max(INTRO, s.parole[0].s - 0.15) : s.parole[0].s - 0.12).toFixed(3);
});
scene.forEach((s, n) => { s.a = n < scene.length - 1 ? scene[n + 1].da : DURATA; });
log(`${parole.length} parole → ${scene.length} scene (${foto.length} immagini), inizio a tutto schermo fino a ${INTRO.toFixed(1)} s`);

// ---------- 3. AI: parola chiave, corallo, grafica (a tratti di ~30 s)
const ICONE = 'IconPlane IconRocket IconCar IconTruck IconShip IconTrain IconBike IconRun IconBrain IconCpu IconRobot IconCode IconDeviceMobile IconDeviceLaptop IconDeviceTv IconDeviceGamepad2 IconCamera IconVideo IconPhoto IconHeadphones IconMicrophone IconMusic IconBolt IconBattery IconWifi IconCloud IconDatabase IconLock IconKey IconShieldCheck IconWorld IconMap IconPlanet IconAtom IconDna IconPill IconCoin IconMoneybag IconShoppingCart IconChartLine IconUsers IconMessage IconSearch IconClock IconBulb IconAlertTriangle IconHeart IconEye IconSchool IconBook IconBuilding IconHome IconFlame IconLeaf IconSettings IconTrophy IconScale IconGavel IconTarget IconPuzzle IconSparkles IconPrinter IconBrandOpenai';
const VEICOLI = ['IconPlane', 'IconRocket', 'IconCar', 'IconTruck', 'IconShip', 'IconTrain', 'IconBike', 'IconRun'];
const testoScena = (s) => s.parole.map((w) => `${w.i}:${w.w}`).join(' ');
const domanda = (nn) => `Sei il grafico di un video verticale di Denis in stile "Presentazione". Per la maggior parte del tempo si vede Denis a tutto schermo che parla; nei passaggi chiave lo schermo diventa una grafica a tutto schermo (fondo Tiffany, testo enorme che si accumula parola per parola e un'infografica che cambia col TEMA di cui parla); con le immagini si vede l'immagine sopra e lui sotto.
Ti do le SCENE di un tratto del video, numerate, con le parole dette (numero:parola). Per ognuna rispondi:
- "peso": da 1 a 5, quanto la scena guadagna da una grafica a tutto schermo (5 = passaggio chiave, concetto da spiegare, numero, confronto, sigla, frase d'effetto; 1 = frase di passaggio). Le scene con IMMAGINE: 0.
- "chiave": il numero della parola più importante della scena (sarà la riga enorme)
- "accento": true solo se la scena contiene una cosa davvero forte (una rivelazione, un numero clamoroso): la parola chiave diventa corallo. Al massimo una scena su quattro.
- per le scene con IMMAGINE: "etichetta": 1–3 parole IN MAIUSCOLO per la scheda della foto (cosa mostra), niente grafica.
- per le scene senza immagine: "grafica", la più adatta al TEMA della scena, una di queste:
  {"tipo": "barre", "etichette": ["…", "…"]}  quantità che crescono o un confronto (1–2 etichette brevi IN MAIUSCOLO, dette nella scena)
  {"tipo": "curva"}  crescita esplosiva, esponenziale, "esplode", "decolla" come numeri
  {"tipo": "onda"}  suono, audio, voce, musica, microfoni, rumore
  {"tipo": "percorso", "icona": uno di ${VEICOLI.join(' ')}}  viaggi, velocità, partenze, lanci, consegne, aerei, auto
  {"tipo": "prompt", "testo": "…"}  intelligenza artificiale, chatbot, ricerche, comandi scritti (testo: max 14 caratteri, detto nella scena)
  {"tipo": "acronimo", "parole": ["…", "…"]}  SOLO se la scena scioglie una sigla parola per parola
  {"tipo": "numero", "valore": <numero>, "suffisso": "…"}  SOLO se la scena dice un numero importante (suffisso: "%", " €", "x", " ANNI"…)
  {"tipo": "riquadro"}  Denis appare in un riquadro sotto il testo: opinioni, frasi in prima persona, domande al pubblico, battute
  {"tipo": "parola", "parola": <numero di una parola della scena con la lettera O, 4–9 lettere>}  quella parola diventa enorme e nella O si vede Denis: per la parola-simbolo della scena
  {"tipo": "icona", "icona": <una di: ${ICONE}>, "etichetta": "1–2 PAROLE"}  SOLO per un oggetto o una cosa concreta nominata nella scena (un telefono, un chip, un libro, un'azienda), mai per verbi o concetti astratti
  null  solo testo: va benissimo, il testo enorme è già la grafica. Almeno una scena su tre senza immagine resta null.
Varia: non ripetere la stessa grafica in due scene di fila. Usa SOLO cose dette.
La trascrizione può scrivere male i nomi: "Cloud" detto da Denis è "Claude" (di Anthropic).

Rispondi SOLO con JSON: {"scene": [{"n": <numero scena>, "peso": 3, "chiave": <numero parola>, "accento": false, "etichetta": "…" | "grafica": {…} | null}]}

SCENE:
${nn.map((n) => `${n}.${scene[n].foto ? ` [IMMAGINE ${scene[n].foto.file}]` : ''} ${testoScena(scene[n])}`).join('\n')}`;

const TRATTO = 30;
const blocchi = [];
for (let n = 0; n < scene.length; n++) {
  if (!blocchi.length || scene[n].da - scene[blocchi.at(-1)[0]].da >= TRATTO) blocchi.push([]);
  blocchi.at(-1).push(n);
}
const CACHE = path.join(DIR, 'presentazione-ai.json');
const cache = (() => { try { return JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch { return {}; } })();
const risposte = new Map();
const forti = [];
const t0 = Date.now();
for (const [k, nn] of blocchi.entries()) {
  const prompt = domanda(nn);
  const chiave = `${MODELLO}|${PENSA}\n${prompt}`;
  let t = !ha('--rifai-ai') && cache[chiave];
  if (!t) {
    try {
      // un secondo tentativo: Ollama a volte cade (llama-server terminato) e al giro dopo risponde
      try { t = await chiediLocale(prompt, { modello: MODELLO, temperatura: 0.3, pensa: PENSA }); JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); }
      catch (e) { log(`tratto ${k + 1}: ${e.message.slice(0, 80)}, riprovo`); t = await chiediLocale(prompt, { modello: MODELLO, temperatura: 0.3, pensa: PENSA }); }
      JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
      cache[chiave] = t; fs.writeFileSync(CACHE, JSON.stringify(cache));
    } catch (e) { log(`tratto ${k + 1}: risposta non valida (${e.message}), solo testo`); continue; }
  }
  const r = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
  for (const x of [].concat(r.scene || [])) if (nn.includes(Math.round(x?.n))) risposte.set(Math.round(x.n), x);
  forti.push(...[].concat(r.forti || []).map(Number).filter(Number.isFinite));
  log(`tratto ${k + 1}/${blocchi.length}: scene ${nn[0]}–${nn.at(-1)}`);
}
log(`AI (${MODELLO}, ragionamento ${PENSA}) in ${((Date.now() - t0) / 1000).toFixed(0)} s per ${blocchi.length} tratti`);

// ---------- 4a. grafica piena: le scene col peso più alto fino a ~30% del video (mai la prima né l'ultima, mai le
// immagini); a parità di peso vince chi è vicino a una già scelta, così vengono raffiche di 2–3 scene
const QUOTA = Number(opz('--quota-grafica', 0.3));
const piene = new Set();
{
  const cand = scene.map((s, n) => ({ n, p: Number(risposte.get(n)?.peso) || 0, d: s.a - s.da })).filter((c) => c.n > 0 && c.n < scene.length - 1 && !scene[c.n].foto && c.p >= 2);
  let usato = 0;
  while (usato < DURATA * QUOTA) {
    const libere = cand.filter((c) => !piene.has(c.n));
    if (!libere.length) break;
    const voto = (c) => c.p + (piene.has(c.n - 1) || piene.has(c.n + 1) ? 0.6 : 0);
    const c = libere.sort((a, b) => voto(b) - voto(a))[0];
    piene.add(c.n); usato += c.d;
  }
}

// ---------- 4b. collage: immagini ravvicinate (una nuova entro 4,5 s dalla precedente) si accumulano sparse su fondo
// crema a tutto schermo, anche nelle scene in mezzo; al massimo 6 per collage
const collageDi = new Map(); // indice scena → elenco foto del collage
{
  const conFoto = scene.map((s, n) => (s.foto ? n : -1)).filter((n) => n >= 0);
  let gruppo = [];
  const chiudi = () => {
    if (gruppo.length >= 2) {
      const foto = gruppo.map((n) => ({ file: scene[n].foto.file, t0: +Math.max(scene[n].da, scene[n].foto.t - 0.1).toFixed(2) }));
      for (let n = gruppo[0]; n <= gruppo.at(-1); n++) collageDi.set(n, foto);
    }
    gruppo = [];
  };
  for (const n of conFoto) {
    if (gruppo.length && (scene[n].foto.t - scene[gruppo.at(-1)].foto.t > 4.5 || gruppo.length >= 6)) chiudi();
    gruppo.push(n);
  }
  chiudi();
}

// ---------- 4. scene finali: righe del testo e grafica, controllate
const icone = new Set(Object.keys(await import('@tabler/icons-react')));
const MAIUSC = (s, n) => String(s || '').toUpperCase().replace(/\s+/g, ' ').trim().slice(0, n);
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const RIGA = 16; // caratteri per riga (le parole lunghe stanno da sole)
let ultimoAccento = -99, ultimaBarriera = -99, ultimaIcona = -99, tipoPrima = '';
const fuori = [];
for (const [n, s] of scene.entries()) {
  const r = risposte.get(n) || {};
  const nella = (i) => s.parole.find((w) => w.i === Math.round(i));
  // parola chiave: quella dell'AI se è una parola vera (non "e", "la", "a"), altrimenti la più lunga
  const scelta = nella(r.chiave);
  const parolaChiave = scelta && scelta.w.replace(/[^\p{L}\d]/gu, '').length > 2 ? scelta : [...s.parole].sort((a, b) => b.w.length - a.w.length)[0];
  const accento = !!r.accento && s.da - ultimoAccento > 8;
  if (accento) ultimoAccento = s.da;
  // tre modi: diviso (immagine sopra, lui sotto), tiffany (grafica a tutto schermo), lui (a tutto schermo)
  const modo = collageDi.has(n) ? 'collage' : s.foto ? 'diviso' : piene.has(n) ? 'tiffany' : 'lui';
  const scena = { da: s.da, a: +s.a.toFixed(3), modo, parole: [] };
  // grafica
  let g = null;
  const t0g = +(s.da + 0.25).toFixed(2);
  if (modo === 'lui') { s.finale = scena; tipoPrima = 'lui'; continue; }
  if (modo === 'collage') { scena.collage = collageDi.get(n); s.finale = scena; tipoPrima = 'collage'; continue; }
  if (s.foto) g = { tipo: 'foto', file: s.foto.file, t0: +Math.max(s.da, s.foto.t - 0.1).toFixed(2), ...(r.etichetta ? { etichetta: MAIUSC(r.etichetta, 22) } : {}) };
  else if (r.grafica && typeof r.grafica === 'object') {
    const x = r.grafica;
    const dette = s.parole.map((w) => norm(w.w));
    switch (x.tipo) {
      case 'barre': {
        const et = [...new Set([].concat(x.etichette || []).map((e) => MAIUSC(e, 12)).filter(Boolean))].slice(0, 2);
        g = { tipo: 'barre', gruppi: (et.length ? et : ['']).map((e, i) => ({ etichetta: e, t: +(t0g + i * Math.min(0.9, (s.a - s.da - 0.8) / 2)).toFixed(2) })) };
        break;
      }
      case 'curva': g = { tipo: 'curva', lineare: t0g, esplode: +Math.min(Math.max(parolaChiave.s, s.da + 0.9), s.a - 0.7).toFixed(2) }; break;
      case 'onda': g = { tipo: 'onda', t0: t0g }; break;
      case 'percorso': g = { tipo: 'percorso', icona: VEICOLI.includes(x.icona) ? x.icona : 'IconPlane', t0: t0g }; break;
      case 'prompt': if (x.testo) g = { tipo: 'prompt', testo: String(x.testo).slice(0, 14), t0: +(s.da + 0.8).toFixed(2) }; break;
      case 'acronimo': {
        const pp = [].concat(x.parole || []).map((p) => MAIUSC(p, 14)).filter(Boolean).slice(0, 4);
        // solo se le parole sono dette nella scena: ognuna compare quando la dice
        const tempi = pp.map((p) => s.parole.find((w) => norm(w.w) === norm(p))?.s);
        if (pp.length >= 2 && tempi.filter(Boolean).length >= pp.length - 1) {
          g = { tipo: 'acronimo', parole: pp.map((p, i) => ({ w: p, t: +(tempi[i] ?? t0g + i * 0.5).toFixed(2) })) };
          s.parole = s.parole.filter((w) => !pp.some((p) => norm(p) === norm(w.w))); // le parole della sigla stanno nella grafica
        }
        break;
      }
      case 'numero': {
        const v = Number(String(x.valore).replace(',', '.'));
        // il numero dev'essere detto come numero, non dentro un nome (GPT-1, M4)
        const soloNumeri = s.parole.filter((w) => /^[\d.,%€$]+[.,]?$/.test(w.w)).map((w) => norm(w.w));
        if (Number.isFinite(v) && soloNumeri.some((d) => d.includes(norm(String(x.valore)).replace(/\D/g, '')))) {
          const w = s.parole.find((q) => /\d/.test(q.w)) || parolaChiave;
          g = { tipo: 'numero', valore: v, suffisso: String(x.suffisso || '').toUpperCase().slice(0, 6), t0: +Math.max(s.da + 0.2, w.s - 0.1).toFixed(2) };
        } else fuori.push(`numero ${x.valore} non detto nella scena ${n}`);
        break;
      }
      case 'riquadro': g = { tipo: 'riquadro', t0: +(s.da + 0.15).toFixed(2) }; break;
      case 'parola': {
        const w = nella(x.parola);
        if (w && /o/i.test(w.w) && w.w.replace(/[^\p{L}]/gu, '').length >= 3) {
          g = { tipo: 'parola', parola: w.w.replace(/[^\p{L}\d'-]/gu, '').toUpperCase(), t0: +Math.max(s.da + 0.1, w.s - 0.15).toFixed(2) };
          s.parole = s.parole.filter((q) => q !== w); // la parola sta nella grafica
        }
        break;
      }
      case 'icona':
        // icone ripetute stancano (Test 3: 10 cerchi uguali su concetti astratti): una ogni 12 s, le altre scene
        // restano testo enorme
        if (s.da - ultimaIcona < 12) break;
        if (icone.has(x.icona)) { ultimaIcona = s.da; g = { tipo: 'icona', icona: x.icona, t0: t0g, ...(x.etichetta ? { etichetta: MAIUSC(x.etichetta, 16) } : {}) }; }
        else fuori.push(`icona inesistente ${x.icona}`);
        break;
    }
  }
  if (g) scena.grafica = g;
  // righe (solo nella grafica piena): la parola chiave da sola, enorme; le altre a righe di ~16 caratteri, grandi se corte
  let riga = 0, lun = 0;
  const pp = [];
  for (const w of modo === 'tiffany' ? s.parole : []) {
    const W = w.w.toUpperCase();
    const ch = w === parolaChiave;
    if (pp.length && (ch || pp.at(-1).chiave || lun + W.length + 1 > RIGA)) { riga++; lun = 0; }
    pp.push({ w: W, t: +w.s.toFixed(2), riga, chiave: ch });
    lun += W.length + 1;
  }
  const righe = new Map();
  for (const p of pp) righe.set(p.riga, [...(righe.get(p.riga) || []), p]);
  for (const [, rr] of righe) {
    const ch = rr.some((p) => p.chiave);
    const corta = rr.map((p) => p.w).join(' ').length <= 8;
    for (const p of rr) scena.parole.push({ w: p.w, t: p.t, riga: p.riga, taglia: ch ? 'enorme' : corta ? 'grande' : 'piccolo', ...(ch && accento ? { accento: true } : {}) });
  }
  // uscita a barre quando cambia il tipo di grafica (non più di una ogni 4 s)
  const tipo = g?.tipo || 'testo';
  // mai sopra il culmine della scena prima (curva che esplode, parola enorme detta negli ultimi istanti)
  const prima = scene[n - 1]?.finale;
  const culmine = prima ? Math.max(prima.grafica?.tipo === 'curva' ? prima.grafica.esplode + 0.6 : 0, ...prima.parole.filter((p) => p.taglia === 'enorme').map((p) => p.t + 0.5)) : 0;
  // (solo tra due scene di grafica piena: entrando e uscendo lavora il pannello che si apre e si chiude)
  if (modo === 'tiffany' && prima?.modo === 'tiffany' && tipo !== tipoPrima && s.da - ultimaBarriera >= 4 && culmine < s.da - 0.3) { scena.barriera = true; ultimaBarriera = s.da; }
  tipoPrima = tipo;
  s.finale = scena;
}
for (const f of fuori) log('scartato:', f);
{
  const fin = scene.map((s) => s.finale);
  let n = 0;
  while (n < fin.length) {
    if (fin[n].modo !== 'tiffany') { n++; continue; }
    let m = n;
    while (m + 1 < fin.length && fin[m + 1].modo === 'tiffany') m++;
    const raffica = fin.slice(n, m + 1);
    // ogni raffica ha almeno una mossa con lui dentro la grafica: parola-finestra se c'è una parola con la O, se no riquadro
    if (!raffica.some((x) => ['riquadro', 'parola'].includes(x.grafica?.tipo))) {
      const k = raffica.findIndex((x) => !x.grafica || x.grafica.tipo === 'icona') >= 0 ? raffica.findIndex((x) => !x.grafica || x.grafica.tipo === 'icona') : 0;
      const x = raffica[k], sc = scene[n + k];
      const conO = sc.parole.filter((w) => /o/i.test(w.w) && w.w.replace(/[^\p{L}]/gu, '').length >= 4 && w.w.replace(/[^\p{L}]/gu, '').length <= 9);
      const w = conO.sort((a, b) => b.w.length - a.w.length)[0];
      if (w && k % 2 === 0) {
        x.grafica = { tipo: 'parola', parola: w.w.replace(/[^\p{L}\d'-]/gu, '').toUpperCase(), t0: +Math.max(x.da + 0.1, w.s - 0.15).toFixed(2) };
        x.parole = x.parole.filter((p) => !(p.t === +w.s.toFixed(2) && p.w === w.w.toUpperCase()));
      } else x.grafica = { tipo: 'riquadro', t0: +(x.da + 0.15).toFixed(2) };
    }
    raffica.at(-1).uscita3d = true;
    delete raffica.at(-1).barriera;
    n = m + 1;
  }
}

// ---------- 5. presentatore: lui a tutto schermo, a metà sotto le immagini, nascosto nella grafica piena.
// L'ultima scena è sempre lui: il video finisce come comincia (si rivede in loop senza stacco).
const fin = scene.at(-1)?.finale;
if (fin && fin.modo !== 'lui') { fin.modo = 'lui'; delete fin.grafica; fin.parole = []; delete fin.barriera; }
const PRES = { lui: 'intero', diviso: 'meta', tiffany: 'nascosto', collage: 'nascosto' };
const modi = [{ t: 0, presentatore: 'intero', elementi: [] }];
for (const s of scene) if (PRES[s.finale.modo] !== modi.at(-1).presentatore) modi.push({ t: +s.finale.da.toFixed(2), presentatore: PRES[s.finale.modo], elementi: [] });
const quota = (m) => scene.filter((s) => s.finale.modo === m).reduce((x, s) => x + s.finale.a - s.finale.da, 0) / DURATA * 100;
log(`tempo: lui ${(100 - quota('diviso') - quota('tiffany')).toFixed(0)}%, diviso ${quota('diviso').toFixed(0)}%, grafica piena ${quota('tiffany').toFixed(0)}%`);

// viso del presentatore sui tempi del video tagliato (come regia.mjs)
const VISO = path.join(DIR, 'viso.json');
if (!fs.existsSync(VISO)) spawnSync(PYTHON, [path.join(ROOT, 'pc', 'rotolo', 'viso.py'), tagli.sorgente, VISO], { stdio: 'inherit', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
let presentatore;
if (fs.existsSync(VISO)) {
  const v = JSON.parse(fs.readFileSync(VISO, 'utf8'));
  const punti = [];
  let cum = 0;
  for (const x of tagli.tieni) {
    for (const p of v.punti) if (p.t >= x.da && p.t < x.a && p.x !== null) punti.push({ t: +(cum + p.t - x.da).toFixed(3), x: p.x, y: p.y, s: p.s });
    cum += x.a - x.da;
  }
  presentatore = { file: 'presentatore.mp4', ar: +(v.w / v.h).toFixed(4), viso: punti.length ? punti : [{ t: 0, x: 0.5, y: 0.42 }] };
}
const beatsDoc = { titolo: nome, durata: DURATA, fps: FPS, cartella: CART, voce: 'voce.wav', presentatore, beats: modi };
fs.writeFileSync(path.join(DIR, 'beats.json'), JSON.stringify(beatsDoc, null, 1));

const finali = scene.map((s) => s.finale);
// il video di Denis per riquadro e parola-finestra: proxy 1080p H.264 in public (NVENC, se no x264)
const TU = path.join(PUB, 'tu.mp4');
if (!fs.existsSync(TU)) {
  const base = ['-v', 'error', '-y', '-i', tagli.sorgente, '-vf', 'scale=-2:1080', '-an', '-movflags', '+faststart', '-g', '30'];
  const nv = spawnSync('ffmpeg', [...base.slice(0, 2), '-hwaccel', 'cuda', ...base.slice(2), '-c:v', 'h264_nvenc', '-preset', 'p5', '-cq', '21', TU]);
  if (nv.status !== 0) spawnSync('ffmpeg', [...base, '-c:v', 'libx264', '-crf', '20', '-preset', 'veryfast', TU]);
  log(`proxy del video per la grafica: ${TU}`);
}
const tu = presentatore ? { video: `${CART}/tu.mp4`, tieni: tagli.tieni.map((x) => ({ da: x.da, a: x.a })), ar: presentatore.ar, viso: presentatore.viso.map(({ t, x, y }) => ({ t, x, y })) } : undefined;
const props = { durata: DURATA, fps: FPS, cartella: CART, scene: finali, tu, parole: parole.map((w) => ({ w: w.w, s: +w.s.toFixed(3), e: +w.e.toFixed(3) })), lastra: { durata: DURATA, presentatore, beats: modi } };
fs.writeFileSync(path.join(DIR, 'presentazione.json'), JSON.stringify(props));

// ---------- 6. suoni (stessi tempi del video): uscite, entrate delle grafiche, cambi del presentatore
const S = { whoosh: '05 Movimento/whoosh veloce', lento: '05 Movimento/whoosh lento', swish: '05 Movimento/swish corto', pop: '07 Digitale/pop', clic: '07 Digitale/clic interfaccia', tick: '07 Digitale/tick contatore', hit: '08 Cinematico/hit', riser: '05 Movimento/riser' };
const ev = [];
for (const s of finali) {
  if (s.barriera) ev.push({ t: s.da - 0.3, suono: S.whoosh, db: -9 });
  const g = s.grafica;
  if (g?.tipo === 'foto') ev.push({ t: g.t0, suono: S.pop, db: -10 });
  else if (g?.tipo === 'curva') ev.push({ t: g.lineare, suono: S.riser, db: -18, durata: Math.max(0.5, g.esplode - g.lineare) }, { t: g.esplode, suono: S.hit, db: -9 });
  else if (g?.tipo === 'prompt') [...g.testo].forEach((c, i) => { if (c !== ' ') ev.push({ t: g.t0 + i * 0.09, suono: S.clic, db: -16 }); });
  else if (g?.tipo === 'percorso') ev.push({ t: g.t0 + 0.9, suono: S.lento, db: -8 });
  else if (g?.tipo === 'numero') ev.push({ t: g.t0, suono: S.tick, db: -11, durata: 1.1 });
  else if (g?.tipo === 'barre') g.gruppi.forEach((x) => ev.push({ t: x.t, suono: S.pop, db: -13 }));
  else if (g) ev.push({ t: g.t0 ?? s.da, suono: S.pop, db: -13 });
  const acc = s.parole.find((p) => p.accento);
  if (acc) ev.push({ t: acc.t, suono: S.hit, db: -12 });
}
for (let i = 1; i < modi.length; i++) if (modi[i].presentatore !== modi[i - 1].presentatore) ev.push({ t: Math.max(0, modi[i].t - 0.2), suono: S.swish, db: -14 });
ev.sort((a, b) => a.t - b.t);
fs.writeFileSync(path.join(DIR, 'eventi.json'), JSON.stringify({ durata: DURATA, letto: { stanza: '09 Ambiente/stanza', musica: '10 Musica/tech' }, eventi: ev }, null, 1));

const conta = {};
for (const s of finali) conta[s.grafica?.tipo || 'testo'] = (conta[s.grafica?.tipo || 'testo'] || 0) + 1;
log(`${finali.length} scene: ${Object.entries(conta).map(([k, v]) => `${k} ${v}`).join(', ')}; ${finali.filter((s) => s.barriera).length} uscite a barre, ${ev.length} suoni`);
for (const s of finali) {
  const g = s.grafica;
  log(`  ${s.da.toFixed(2).padStart(6)} ${(g?.tipo || '-').padEnd(9)} ${s.barriera ? '▌' : ' '} ${s.parole.map((p) => (p.taglia === 'enorme' ? `[${p.w}]` : p.w)).join(' ')}${g ? `  ${JSON.stringify(g.etichetta ?? g.icona ?? g.testo ?? g.valore ?? g.gruppi?.map((x) => x.etichetta) ?? g.parole?.map((x) => x.w) ?? '')}` : ''}`);
}
