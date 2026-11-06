// Stile Unboxing (flusso locale): niente presentatore, solo le riprese del prodotto. Dalla cartella con le clip
// alla timeline verticale in DaVinci, montata sul battito della musica, con titolo, schede delle caratteristiche
// e chiusura. AI locali (Ollama), niente token.
//   node pc/locale/unboxing.mjs <cartella> [--titolo X] [--durata 40] [--musica file|cartella] [--senza-gancio]
//                               [--4k] [--senza-davinci] [--con-davinci] [--rifai-ai]
// Nella cartella:
//   - le clip (mp4/mov/m4v): una ripresa lunga, tante clip brevi o tutte e due; l'ordine è quello di ripresa
//   - prodotto.txt (facoltativo): prima riga il nome del prodotto, poi una caratteristica per riga
//   - immagini (facoltative): ognuna diventa una scheda col suo nome come testo ("50 db.jpg" → "50 dB");
//     se c'è prodotto.txt, un'immagine si abbina alla riga con lo stesso nome
//   - un file audio (voce fuori campo): NON ancora gestito, si usano i suoni veri + musica
// Passi (ognuno riusa il risultato se c'è già):
//   1. analisi delle clip (movimento, nitidezza, volume ogni 0,5 s) e battiti della musica
//   2. l'AI che vede (qwen3-vl:8b) guarda un fotogramma ogni 2 s: fase, cosa si vede, prodotto visibile, nitidezza, gesto
//   3. montaggio: gancio (il prodotto più bello) col titolo, poi i momenti migliori di ogni fase in ordine di ripresa,
//      tagli sui battiti; schede sulle inquadrature giuste (qwen3.8); chiusura sull'ultima inquadratura
//   4. grafica trasparente (Remotion, composizione Unboxing)   5. audio: suoni veri, musica, effetti (-14 LUFS)
//   6. timeline in DaVinci: V1 clip, V2 grafica, A1 suoni veri, A2 musica, A3 effetti
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chiediLocale } from './ollama.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opz = (k, d = '') => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const ha = (k) => args.includes(k);
const DIR = path.resolve(args[0] || '');
if (!args[0] || !fs.existsSync(DIR) || !fs.statSync(DIR).isDirectory()) {
  console.error('uso: node pc/locale/unboxing.mjs <cartella con le clip> [--titolo X] [--durata 40]'); process.exit(1);
}
const log = (...a) => console.log('[unboxing]', ...a);
const t00 = Date.now();
const passo = (n, testo) => console.log(`\n[unboxing] ${n}. ${testo}  (${((Date.now() - t00) / 60000).toFixed(1)} min)`);
const PY = path.join(ROOT, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const run = (cmd, a, o = {}) => {
  const r = spawnSync(cmd, a, { stdio: 'inherit', cwd: ROOT, shell: process.platform === 'win32' && cmd === 'npx', env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, ...o });
  if (r.status !== 0) { console.error(`[unboxing] fermo: ${path.basename(cmd)} ${a[0] ? path.basename(String(a[0])) : ''} è uscito con ${r.status}`); process.exit(1); }
};
const py = (...a) => run(PY, [path.join(ROOT, 'pc', 'locale', 'unboxing.py'), ...a]);
const leggi = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const sonda = (f) => JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:format_tags=creation_time:stream=codec_type,width,height,r_frame_rate:stream_side_data=rotation',
  '-of', 'json', f], { encoding: 'utf8' }).stdout);

// ---------- cartella: clip, testo, immagini, nome del prodotto
const nomi = fs.readdirSync(DIR);
const clip = nomi.filter((n) => /\.(mp4|mov|m4v)$/i.test(n)).map((n) => {
  const f = path.join(DIR, n), s = sonda(f), v = s.streams.find((x) => x.codec_type === 'video');
  const [a, b] = v.r_frame_rate.split('/').map(Number);
  const ruota = Math.abs(Number(v.side_data_list?.[0]?.rotation || 0)) % 180 === 90;
  return { file: f, nome: n, durata: Number(s.format.duration), fps: a / (b || 1), fpsTesto: v.r_frame_rate, w: ruota ? v.height : v.width, h: ruota ? v.width : v.height,
    quando: s.format.tags?.creation_time || fs.statSync(f).mtime.toISOString(), audio: s.streams.some((x) => x.codec_type === 'audio') };
}).sort((x, y) => x.quando.localeCompare(y.quando) || x.nome.localeCompare(y.nome));
if (!clip.length) { console.error(`[unboxing] nessuna clip in ${DIR}`); process.exit(1); }
if (nomi.some((n) => /\.(wav|mp3|m4a|aac|flac)$/i.test(n))) log('ATTENZIONE: c\'è un file audio (voce?) ma la voce fuori campo non è ancora gestita: uso suoni veri + musica');
const testoProdotto = nomi.find((n) => /^prodotto\.txt$/i.test(n));
const righe = testoProdotto ? fs.readFileSync(path.join(DIR, testoProdotto), 'utf8').split(/\r?\n/).map((x) => x.trim()).filter(Boolean) : [];
const immagini = nomi.filter((n) => /\.(jpe?g|png|webp)$/i.test(n)).sort();
const base = (n) => n.replace(/\.[^.]+$/, '');
const semplice = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// unità scritte come si deve: "50 db" → "50 dB", "46 ore" resta
const ripulisci = (s) => s.replace(/\b(\d+)\s*db\b/gi, '$1 dB').replace(/\bmah\b/gi, 'mAh').replace(/\b(\d+)\s*hz\b/gi, '$1 Hz').replace(/^./, (c) => c.toUpperCase());
// nome del prodotto: --titolo, prima riga di prodotto.txt, o cartella (con la cartella sopra se è la marca: HONOR/Earbuds 4)
const sopra = path.basename(path.dirname(DIR));
const generica = /^(desktop|scrivania|download|downloads|documenti|documents|video|videos|[a-z]:\\?)$/i.test(sopra) || sopra === os.userInfo().username;
const titolo = opz('--titolo') || righe[0] || (generica ? path.basename(DIR) : `${sopra} ${path.basename(DIR)}`);
// immagine "di presentazione" (nome col nome del prodotto o "colori"): non è una caratteristica, va nella chiusura
const eDiPresentazione = (n) => /colori|colors|gamma|famiglia/i.test(n);
let schede = (righe.length > 1 ? righe.slice(1) : immagini.filter((n) => !eDiPresentazione(n)).map(base)).map((t) => {
  const img = immagini.find((n) => semplice(base(n)) === semplice(t));
  return { testo: ripulisci(t), file: img || null };
});
const immagineChiusura = immagini.find(eDiPresentazione) || null;
const slug = titolo.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
const LAV = path.join(ROOT, 'work', 'locale', `unboxing-${slug}`);
fs.mkdirSync(LAV, { recursive: true });
log(`"${titolo}": ${clip.length} clip (${clip.reduce((s, c) => s + c.durata, 0).toFixed(0)} s), ${schede.length} schede${immagineChiusura ? ', immagine di chiusura ' + immagineChiusura : ''}, lavoro in ${LAV}`);

// DaVinci aperto tiene ~6 GB della scheda video e l'AI rallenta fino a 50 volte: si apre solo all'ultimo passo
const RESOLVE_EXE = 'C:\\Program Files\\Blackmagic Design\\DaVinci Resolve\\Resolve.exe';
const davinciAperto = () => process.platform === 'win32' && /Resolve\.exe/i.test(spawnSync('tasklist', ['/FI', 'IMAGENAME eq Resolve.exe'], { encoding: 'utf8' }).stdout || '');
if (davinciAperto() && !ha('--con-davinci') && !ha('--senza-davinci')) {
  console.error("[unboxing] fermo: DaVinci Resolve è aperto e occupa la scheda video. Chiudilo: lo apro io all'ultimo passo. Per andare avanti lo stesso: --con-davinci");
  process.exit(1);
}

// ---------- 1. analisi e musica
passo(1, 'analisi delle clip e della musica');
for (const [k, c] of clip.entries()) {
  c.analisi = path.join(LAV, `analisi-${k + 1}.json`);
  if (!fs.existsSync(c.analisi)) py('analisi', c.file, c.analisi);
  c.misure = leggi(c.analisi);
}
const SFX = process.env.SFX_DIR || 'G:/Il mio Drive/12 · Risorse/SFX — regista';
// musica: --musica (file o cartella), altrimenti "10 Musica/unboxing" se c'è qualcosa, se no "10 Musica/tech".
// Il brano si sceglie dal nome del prodotto: stesso prodotto = stesso brano a ogni rilancio.
function scegliMusica() {
  const m = opz('--musica');
  if (m && fs.existsSync(m) && fs.statSync(m).isFile()) return path.resolve(m);
  for (const d of [m, path.join(SFX, '10 Musica', 'unboxing'), path.join(SFX, '10 Musica', 'tech')].filter(Boolean)) {
    const fs_ = fs.existsSync(d) ? fs.readdirSync(d).filter((n) => /\.(mp3|wav|m4a|flac)$/i.test(n)).sort() : [];
    if (fs_.length) return path.join(d, fs_[[...slug].reduce((s, ch) => s + ch.charCodeAt(0), 0) % fs_.length]);
  }
  return null;
}
const MUSICA = scegliMusica();
let ritmo = { periodo: 0.5, battiti: [0] };
if (MUSICA) {
  const fb = path.join(LAV, `battiti-${semplice(path.basename(MUSICA)).replace(/ /g, '-').slice(0, 40)}.json`);
  if (!fs.existsSync(fb)) py('battiti', MUSICA, fb);
  ritmo = leggi(fb);
  log(`musica: ${path.basename(MUSICA)} (${ritmo.bpm} bpm)`);
} else log('musica: nessuna trovata, tagli ogni mezzo secondo');

// ---------- 2. l'AI guarda le clip: un fotogramma ogni 2 s (il più nitido della finestra)
passo(2, 'l\'AI guarda le clip');
const FINESTRA = 2;
const FASI = ['scatola', 'apertura', 'interno', 'prodotto', 'dettaglio', 'accessori', 'app', 'uso', 'vuoto'];
const PROMPT = `Questo è un fotogramma di un video di unboxing (si vedono solo le mani e il prodotto: "{{PRODOTTO}}").
Descrivi con precisione cosa tengono le mani e cosa c'è sul tavolo. Rispondi SOLO con JSON:
{"cosa": "...", "fase": "...", "prodotto_visibile": N, "nitido": N, "gesto": N}
- fase, una di: scatola (confezione chiusa, mostrata o girata), apertura (si apre la scatola, si toglie pellicola o un coperchio), interno (scatola aperta col contenuto ancora dentro), prodotto (il prodotto ben visibile in mano o appoggiato), dettaglio (primissimo piano di un particolare del prodotto), accessori (cavi, manuali, carte, sacchetti, adattatori), app (schermo di telefono o computer con un'app o le impostazioni), uso (il prodotto indossato o usato), vuoto (niente di interessante: mani che cercano, tavolo vuoto, inquadratura confusa)
- cosa: 6-12 parole precise in italiano su cosa succede (es. "toglie il coperchio della custodia")
- prodotto_visibile da 0 a 3: 0 il prodotto non si vede, 3 il prodotto è il soggetto e si vede bene. Fogli, manuali, scatole vuote e imballi NON sono il prodotto.
- nitido da 0 a 3: 0 mosso o sfocato, 3 perfettamente nitido
- gesto da 0 a 3: 0 nessuna azione interessante, 3 gesto chiaro e bello da vedere (aprire, estrarre, mostrare)`;
const FILE_VISTA = path.join(LAV, 'vista-2.json');
const vista = fs.existsSync(FILE_VISTA) && !ha('--rifai-ai') ? leggi(FILE_VISTA) : {};
const momenti = [];
// qwen3-vl distingue meglio le fasi di gemma4:12b (Earbuds 4: scatola chiusa presa per "prodotto" da gemma), ~1 s a fotogramma
const MODELLO_VISTA = process.env.MODELLO_VISTA_UNBOXING || 'qwen3-vl:8b-instruct';
for (const [k, c] of clip.entries()) {
  const P = c.misure.passo, nit = c.misure.nitidezza;
  const cartFot = path.join(LAV, `fotogrammi-${k + 1}`);
  if (!fs.existsSync(path.join(cartFot, 'fatto'))) {
    fs.mkdirSync(cartFot, { recursive: true });
    run('ffmpeg', ['-v', 'error', '-y', '-hwaccel', 'cuda', '-i', c.file, '-vf', `fps=${1 / P},scale=-2:768`, '-q:v', '4', path.join(cartFot, '%05d.jpg')]);
    fs.writeFileSync(path.join(cartFot, 'fatto'), '');
  }
  for (let w = 0; w + 0.6 <= c.durata; w += FINESTRA) {
    const i0 = Math.round(w / P), i1 = Math.min(nit.length, Math.round((w + FINESTRA) / P));
    if (i1 <= i0) continue;
    let im = i0;
    for (let i = i0; i < i1; i++) if (nit[i] > nit[im]) im = i;
    const chiave = `${c.nome}@${w}`;
    if (!vista[chiave]) {
      const img = path.join(cartFot, String(im + 1).padStart(5, '0') + '.jpg');
      if (!fs.existsSync(img)) continue;
      for (let prova = 0; prova < 2 && !vista[chiave]; prova++) {
        try {
          const r = await fetch(`${process.env.OLLAMA_HOST || 'http://127.0.0.1:11434'}/api/chat`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ model: MODELLO_VISTA, stream: false, format: 'json', think: false, options: { temperature: 0.1 },
              messages: [{ role: 'user', content: PROMPT.replace('{{PRODOTTO}}', titolo), images: [fs.readFileSync(img).toString('base64')] }] }),
          });
          const j = JSON.parse((await r.json()).message.content);
          const n = (x) => Math.max(0, Math.min(3, Number(x) || 0));
          const pv = n(j.prodotto_visibile), ni = n(j.nitido), ge = n(j.gesto);
          // voto 1–5: conta di più vedere il prodotto, poi la nitidezza, poi il gesto
          vista[chiave] = { fase: FASI.includes(j.fase) ? j.fase : 'vuoto', cosa: String(j.cosa || '').slice(0, 90), pv, ni, ge,
            voto: +(1 + 4 * (2 * pv + 1.5 * ni + ge) / 13.5).toFixed(2) };
        } catch (e) { log(`AI che vede: errore su ${chiave} (${e.message}), riprovo`); }
      }
      if (!vista[chiave]) continue;
      fs.writeFileSync(FILE_VISTA, JSON.stringify(vista, null, 1));
      process.stdout.write(`  ${c.nome} ${w}s: ${vista[chiave].fase} ${vista[chiave].voto} · ${vista[chiave].cosa}\n`);
    }
    momenti.push({ clip: k, da: w, a: Math.min(c.durata, w + FINESTRA), meglio: im * P, ...vista[chiave] });
  }
}
const conta = Object.fromEntries(FASI.map((f) => [f, momenti.filter((m) => m.fase === f).length]));
log('momenti per fase:', Object.entries(conta).filter(([, n]) => n).map(([f, n]) => `${f} ${n}`).join(', '));

// ---------- 3. montaggio
passo(3, 'montaggio');
const B = ritmo.periodo;
const totale = clip.reduce((s, c) => s + c.durata, 0);
const DURATA = Math.min(Number(opz('--durata', 40)), totale * 0.7);
// lunghezza tipica di un'inquadratura per fase (s, poi arrotondata ai battiti) e quota del video
const LUNGO = { scatola: 1.7, apertura: 1.1, interno: 1.3, prodotto: 1.9, dettaglio: 1.3, accessori: 1.0, app: 1.5, uso: 1.9 };
const QUOTA = { scatola: 0.07, apertura: 0.16, interno: 0.08, prodotto: 0.26, dettaglio: 0.14, accessori: 0.07, app: 0.11, uso: 0.08 };
const battitiDi = (s) => Math.max(B < 0.42 ? 2 : 1, Math.round(s / B));
const nitMedia = (m, da, a) => {
  const c = clip[m.clip], P = c.misure.passo, x = c.misure.nitidezza.slice(Math.floor(da / P), Math.max(Math.floor(da / P) + 1, Math.ceil(a / P)));
  return x.reduce((s, v) => s + v, 0) / x.length;
};
const nitMax = Math.max(...clip.flatMap((c) => c.misure.nitidezza));
const punteggio = (m) => m.voto + 0.6 * nitMedia(m, m.da, m.a) / nitMax;
// senza il prodotto in vista (fogli, manuali, imballi) si tengono solo scatola, apertura e app (Earbuds 4: 7 s di fogli)
const buoni = momenti.filter((m) => m.fase !== 'vuoto' && m.voto >= 2.6 && (m.ni ?? 3) >= 1 && ((m.pv ?? 3) >= 1 || ['scatola', 'apertura', 'app'].includes(m.fase))
  // il modello vede le cuffie anche dove le mani tengono il manuale: conta anche la descrizione
  && !/foglio|fogli|manuale|guida|garanzia|istruzioni|carta|libretto|adesiv/i.test(m.cosa));
const presenti = Object.keys(QUOTA).filter((f) => buoni.some((m) => m.fase === f));
const quotaTot = presenti.reduce((s, f) => s + QUOTA[f], 0);
// inquadratura dentro il momento: l'inizio con la media di nitidezza più alta (a passi di 0,5 s)
function taglio(m, dur) {
  const c = clip[m.clip];
  let best = null;
  for (let s = Math.max(0, m.da - 0.5); s <= m.a - Math.min(dur, FINESTRA) + 0.001 && s + dur <= c.durata; s += 0.5) {
    const v = nitMedia(m, s, s + dur);
    if (!best || v > best.v) best = { s, v };
  }
  return best ? best.s : Math.max(0, Math.min(m.da, c.durata - dur));
}
const usati = new Set();
const sovrappone = (m) => [...usati].some((u) => u.clip === m.clip && m.da < u.a && m.a > u.da);
const scelti = [];
// gancio: il prodotto più bello all'inizio, sotto il titolo (come nei riferimenti Miyoo e mouse)
// gancio: prodotto ben visibile e nitido, mani ferme (poco movimento)
const motoMedio = (m) => { const c = clip[m.clip], P = c.misure.passo, x = c.misure.moto.slice(Math.floor(m.da / P), Math.ceil(m.a / P)); return x.reduce((s, v) => s + v, 0) / Math.max(1, x.length); };
const motoMax = Math.max(...momenti.map(motoMedio), 1);
const candidatiGancio = buoni.filter((m) => ['prodotto', 'dettaglio', 'uso'].includes(m.fase) && (m.pv ?? 3) >= 3 && (m.ni ?? 3) >= 3)
  .sort((x, y) => (punteggio(y) - motoMedio(y) / motoMax) - (punteggio(x) - motoMedio(x) / motoMax));
// i voti assoluti finiscono quasi tutti al massimo (Earbuds 4: 5 su 5 anche sui fogli del manuale): per gancio e
// chiusura l'AI che vede CONFRONTA i 12 candidati migliori in una griglia numerata e sceglie i due più belli
const FILE_COPERTINA = path.join(LAV, 'copertina.json');
async function scegliCopertine(cand) {
  const chiave = cand.map((m) => `${m.clip}@${m.da}`).join(',');
  if (fs.existsSync(FILE_COPERTINA) && !ha('--rifai-ai')) { const c = leggi(FILE_COPERTINA); if (c.chiave === chiave) return c.scelte; }
  const griglia = path.join(LAV, 'copertine.jpg');
  // font copiato nella cartella di lavoro e ffmpeg lanciato da lì: i due punti di "C:" rompono il filtro drawtext
  const font = 'numeri.ttf';
  if (!fs.existsSync(path.join(LAV, font))) fs.copyFileSync('C:/Windows/Fonts/arialbd.ttf', path.join(LAV, font));
  const ingressi = cand.flatMap((m) => ['-i', path.join(LAV, `fotogrammi-${m.clip + 1}`, String(Math.round(m.meglio / clip[m.clip].misure.passo) + 1).padStart(5, '0') + '.jpg')]);
  const filtri = cand.map((_, i) => `[${i}]scale=270:480:force_original_aspect_ratio=increase,crop=270:480,drawtext=fontfile='${font}':text='${i + 1}':x=12:y=10:fontsize=54:fontcolor=yellow:borderw=4:bordercolor=black[v${i}]`).join(';')
    + ';' + cand.map((_, i) => `[v${i}]`).join('') + `xstack=inputs=${cand.length}:layout=${cand.map((_, i) => `${(i % 4) * 270}_${Math.floor(i / 4) * 480}`).join('|')}:fill=black`;
  run('ffmpeg', ['-v', 'error', '-y', ...ingressi, '-filter_complex', filtri, '-frames:v', '1', griglia], { cwd: LAV });
  const prompt = `Griglia di ${cand.length} fotogrammi numerati (numero giallo in alto a sinistra) da un unboxing di "${titolo}".
Scegli i due fotogrammi migliori come copertina del video: il prodotto (non la scatola, non fogli o manuali) è il soggetto, nitido, ben illuminato, bello da vedere, composizione pulita.
Rispondi SOLO con JSON: {"primo": N, "secondo": N, "perche": "..."}`;
  let scelte = [0, 1];
  try {
    const r = await (await fetch(`${process.env.OLLAMA_HOST || 'http://127.0.0.1:11434'}/api/chat`, { method: 'POST', body: JSON.stringify({ model: MODELLO_VISTA, stream: false, format: 'json', think: false,
      options: { temperature: 0.1 }, messages: [{ role: 'user', content: prompt, images: [fs.readFileSync(griglia).toString('base64')] }] }) })).json();
    const j = JSON.parse(r.message.content);
    const a = Number(j.primo) - 1, b = Number(j.secondo) - 1;
    if (cand[a]) scelte = [a, cand[b] && b !== a ? b : (a === 0 ? 1 : 0)];
    log(`copertine: ${scelte.map((i) => `${clip[cand[i].clip].nome.slice(-12)} ${cand[i].da}s`).join(' e ')} (${j.perche || ''})`);
  } catch (e) { log(`scelta delle copertine non riuscita (${e.message}): uso i voti`); }
  fs.writeFileSync(FILE_COPERTINA, JSON.stringify({ chiave, scelte }));
  return scelte;
}
let gancio = null, finaleScelto = null;
if (candidatiGancio.length) {
  // al massimo 12, distanti almeno 4 s tra loro (sennò la griglia è tutta uguale)
  const cand = [];
  for (const m of candidatiGancio) if (cand.length < 12 && cand.every((c) => c.clip !== m.clip || Math.abs(c.da - m.da) >= 4)) cand.push(m);
  const [a, b] = cand.length > 1 ? await scegliCopertine(cand) : [0, null];
  if (!ha('--senza-gancio')) { gancio = { ...cand[a], nb: battitiDi(2.0) }; usati.add(cand[a]); }
  if (b !== null && cand[b]) { finaleScelto = cand[b]; usati.add(cand[b]); }
}
for (const f of presenti) {
  const budget = DURATA * QUOTA[f] / quotaTot;
  let preso = 0;
  for (const m of buoni.filter((x) => x.fase === f).sort((x, y) => punteggio(y) - punteggio(x))) {
    if (preso >= budget - B * 0.5) break;
    if (sovrappone(m)) continue;
    // nella stessa fase inquadrature distanti almeno 4 s nella ripresa: niente tre pezzi di fila della stessa scatola
    if (scelti.some((q) => q.fase === f && q.clip === m.clip && Math.abs(q.da - m.da) < 2 * FINESTRA)) continue;
    const nb = battitiDi(LUNGO[f]);
    usati.add(m); scelti.push({ ...m, nb }); preso += nb * B;
  }
}
// in ordine di ripresa; l'ultima inquadratura (chiusura) è la più bella tra prodotto/uso rimaste, tenuta più a lungo
scelti.sort((x, y) => x.clip - y.clip || x.da - y.da);
const finale = finaleScelto || buoni.filter((m) => ['prodotto', 'uso', 'dettaglio'].includes(m.fase) && !usati.has(m) && !sovrappone(m)).sort((x, y) => punteggio(y) - punteggio(x))[0];
const sequenza = [...(gancio ? [gancio] : []), ...scelti, ...(finale ? [{ ...finale, nb: battitiDi(3.0) }] : [])];
// tempi sui battiti: ogni taglio cade su un battito della musica (la musica parte dal suo primo battito)
const FPS = 30000 / 1001;
const TW = 2160, TH = 3840;
let t = 0;
const pezzi = [];
for (const [i, m] of sequenza.entries()) {
  const c = clip[m.clip];
  const dur = m.nb * B;
  let da = taglio(m, dur);
  // mai rivedere lo stesso gesto: se si sovrappone a un pezzo già messo della stessa clip, parte dove quello finisce
  for (const q of pezzi) if (q.clipN === m.clip && da < q.a && da + dur > q.da && q.a + dur <= c.durata) da = q.a;
  // geometria: la clip copre lo schermo verticale (zoom per coprire, centrata); salti sulla stessa ripresa a meno di
  // 8 s di distanza: un colpo di zoom alternato (1 → 1,12) per farli sembrare voluti
  const adatta = Math.min(TW / c.w, TH / c.h), copre = Math.max(TW / (c.w * adatta), TH / (c.h * adatta));
  const prima = pezzi.at(-1);
  const salto = prima && prima.clipN === m.clip && Math.abs(da - prima.a) < 8;
  const pugno = salto && prima.pugno === 1 ? 1.12 : 1;
  pezzi.push({ file: c.file, fps: c.fpsTesto, clipN: m.clip, da: +da.toFixed(3), a: +(da + dur).toFixed(3), t: +t.toFixed(3), t2: +(t + dur).toFixed(3),
    zoom: +(copre * pugno).toFixed(4), pan: 0, tilt: 0, pugno, fase: m.fase, cosa: m.cosa, voto: m.voto, gancio: i === 0 && !!gancio });
  t += dur;
}
const D = +t.toFixed(3);
log(`${pezzi.length} inquadrature, ${D.toFixed(1)} s (obiettivo ${DURATA.toFixed(0)} s, ${ritmo.bpm || '?'} bpm)`);
for (const p of pezzi) console.log(`  ${p.t.toFixed(2).padStart(6)}  ${path.basename(p.file).slice(-12)} ${p.da.toFixed(1).padStart(5)}–${p.a.toFixed(1).padEnd(5)} ${p.fase.padEnd(9)} ${p.voto} ${p.cosa}${p.pugno > 1 ? ' [zoom]' : ''}`);

// schede: l'AI (qwen3.8) abbina ogni caratteristica all'inquadratura più adatta; le altre in fila sulle inquadrature
// del prodotto. Mai sul titolo (prime 2,4 s) né sulla chiusura (ultime 3 s), una alla volta, ~2,4 s ciascuna.
const DUR_SCHEDA = Math.max(2.2, battitiDi(2.4) * B);
const libero = (x) => x >= 2.4 && x + DUR_SCHEDA <= D - 3;
let abbinate = {};
const FILE_ABB = path.join(LAV, 'schede-ai.json');
if (schede.length) {
  const chiaveAbb = JSON.stringify({ s: schede.map((s) => s.testo), p: pezzi.map((p) => p.cosa) });
  const cache = fs.existsSync(FILE_ABB) ? leggi(FILE_ABB) : {};
  if (cache.chiave === chiaveAbb && !ha('--rifai-ai')) abbinate = cache.abbinate;
  else {
    const prompt = `Video di unboxing di "${titolo}". Queste sono le inquadrature in ordine (numero, fase, cosa si vede):
${pezzi.map((p, i) => `${i}. [${p.fase}] ${p.cosa}`).join('\n')}

Queste sono le caratteristiche da mostrare come scritte sopra il video:
${schede.map((s, i) => `${i}. ${s.testo}`).join('\n')}

Per ogni caratteristica scegli il numero dell'inquadratura dove ha più senso mostrarla (es. una caratteristica dell'app su un'inquadratura dell'app, l'autonomia sulla custodia o sul prodotto). Se nessuna è adatta, null. Due caratteristiche non vanno sulla stessa inquadratura.
Rispondi SOLO con JSON: {"abbinamenti": {"<numero caratteristica>": <numero inquadratura o null>}}`;
    try {
      abbinate = JSON.parse(await chiediLocale(prompt, { pensa: 'low' })).abbinamenti || {};
    } catch (e) { log(`abbinamento delle schede non riuscito (${e.message}): le metto in fila`); }
    fs.writeFileSync(FILE_ABB, JSON.stringify({ chiave: chiaveAbb, abbinate }, null, 1));
  }
}
const occupate = [];
const prova = (x) => libero(x) && occupate.every((o) => x + DUR_SCHEDA + 0.4 <= o || x >= o + DUR_SCHEDA + 0.4);
schede = schede.map((s, i) => {
  const n = abbinate[i] ?? abbinate[String(i)];
  const p = Number.isInteger(n) ? pezzi[n] : null;
  if (p && prova(p.t)) { occupate.push(p.t); return { ...s, t: p.t }; }
  return { ...s, t: null };
});
// le non abbinate: sui tagli del prodotto/dettaglio/uso liberi, poi su qualunque taglio libero
const tagli = [...pezzi.filter((p) => ['prodotto', 'dettaglio', 'uso', 'interno'].includes(p.fase)), ...pezzi].map((p) => p.t);
for (const s of schede.filter((x) => x.t === null)) {
  const x = tagli.find(prova);
  if (x !== undefined) { s.t = x; occupate.push(x); }
}
const tolte = schede.filter((s) => s.t === null);
if (tolte.length) log(`schede senza posto (video troppo corto): ${tolte.map((s) => s.testo).join(', ')}`);
schede = schede.filter((s) => s.t !== null).sort((x, y) => x.t - y.t).map((s) => ({ ...s, dur: +DUR_SCHEDA.toFixed(3) }));
log('schede: ' + schede.map((s) => `${s.t.toFixed(1)}s ${s.testo}`).join(' · '));

// immagini nella cartella della grafica (Remotion le legge da public/)
const CART = `unboxing/${slug}`;
fs.mkdirSync(path.join(ROOT, 'public', CART), { recursive: true });
for (const n of [...schede.map((s) => s.file), immagineChiusura].filter(Boolean)) fs.copyFileSync(path.join(DIR, n), path.join(ROOT, 'public', CART, n));
const chiusuraT = Math.max(0, D - Math.min(3, pezzi.at(-1).t2 - pezzi.at(-1).t));
const props = { durata: D, fps: FPS, cartella: CART, titolo, sopratitolo: 'UNBOXING', schede, chiusura: { t: +chiusuraT.toFixed(3), testo: titolo, immagine: immagineChiusura } };
const eventi = [{ t: 0, suono: 'whoosh veloce', db: -4 }, ...schede.map((s) => ({ t: s.t, suono: 'pop', db: -6 })), { t: chiusuraT, suono: 'swish corto', db: -5 }];
const montaggio = { durata: D, fps: FPS, w: TW, h: TH, pezzi, musica: MUSICA ? { file: MUSICA, da: ritmo.battiti[0] || 0 } : null, eventi, voce: null };
fs.writeFileSync(path.join(LAV, 'montaggio.json'), JSON.stringify(montaggio, null, 1));
fs.writeFileSync(path.join(LAV, 'grafica.json'), JSON.stringify(props, null, 1));
if (ha('--solo-montaggio')) process.exit(0);

// ---------- 4. grafica
passo(4, 'grafica trasparente (Remotion)');
fs.mkdirSync(path.join(ROOT, 'out', 'locale'), { recursive: true });
const GRAFICA = path.join(ROOT, 'out', 'locale', `unboxing-${slug}-grafica-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}.mov`);
const cpu = Math.max(2, Math.min(8, os.cpus().length - 1));
run('npx', ['remotion', 'render', 'src/index.ts', 'Unboxing', GRAFICA, `--props=${path.join(LAV, 'grafica.json')}`, '--codec=prores', '--prores-profile=4444',
  '--pixel-format=yuva444p10le', '--image-format=png', `--concurrency=${cpu}`, ...(ha('--4k') ? [] : ['--scale=0.5'])]);

// ---------- 5. audio
passo(5, 'audio: suoni veri, musica, effetti');
// cartella nuova a ogni giro: DaVinci riusa una clip già importata con lo stesso percorso (lunghezza vecchia, A3 vuota)
const AUDIO = path.join(LAV, `audio-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}`);
py('audio', path.join(LAV, 'montaggio.json'), AUDIO);

// ---------- 6. DaVinci
if (ha('--senza-davinci')) { log(`pronto per DaVinci: ${GRAFICA}`); process.exit(0); }
passo(6, 'timeline in DaVinci');
try {
  const ps = await (await fetch(`${process.env.OLLAMA_HOST || 'http://127.0.0.1:11434'}/api/ps`)).json();
  for (const m of ps.models || []) spawnSync('ollama', ['stop', m.name]);
} catch {}
if (!davinciAperto() && fs.existsSync(RESOLVE_EXE)) {
  log('apro DaVinci Resolve');
  // tramite Explorer come un doppio clic: aperto da Node lo scripting restava spento (vedi documentario.mjs)
  spawn('explorer.exe', [RESOLVE_EXE], { detached: true, stdio: 'ignore' }).unref();
}
py('timeline', path.join(LAV, 'montaggio.json'), GRAFICA, AUDIO, '--nome', `Unboxing ${titolo}`);
log(`fatto in ${((Date.now() - t00) / 60000).toFixed(1)} min: progetto "Regista locale", timeline "Unboxing ${titolo}"`);
