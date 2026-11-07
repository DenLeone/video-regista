// Stile Documentario, regia: dal parlato pulito e dalle immagini sulle parole alle scene del piano sequenza
// (scene.json per pc/locale/doc-mondo.mjs; formato in pc/locale/esempi/documentario-test-2-scene.json).
//   node pc/locale/doc-regia.mjs <cartella -pulizia> [--modello qwen3.8:27b] [--rifai-ai] [--quota-tu 0.25]
// Come la vuole Denis (07/11): immagini che si alternano spesso (ogni immagine è una fermata della camera, una ogni
// 2–3 s) e lui in camera SOLO nei momenti salienti (gancio, battute, opinioni forti, chiusura).
// A. AI (una richiesta): per ogni frase il ruolo (gancio, fatto, spiegazione, numero, data, opinione, battuta, chiusura)
//    e la forza; il codice manda in camera il gancio, la chiusura e le battute/opinioni più forti, fino a --quota-tu.
// B. Fermate: le immagini di immagini.json in ordine di tempo (almeno 1,8 s l'una dall'altra) dove non c'è Denis.
// C. AI (una richiesta): nei buchi senza immagini una mossa (data, frase a macchina, curva, contatore, acronimo,
//    parola), gli eventi sulle immagini (cerchio, timbro, barra) e le etichette scritte a mano sotto le foto.
// Il codice controlla tutto (parole che esistono, tipi validi) e ha regole di riserva (anni → cartellino, ecc.).
import fs from 'node:fs';
import path from 'node:path';
import { chiediLocale } from './ollama.mjs';

const args = process.argv.slice(2);
const opz = (k, d = '') => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const ha = (k) => args.includes(k);
const DIR = path.resolve(args[0] || '');
if (!args[0] || !fs.existsSync(path.join(DIR, 'parole-pulite.json'))) { console.error('uso: node pc/locale/doc-regia.mjs <cartella -pulizia>'); process.exit(1); }
const MODELLO = opz('--modello', process.env.MODELLO_REGIA || 'qwen3.8:27b');
const QUOTA_TU = Number(opz('--quota-tu', 0.25));
const SPAZIO = 1.8;          // secondi minimi tra due fermate
const BUCO = 4.0;            // oltre questo senza immagini serve una mossa
const log = (...a) => console.log('[doc-regia]', ...a);
const leggi = (n) => JSON.parse(fs.readFileSync(path.join(DIR, n), 'utf8'));

const parole = leggi('parole-pulite.json');
const DURATA = +(parole.at(-1).e + 0.3).toFixed(3);
const immagini = fs.existsSync(path.join(DIR, 'immagini.json')) ? leggi('immagini.json') : { cartella: '', elementi: [] };
const foto = immagini.elementi.filter((x) => /\.(jpe?g|png|webp)$/i.test(x.file)).sort((a, b) => a.inizio - b.inizio);
const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const testo = (ws) => ws.map((w) => w.w).join(' ').replace(/ (['-])/g, '$1');
const paroleIn = (da, a) => parole.filter((w) => w.s >= da - 0.05 && w.s < a);
// tempo della prima parola del parlato che comincia così, dentro [da, a)
const trova = (p, da, a) => {
  if (typeof p === 'number') return p;
  const n = norm(p);
  if (!n) return null;
  const w = parole.find((x) => x.s >= da - 0.3 && x.s < a && norm(x.w).startsWith(n));
  return w ? w.s : null;
};
async function chiedi(nome, prompt) {
  const file = path.join(DIR, `doc-regia-${nome}.json`);
  if (fs.existsSync(file) && !ha('--rifai-ai')) { const c = JSON.parse(fs.readFileSync(file, 'utf8')); if (c.prompt === prompt) return c.risposta; }
  for (let prova = 0; prova < 2; prova++) {
    try {
      const t = await chiediLocale(prompt, { modello: MODELLO, temperatura: 0.3, pensa: 'no' });
      const r = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
      fs.writeFileSync(file, JSON.stringify({ prompt, risposta: r }, null, 1));
      return r;
    } catch (e) { log(`${nome}: risposta non valida (${e.message.slice(0, 80)}), riprovo`); }
  }
  return {};
}

// ---------- frasi
const frasi = [];
let cur = [];
for (const [i, w] of parole.entries()) {
  cur.push(w);
  const pausa = parole[i + 1] ? parole[i + 1].s - w.e : 9;
  if (/[.?!]$/.test(w.w) || pausa > 0.7 || (cur.length > 28 && /[,;:]$/.test(w.w))) { frasi.push(cur); cur = []; }
}
if (cur.length) frasi.push(cur);
const F = frasi.map((ws, i) => ({ i, da: i === 0 ? 0 : ws[0].s, testo: testo(ws) }));
F.forEach((f, i) => { f.a = i + 1 < F.length ? F[i + 1].da : DURATA; });

// ---------- A. ruolo delle frasi → chi va in camera
const ruoli = await chiedi('ruoli', `Frasi di un video documentario (il narratore è in camera solo nei momenti salienti, il resto sono immagini).
Per ogni frase indica il ruolo e la forza.
- ruolo, uno di: gancio (apre il video e incuriosisce), fatto (evento, nome, scoperta), spiegazione (come funziona qualcosa), numero, data, opinione (giudizio personale del narratore), battuta (ironia, commento leggero), chiusura (morale finale, frase che chiude)
- forza da 1 a 3: quanto è un momento saliente da dire guardando in camera (3 = assolutamente, 1 = per niente)

${F.map((f) => `${f.i}. ${f.testo}`).join('\n')}

Rispondi SOLO con JSON: {"frasi": [{"i": 0, "ruolo": "...", "forza": N}]}`);
const ruolo = new Map((ruoli.frasi || []).map((r) => [Number(r.i), r]));
const inCamera = new Set([0]);   // il gancio si dice in camera
// candidati: chiusura, battute, opinioni (e qualunque frase con forza 3), dalla più forte; max 9 s ciascuna
const cand = F.slice(1).filter((f) => { const r = ruolo.get(f.i); return r && ['chiusura', 'battuta', 'opinione'].includes(r.ruolo) && r.forza >= 2 && f.a - f.da <= 9; })
  .sort((x, y) => (ruolo.get(y.i).forza - ruolo.get(x.i).forza) || ((ruolo.get(y.i).ruolo === 'chiusura') - (ruolo.get(x.i).ruolo === 'chiusura')));
const tempoTu = () => F.filter((f) => inCamera.has(f.i)).reduce((x, f) => x + f.a - f.da, 0);
for (const f of cand) {
  if (tempoTu() + (f.a - f.da) > QUOTA_TU * DURATA) continue;
  // mai due momenti in camera troppo vicini (meno di 8 s di immagini in mezzo), tranne frasi attaccate
  const vicino = [...inCamera].some((j) => Math.abs(j - f.i) > 1 && Math.min(Math.abs(F[j].a - f.da), Math.abs(f.a - F[j].da)) < 8);
  if (vicino) continue;
  // al massimo 12 s di fila in camera (frasi attaccate comprese)
  let fila = f.a - f.da;
  for (let j = f.i - 1; j >= 0 && inCamera.has(j); j--) fila += F[j].a - F[j].da;
  for (let j = f.i + 1; j < F.length && inCamera.has(j); j++) fila += F[j].a - F[j].da;
  if (fila > 12) continue;
  inCamera.add(f.i);
}

// ---------- segmenti: frasi consecutive con lo stesso modo
const segmenti = [];
for (const f of F) {
  const modo = inCamera.has(f.i) ? 'tu' : 'mondo';
  const u = segmenti.at(-1);
  if (u && u.modo === modo) { u.a = f.a; u.frasi.push(f.i); } else segmenti.push({ modo, da: f.da, a: f.a, frasi: [f.i] });
}
// un momento in camera troppo corto per entrare e uscire dalla stampa torna al mondo
for (const s of segmenti) if (s.modo === 'tu' && s.a - s.da < 2.4) s.modo = 'mondo';
for (let i = segmenti.length - 1; i > 0; i--) if (segmenti[i].modo === segmenti[i - 1].modo) { segmenti[i - 1].a = segmenti[i].a; segmenti[i - 1].frasi.push(...segmenti[i].frasi); segmenti.splice(i, 1); }

// ---------- B. fermate: le immagini in ordine di tempo
const tipoFoto = (f) => (/paper|pagina|page|arxiv|articolo|annuncio|documento|giornale/i.test(f) ? 'documento' : 'foto');
for (const s of segmenti.filter((x) => x.modo === 'mondo')) {
  s.fermate = [];
  for (const x of foto) {
    const t = Math.max(x.inizio, s.da + 0.1);
    if (x.inizio < s.da - 0.3 || t > s.a - 1.2) continue;
    if (s.fermate.length && t - s.fermate.at(-1).t < SPAZIO) continue;
    if (s.fermate.some((y) => y.file === x.file)) continue;
    s.fermate.push({ tipo: tipoFoto(x.file), file: x.file, t: +t.toFixed(3), motivo: x.motivo });
  }
  // buchi: tratti di più di BUCO secondi senza un protagonista nuovo
  s.buchi = [];
  const punti = [s.da, ...s.fermate.map((x) => x.t), s.a];
  for (let k = 0; k + 1 < punti.length; k++) {
    const da = k === 0 ? s.da : punti[k] + SPAZIO, a = punti[k + 1] - (k + 1 < punti.length - 1 ? 0.3 : 0);
    if ((k === 0 ? punti[1] - s.da > 2.5 : a - da > BUCO - SPAZIO) && a - da > 1.6) s.buchi.push({ da: +da.toFixed(3), a: +a.toFixed(3), testo: testo(paroleIn(da, a)) });
  }
}

// ---------- C. mosse nei buchi, eventi, etichette
const mondo = segmenti.filter((x) => x.modo === 'mondo');
const promptC = `Video documentario: una camera scorre su una scrivania d'archivio e si ferma su un protagonista alla volta (stampe, documenti, cartellini). Ti do i tratti del video, con le immagini già messe e i "buchi" senza immagini.

Per ogni BUCO scegli UN protagonista disegnato (campo "tipo"), quello che illustra meglio il parlato del buco:
- "cartellino": {"titolo": una data o un anno detto nel buco}
- "contatore": {"valore": numero intero detto, "sotto": unità in MAIUSCOLO}
- "curva": {"sotto": etichetta corta dell'asse, "esplode": parola su cui la curva schizza in alto} per crescita, esplosione, aumento
- "acronimo": {"lettere": [{"l": "G", "resto": "enerative", "parola": parola detta}]} se si spiega una sigla
- "frase": {"modo": "sequenza", "testo": frase d'esempio inventata di 12-20 parole che mostra il concetto, "via": parola detta da cui parte} oppure {"modo": "fili", "testo": frase d'esempio, "fili": [[indice parola, indice parola, "parola detta"]]} per spiegare un meccanismo
- "parola": {"titolo": UNA parola chiave} solo se niente altro va bene
- "documento": {"titolo": max 3 parole, "sotto": etichetta} per un nome di legge, paper, progetto
Ogni protagonista ha "parola": una parola detta nel buco su cui compare.

Per le IMMAGINI già messe (numero n):
- "etichette": 1-3 parole scritte a mano sotto la foto (nome, luogo, anno: non ripetere la frase detta)
- "eventi": al massimo uno per immagine e solo dove serve: {"n": numero, "tipo": "cerchio"|"timbro"|"barra", "parola": parola detta mentre è in vista, "testo": per timbro max 2 parole}. Cerchio per evidenziare un titolo o un dettaglio, timbro per un verdetto o un nome che "nasce", barra per qualcosa che fallisce o è sbagliato.

${mondo.map((s, si) => `TRATTO ${si} [${s.da.toFixed(1)}–${s.a.toFixed(1)} s]: ${F.filter((f) => s.frasi.includes(f.i)).map((f) => f.testo).join(' ')}
${s.fermate.map((x, n) => `  immagine ${n}: ${x.file} a ${x.t.toFixed(1)} s (${x.motivo})`).join('\n') || '  (nessuna immagine)'}
${s.buchi.map((b, bi) => `  BUCO ${bi} [${b.da.toFixed(1)}–${b.a.toFixed(1)} s]: "${b.testo}"`).join('\n')}`).join('\n\n')}

Rispondi SOLO con JSON: {"tratti": [{"tratto": 0, "buchi": [{"buco": 0, "eroe": {...}}], "etichette": {"0": "..."}, "eventi": [{...}]}]}`;
const risC = await chiedi('mosse', promptC);
const perTratto = new Map((risC.tratti || []).map((x) => [Number(x.tratto), x]));

// regole di riserva per un buco senza mossa valida
function riserva(b) {
  const ws = paroleIn(b.da, b.a);
  const anno = ws.find((w) => /^(1[89]\d\d|20\d\d)[.,]?$/.test(w.w));
  if (anno) return { tipo: 'cartellino', titolo: anno.w.replace(/[.,]$/, ''), parola: anno.s };
  const grande = ws.findIndex((w) => /^(milion|miliard|centinai)/i.test(w.w));
  if (grande >= 0) {
    const n = ws.slice(Math.max(0, grande - 2), grande).map((w) => parseFloat(w.w.replace(',', '.'))).find(Number.isFinite);
    const unita = /^miliard/i.test(ws[grande].w) ? 1e9 : /^centinai/i.test(ws[grande].w) ? 1e8 : 1e6;
    return { tipo: 'contatore', valore: Math.round((n || 1) * unita), sotto: (ws[grande + 1]?.w || ws[grande + 2]?.w || '').replace(/[^\p{L}]/gu, '').toUpperCase().slice(0, 12), da: ws[grande].s, a: Math.min(b.a, ws[grande].s + 2) };
  }
  return null;
}
const TIPI = new Set(['cartellino', 'contatore', 'curva', 'acronimo', 'frase', 'parola', 'documento']);
function valida(e, da, a) {
  if (!e || !TIPI.has(e.tipo)) return null;
  const t = trova(e.parola ?? '', da, a) ?? da + 0.2;
  const o = { ...e, parola: +t.toFixed(3) };
  delete o.file;
  if ((o.tipo === 'cartellino' || o.tipo === 'parola') && !o.titolo) return null;
  if (o.tipo === 'documento' && !o.titolo) return null;
  if (o.tipo === 'contatore') {
    // il numero deve essere detto davvero (Test 2: "254.808.972 PARAMETRI" inventato): cifre nel buco, o un numero
    // seguito da milioni/miliardi
    const ws = paroleIn(da, a), v = Math.round(+o.valore);
    const detti = ws.flatMap((w, k) => {
      const n = parseFloat(w.w.replace(/\./g, '').replace(',', '.'));
      const molt = /^milion/i.test(ws[k + 1]?.w || '') ? 1e6 : /^miliard/i.test(ws[k + 1]?.w || '') ? 1e9 : 1;
      const c = /^centinai/i.test(w.w) && /^milion/i.test(ws[k + 2]?.w || '') ? [1e8] : [];
      return Number.isFinite(n) ? [n * molt, ...c] : c;
    });
    if (!Number.isFinite(v) || !detti.some((d) => Math.abs(d - v) <= Math.max(1, d * 0.01))) return null; o.valore = Math.round(+o.valore); o.da = trova(o.da ?? '', da, a) ?? t; o.a = trova(o.a ?? '', da, a) ?? Math.min(a, t + 2); }
  if (o.tipo === 'curva') o.esplode = trova(o.esplode ?? '', da, a) ?? Math.min(a - 0.5, t + 2);
  if (o.tipo === 'acronimo') { if (!(o.lettere || []).length) return null; o.lettere = o.lettere.map((l, k) => ({ l: String(l.l || '').slice(0, 2),
      // "resto" senza la lettera iniziale (l'AI scriveva "Generative" invece di "enerative": usciva "GGenerative")
      resto: String(l.resto || '').toLowerCase().startsWith(String(l.l || '').toLowerCase()) ? String(l.resto).slice(String(l.l).length) : String(l.resto || ''), parola: trova(l.parola ?? '', da, a) ?? t + 0.5 * k })); }
  if (o.tipo === 'frase') {
    if (!o.testo || o.testo.split(/\s+/).length < 5) return null;
    const n = o.testo.split(/\s+/).length;
    o.via = trova(o.via ?? '', da, a) ?? t;
    if (o.modo === 'fili') {
      o.fili = (o.fili || []).filter(([x, y]) => x >= 0 && y >= 0 && x < n && y < n && x !== y).map(([x, y, p]) => [x, y, trova(p ?? '', da, a) ?? t + 1]);
      if (!o.fili.length) o.modo = 'sequenza';
    } else o.modo = 'sequenza';
  }
  return o;
}

// ---------- scene
let mosse = 0, eventiN = 0, riserve = 0;
const scene_titoli = new Set();
const scene = segmenti.map((s) => {
  if (s.modo === 'tu') return { da: +s.da.toFixed(3), a: +s.a.toFixed(3), modo: 'tu' };
  const si = mondo.indexOf(s), r = perTratto.get(si) || {};
  const eroi = s.fermate.map((x, n) => ({ tipo: x.tipo, file: x.file, parola: x.t, ...(x.tipo === 'foto' && r.etichette?.[n] ? { sotto: String(r.etichette[n]).slice(0, 24) } : {}) }));
  const eventi = [];
  s.buchi.forEach((b, bi) => {
    let e = valida((r.buchi || []).find((x) => Number(x.buco) === bi)?.eroe, b.da, b.a);
    if (e) mosse++; else { e = riserva(b); if (e) riserve++; }
    if (e) eroi.push(e);
  });
  eroi.sort((x, y) => x.parola - y.parola);
  // schede-parola: solo se servono davvero (non doppie, non a ridosso di un'immagine): Test 2 ne aveva 9 su 40 fermate
  const titoli = new Set();
  for (let k = eroi.length - 1; k >= 0; k--) {
    const e = eroi[k];
    if (e.tipo !== 'parola') continue;
    const vicini = eroi.filter((x) => x !== e && x.tipo !== 'parola' && Math.abs(x.parola - e.parola) < 3);
    const t = norm(e.titolo);
    if (vicini.length || titoli.has(t) || scene_titoli.has(t)) eroi.splice(k, 1); else { titoli.add(t); scene_titoli.add(t); }
  }
  // fermate troppo vicine dopo le aggiunte: si tiene la prima
  const tenuti = eroi.filter((e, k) => k === 0 || e.parola - eroi[k - 1].parola >= SPAZIO * 0.8);
  for (const ev of r.eventi || []) {
    const fermata = s.fermate[Number(ev.n)];
    const k = fermata ? tenuti.findIndex((e) => e.file === fermata.file) : -1;
    if (k < 0 || !['cerchio', 'timbro', 'barra'].includes(ev.tipo)) continue;
    const fine = k + 1 < tenuti.length ? tenuti[k + 1].parola : s.a;
    const t = trova(ev.parola ?? '', tenuti[k].parola, fine);
    if (t === null) continue;
    eventi.push({ tipo: ev.tipo, parola: +t.toFixed(3), su: k, ...(ev.tipo === 'timbro' ? { testo: String(ev.testo || '').slice(0, 14) } : {}) });
    eventiN++;
  }
  // eventi di riserva: cerchio sul titolo dei paper e documenti, barra sulle foto mentre si dice che qualcosa fallisce
  tenuti.forEach((e, k) => {
    if (eventi.some((x) => x.su === k)) return;
    const fine = k + 1 < tenuti.length ? tenuti[k + 1].parola : s.a;
    if (e.tipo === 'documento' && e.file && fine - e.parola > 1.6) { eventi.push({ tipo: 'cerchio', parola: +(e.parola + 0.7).toFixed(3), su: k, dy: -560, rx: 520, ry: 120 }); eventiN++; return; }
    const neg = paroleIn(e.parola, fine).find((w) => /^(fallis|fallì|fallimento|sbagli|errore|errat|fiasco)/i.test(w.w));
    if (e.tipo === 'foto' && neg) { eventi.push({ tipo: 'barra', parola: neg.s, su: k, dy: -80 }); eventiN++; }
  });
  // nessun protagonista (né immagini né mosse): una parola chiave lunga del tratto
  if (!tenuti.length) {
    const w = paroleIn(s.da, s.a).filter((x) => x.w.replace(/[^\p{L}]/gu, '').length >= 7).sort((x, y) => y.w.length - x.w.length)[0];
    tenuti.push({ tipo: 'parola', titolo: (w?.w || 'Archivio').replace(/[^\p{L}\d-]/gu, ''), parola: w?.s ?? s.da });
  }
  return { da: +s.da.toFixed(3), a: +s.a.toFixed(3), fermate: true, eroi: tenuti, eventi };
});

const tu = scene.filter((s) => s.modo === 'tu').reduce((x, s) => x + s.a - s.da, 0);
const fermate = scene.reduce((x, s) => x + (s.eroi?.length || 0), 0);
fs.writeFileSync(path.join(DIR, 'scene.json'), JSON.stringify({ tema: 'archivio', nota: `regia di ${MODELLO}`, scene }, null, 1));
log(`${scene.length} scene: in camera ${scene.filter((s) => s.modo === 'tu').length} volte (${(100 * tu / DURATA).toFixed(0)}% del tempo), ${fermate} fermate sul mondo (una ogni ${((DURATA - tu) / Math.max(1, fermate)).toFixed(1)} s), ${mosse} mosse dell'AI, ${riserve} di riserva, ${eventiN} eventi`);
for (const s of scene) {
  if (s.modo === 'tu') { console.log(`  ${s.da.toFixed(1).padStart(6)}–${s.a.toFixed(1).padEnd(6)} TU  ${F.filter((f) => f.da >= s.da && f.da < s.a).map((f) => `(${ruolo.get(f.i)?.ruolo} ${ruolo.get(f.i)?.forza})`).join(' ')}`); continue; }
  console.log(`  ${s.da.toFixed(1).padStart(6)}–${s.a.toFixed(1).padEnd(6)} ${s.eroi.map((e) => `${e.parola.toFixed(1)} ${e.tipo}${e.file ? ':' + e.file.slice(0, 22) : ''}${e.titolo ? ' "' + e.titolo + '"' : ''}`).join(' | ')}${s.eventi.map((e) => ` · ${e.tipo}`).join('')}`);
}
