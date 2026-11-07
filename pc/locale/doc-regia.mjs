// Stile Documentario, regia: dal parlato pulito e dalle immagini sulle parole alle scene del piano sequenza
// (scene.json, formato di pc/locale/esempi/documentario-test-2-scene.json, poi pc/locale/doc-mondo.mjs).
//   node pc/locale/doc-regia.mjs <cartella -pulizia> [--modello qwen3.8:27b] [--pensa low] [--rifai-ai] [--quota-tu 0.45]
// L'AI (una sola richiesta, in cache in doc-regia-ai.json) decide per ogni pezzo di parlato se va su Denis in camera
// (gancio, opinioni, commenti, battute, chiusura) o sul mondo, e per il mondo il protagonista (foto, documento, data,
// frase a macchina, curva, acronimo, contatore…) e l'evento sulla parola. Il codice controlla tutto: scene contigue,
// parole che esistono, immagini che esistono, durate minime, quota di Denis in camera.
import fs from 'node:fs';
import path from 'node:path';
import { chiediLocale } from './ollama.mjs';

const args = process.argv.slice(2);
const opz = (k, d = '') => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const ha = (k) => args.includes(k);
const DIR = path.resolve(args[0] || '');
if (!args[0] || !fs.existsSync(path.join(DIR, 'parole-pulite.json'))) { console.error('uso: node pc/locale/doc-regia.mjs <cartella -pulizia>'); process.exit(1); }
const MODELLO = opz('--modello', process.env.MODELLO_REGIA || 'qwen3.8:27b');
const QUOTA_TU = Number(opz('--quota-tu', 0.45));
const log = (...a) => console.log('[doc-regia]', ...a);
const leggi = (n) => JSON.parse(fs.readFileSync(path.join(DIR, n), 'utf8'));

const parole = leggi('parole-pulite.json');
const DURATA = +(parole.at(-1).e + 0.3).toFixed(3);
const immagini = fs.existsSync(path.join(DIR, 'immagini.json')) ? leggi('immagini.json') : { cartella: '', elementi: [] };
// solo immagini ferme (le GIF e le clip non sono oggetti di carta)
const foto = immagini.elementi.filter((x) => /\.(jpe?g|png|webp)$/i.test(x.file));

// frasi: punteggiatura forte o pause lunghe
const frasi = [];
let cur = [];
for (const [i, w] of parole.entries()) {
  cur.push(w);
  const pausa = parole[i + 1] ? parole[i + 1].s - w.e : 9;
  if (/[.?!]$/.test(w.w) || pausa > 0.7 || (cur.length > 28 && /[,;:]$/.test(w.w))) { frasi.push(cur); cur = []; }
}
if (cur.length) frasi.push(cur);
const testo = (ws) => ws.map((w) => w.w).join(' ').replace(/ (['-])/g, '$1');

// esempio compatto (prime 12 scene, JSON su una riga per scena): con l'esempio intero il contesto non stava più sulla
// scheda video e qwen3.8 andava a 5 token/s invece di 25
const esempio = JSON.parse(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), 'esempi', 'documentario-test-2-scene.json'), 'utf8'));
const ESEMPIO = '{"tema": "archivio", "scene": [\n' + esempio.scene.slice(0, 12).map((x) => JSON.stringify(x)).join(',\n') + ',\n…]}';
const prompt = `Sei il regista di un video documentario verticale per i social. Il video è UN SOLO piano sequenza: una camera che scorre su un mondo (una scrivania d'archivio con stampe, documenti, cartellini) senza mai tagliare. Il narratore (Denis) è anche in camera: quando parla "in camera" la camera entra in una sua foto appoggiata sulla scrivania finché lui è a tutto schermo.

Dividi il parlato in scene contigue (da 0 alla fine, senza buchi) e per ognuna decidi:
- "modo": "tu" (Denis in camera) per il gancio iniziale, le opinioni, i commenti, le battute, i passaggi personali, la chiusura. Circa il ${Math.round(QUOTA_TU * 100)}% del tempo, scene "tu" da 3 a 12 secondi.
- oppure il mondo: per fatti, date, nomi, numeri, spiegazioni tecniche. Ogni scena del mondo ha 1 o 2 protagonisti ("eroi"), 4 solo per un elenco di cose. Scene del mondo da 3 a 12 secondi.

Protagonisti possibili (campo "tipo"):
- "foto": {"file": immagine dalla lista, "sotto": 1-3 parole scritte a mano sotto}
- "documento": {"file": immagine dalla lista (paper, articolo, pagina)} oppure {"titolo": max 3 parole, "sotto": etichetta}
- "cartellino": {"titolo": una data o un anno, es. "2017" o "30.11.2022"}
- "parola": {"titolo": UNA parola chiave enorme}
- "frase": {"modo": "sequenza", "testo": una frase d'esempio inventata, 12-22 parole, che illustra il concetto, "via": parola del parlato da cui parte l'evidenziatore} oppure {"modo": "fili", "testo": frase d'esempio, "fili": [[indice parola, indice parola, "parola del parlato"]]} (fili tra parole legate)
- "curva": {"sotto": etichetta dell'asse, "esplode": parola del parlato su cui la curva schizza in alto} (crescita, esplosione)
- "acronimo": {"lettere": [{"l": "G", "resto": "enerative", "parola": parola del parlato}]}
- "contatore": {"valore": numero intero, "sotto": unità in maiuscolo, "da": parola, "a": parola}
Ogni protagonista ha "parola": la parola del parlato su cui diventa protagonista (deve esserci in quella scena).
Eventi facoltativi sulla parola ("eventi"): {"tipo": "cerchio"|"timbro"|"barra", "parola": parola del parlato, "testo": solo per timbro (max 2 parole), "su": indice del protagonista}.
L'ultima scena può essere {"finale": {"parola": parola del parlato, "ancora": id di un protagonista importante}, "eroi": []} per chiudere tornando su di lui con dei fili verso tutto il resto (dai "id" a quel protagonista).

Regole di leggibilità (le più importanti):
1. Un'idea per scena, un protagonista alla volta.
2. Non scrivere a schermo le frasi che il narratore dice: solo date, nomi, numeri e la parola chiave.
3. Meno è meglio: niente decorazioni inutili.
4. Usa le immagini della lista quando parlano della stessa cosa (sono già sulla parola giusta).
5. Si comincia con "tu" (gancio).

Esempio completo di un altro video (stesso formato):
${ESEMPIO}

PARLATO (tempi in secondi):
${frasi.map((f) => `[${f[0].s.toFixed(1)}–${f.at(-1).e.toFixed(1)}] ${testo(f)}`).join('\n')}

IMMAGINI DISPONIBILI (file → parola e tempo in cui sono nominate):
${foto.map((x) => `${x.file} → "${x.parola}" a ${x.inizio.toFixed(1)} s (${x.motivo})`).join('\n') || '(nessuna)'}

Durata totale: ${DURATA} s. Rispondi SOLO con il JSON {"tema": "archivio", "scene": [...]}.`;

const CACHE = path.join(DIR, 'doc-regia-ai.json');
let risposta = null;
if (fs.existsSync(CACHE) && !ha('--rifai-ai')) {
  const c = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
  if (c.prompt === prompt) risposta = c.risposta;
}
if (!risposta) {
  log(`chiedo la regia a ${MODELLO} (${frasi.length} frasi, ${foto.length} immagini)`);
  for (let prova = 0; prova < 2 && !risposta; prova++) {
    try {
      const t = await chiediLocale(prompt, { modello: MODELLO, temperatura: 0.3, pensa: opz('--pensa', 'no') });
      risposta = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
    } catch (e) { log(`risposta non valida (${e.message.slice(0, 80)}), riprovo`); }
  }
  if (!risposta) { console.error('[doc-regia] l\'AI non ha dato una regia valida'); process.exit(1); }
  fs.writeFileSync(CACHE, JSON.stringify({ prompt, risposta }, null, 1));
}

// ---------- controlli ----------
const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const esisteParola = (p, da, a) => typeof p === 'number' || parole.some((w) => w.s >= da - 0.6 && w.s <= a + 0.2 && norm(w.w).startsWith(norm(p)));
const fileOk = new Set(foto.map((x) => x.file));
// confine di scena sull'inizio della parola più vicina
const sullaParola = (t) => parole.reduce((b, w) => (Math.abs(w.s - t) < Math.abs(b - t) ? w.s : b), 0);
let scene = (risposta.scene || []).filter((s) => Number.isFinite(+s.da)).sort((x, y) => x.da - y.da);
scene.forEach((s, i) => { s.da = i === 0 ? 0 : +sullaParola(+s.da).toFixed(3); });
scene = scene.filter((s, i) => i === 0 || s.da > scene[i - 1].da + 0.5);
scene.forEach((s, i) => { s.a = i + 1 < scene.length ? scene[i + 1].da : DURATA; });

const TIPI = new Set(['foto', 'documento', 'cartellino', 'parola', 'frase', 'curva', 'acronimo', 'contatore']);
let corretti = 0;
for (const s of scene) {
  if (s.modo === 'tu') { delete s.eroi; delete s.eventi; continue; }
  if (s.finale) {
    if (!s.finale.ancora || !scene.some((x) => (x.eroi || []).some((e) => e.id === s.finale.ancora))) {
      // ancora che non esiste: il primo cartellino o la prima foto diventa l'ancora
      const e = scene.flatMap((x) => x.eroi || []).find((e) => e.tipo === 'cartellino') || scene.flatMap((x) => x.eroi || [])[0];
      if (e) { e.id = e.id || 'ancora'; s.finale.ancora = e.id; } else delete s.finale;
    }
    if (s.finale && !esisteParola(s.finale.parola, s.da, s.a)) s.finale.parola = s.da + 1;
    if (s.finale) { s.eroi = []; delete s.eventi; continue; }
  }
  s.eroi = (s.eroi || []).filter((e) => {
    if (!TIPI.has(e.tipo)) return false;
    if ((e.tipo === 'foto' || (e.tipo === 'documento' && e.file)) && !fileOk.has(e.file)) return false;
    if (e.tipo === 'frase' && (!e.testo || e.testo.split(/\s+/).length < 4)) return false;
    if (e.tipo === 'acronimo' && !(e.lettere || []).length) return false;
    if (e.tipo === 'contatore' && !Number.isFinite(+e.valore)) return false;
    if (e.tipo === 'parola' && !e.titolo) return false;
    if (e.tipo === 'cartellino' && !e.titolo) return false;
    return true;
  }).slice(0, 4);
  for (const e of s.eroi) {
    if (e.parola !== undefined && !esisteParola(e.parola, s.da, s.a)) { e.parola = s.da; corretti++; }
    for (const k of ['via', 'esplode', 'da', 'a']) if (typeof e[k] === 'string' && e.tipo !== 'contatore' && !esisteParola(e[k], s.da, s.a)) { e[k] = s.da + 0.5; corretti++; }
    if (e.tipo === 'contatore') for (const k of ['da', 'a']) if (!esisteParola(e[k] ?? '', s.da, s.a)) { e[k] = k === 'da' ? s.da + 0.3 : s.a - 0.3; corretti++; }
    if (e.tipo === 'frase' && e.modo === 'fili') {
      const n = e.testo.split(/\s+/).length;
      e.fili = (e.fili || []).filter(([a, b]) => a >= 0 && b >= 0 && a < n && b < n && a !== b).map(([a, b, p]) => [a, b, esisteParola(p, s.da, s.a) ? p : s.da + 1]);
      if (!e.fili.length) e.modo = 'sequenza';
    }
    if (e.tipo === 'acronimo') e.lettere = e.lettere.map((l) => ({ ...l, parola: esisteParola(l.parola, s.da, s.a) ? l.parola : s.da + 0.5 }));
    e.valore = e.valore !== undefined ? Math.round(+e.valore) : undefined;
  }
  s.eventi = (s.eventi || []).filter((ev) => ['cerchio', 'timbro', 'barra'].includes(ev.tipo) && esisteParola(ev.parola, s.da, s.a) && (ev.su ?? 0) < s.eroi.length);
  // nessun protagonista valido: la foto di immagini.json più vicina, o Denis in camera
  if (!s.eroi.length) {
    const f = foto.find((x) => x.inizio >= s.da - 0.3 && x.inizio < s.a);
    if (f) s.eroi = [{ tipo: 'foto', file: f.file, parola: f.parola }];
    else { s.modo = 'tu'; delete s.eroi; delete s.eventi; }
    corretti++;
  }
}
// scene del mondo troppo corte (Test 2: "RLHF" per 1,4 s): diventano il secondo protagonista della scena prima
for (let i = scene.length - 1; i > 0; i--) {
  const s = scene[i], p = scene[i - 1];
  if (s.modo !== 'tu' && !s.finale && s.a - s.da < 2.5 && p.modo !== 'tu' && !p.finale && (p.eroi.length + s.eroi.length) <= 2) {
    const off = p.eroi.length;
    p.eroi.push(...s.eroi.map((e) => ({ ...e, parola: e.parola ?? s.da })));
    p.eventi = [...(p.eventi || []), ...(s.eventi || []).map((ev) => ({ ...ev, su: (ev.su ?? 0) + off }))];
    p.a = s.a; scene.splice(i, 1); corretti++;
  }
}
// quota di Denis in camera (l'AI ne mette troppo poco: Test 2 il 6%): le scene con solo una foto, senza eventi,
// diventano "tu", prima le più lunghe; quelle con date, curve, acronimi, contatori, frasi restano sul mondo
const quotaTu = () => scene.filter((s) => s.modo === 'tu').reduce((x, s) => x + s.a - s.da, 0) / DURATA;
const generica = (s) => s.modo !== 'tu' && !s.finale && s.eroi.every((e) => e.tipo === 'foto') && !(s.eventi || []).length;
const candidati = scene.filter((s, i) => i > 0 && generica(s) && s.a - s.da >= 3).sort((x, y) => (y.a - y.da) - (x.a - x.da));
for (const s of candidati) {
  if (quotaTu() >= QUOTA_TU - 0.04) break;
  // al massimo 12 s di fila in camera (contando le scene "tu" accanto, che poi si uniscono)
  const i = scene.indexOf(s);
  let lungo = s.a - s.da;
  for (let j = i - 1; j >= 0 && scene[j].modo === 'tu'; j--) lungo += scene[j].a - scene[j].da;
  for (let j = i + 1; j < scene.length && scene[j].modo === 'tu'; j++) lungo += scene[j].a - scene[j].da;
  if (lungo > 12) continue;
  s.modo = 'tu'; delete s.eroi; delete s.eventi; corretti++;
}
if (quotaTu() < QUOTA_TU - 0.1) log(`attenzione: Denis in camera solo il ${(quotaTu() * 100).toFixed(0)}% (troppe scene con date, grafici o frasi)`);
// scene "tu" troppo corte per entrare e uscire dalla stampa: si uniscono alla scena prima
for (let i = scene.length - 1; i > 0; i--) {
  const s = scene[i];
  if (s.modo === 'tu' && s.a - s.da < 2.4) { scene[i - 1].a = s.a; scene.splice(i, 1); corretti++; }
}
// scene "tu" consecutive: una sola
for (let i = scene.length - 1; i > 0; i--) if (scene[i].modo === 'tu' && scene[i - 1].modo === 'tu') { scene[i - 1].a = scene[i].a; scene.splice(i, 1); }
if (scene[0]?.modo !== 'tu' && scene[0]) log('attenzione: il video non comincia con Denis in camera');

const tu = scene.filter((s) => s.modo === 'tu').reduce((x, s) => x + s.a - s.da, 0);
const uscita = { tema: ['archivio', 'bacheca', 'mappa'].includes(risposta.tema) ? risposta.tema : 'archivio', nota: `regia di ${MODELLO}`, scene };
fs.writeFileSync(path.join(DIR, 'scene.json'), JSON.stringify(uscita, null, 1));
log(`${scene.length} scene (${scene.filter((s) => s.modo === 'tu').length} in camera, ${(100 * tu / DURATA).toFixed(0)}% del tempo), ${corretti} correzioni del codice → ${path.join(DIR, 'scene.json')}`);
for (const s of scene) console.log(`  ${s.da.toFixed(1).padStart(6)}–${s.a.toFixed(1).padEnd(6)} ${s.modo === 'tu' ? 'TU' : s.finale ? `finale → ${s.finale.ancora}` : s.eroi.map((e) => `${e.tipo}${e.file ? ':' + e.file : ''}${e.titolo ? ' "' + e.titolo + '"' : ''}`).join(' + ')}${(s.eventi || []).map((e) => ` · ${e.tipo}@${e.parola}`).join('')}`);
