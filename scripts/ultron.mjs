// ✨ Ultron (17/11): motion graphic automatiche sul parlato, sopra il video già montato dal Regista.
// 1) trascrive il video montato (Groq, parola per parola);
// 2) Gemini (chiave gratuita prima) sceglie 3–5 momenti dove una grafica alza il livello: il gancio, i numeri
//    detti a voce, le frasi chiave, al massimo un momento «speciale» descritto a parole;
// 3) le grafiche si fanno con i modelli di motion/ (affidabili) e, per lo speciale, con motion-ai (Gemini), tutte
//    con lo sfondo TRASPARENTE e in alto (lontane dal viso e dai sottotitoli);
// 4) ffmpeg le sovrappone sulle parole giuste, con una dissolvenza in uscita. Audio intatto.
// Se qualcosa non va (niente chiavi, AI giù), il video resta com'era: Ultron non deve mai rompere un montaggio.
// Repo pubblico: nel log solo conteggi e tempi, mai testi.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { renderMotion } from './motion.mjs';
import { creaIdea, gemini } from './motion-ai.mjs';
import { creaScena, renderScena, prova, FASCIA } from './bdm.mjs';

const log = (...a) => console.log('ultron:', ...a);
const DURATE = { numero: 3.2, titolo: 3.8, idea: 3.6 };

function esegui(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`${cmd}: ${(r.stderr || '').slice(-400)}`);
  return r.stdout;
}
const durataDi = (f) => Number(esegui('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).trim()) || 0;
const dimensioni = (f) => esegui('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', f]).trim().split(',').map(Number);

async function trascrivi(video, dir) {
  const mp3 = path.join(dir, 'voce.mp3');
  esegui('ffmpeg', ['-y', '-v', 'error', '-i', video, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '48k', mp3]);
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(mp3)]), 'voce.mp3');
  form.append('model', 'whisper-large-v3');
  form.append('language', 'it');
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'segment');
  form.append('timestamp_granularities[]', 'word');
  const r = await fetch(process.env.GROQ_URL || 'https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY || ''}` }, body: form, signal: AbortSignal.timeout(180_000) });
  if (!r.ok) throw new Error(`trascrizione: Groq ${r.status}`);
  const j = await r.json();
  return { frasi: (j.segments || []).map((g) => ({ a: +g.start.toFixed(2), b: +g.end.toFixed(2), t: String(g.text).trim() })),
    parole: (j.words || []).map((w) => ({ w: String(w.word).trim(), a: +w.start.toFixed(2), b: +w.end.toFixed(2) })) };
}

export const PROMPT = (frasi, durata, brief) => `Sei il motion designer di un creator tech italiano (@itsblackden). Questo è il suo video verticale già montato
(${durata.toFixed(1)} s), con i tempi delle frasi:
${frasi.map((f) => `[${f.a}–${f.b}] ${f.t}`).join('\n')}
${brief ? `\nIndicazioni: ${brief}\n` : ''}
Scegli da 3 a 5 MOMENTI in cui una motion graphic sopra il video (in alto, sopra la testa) alza il livello dell'edit.
Tipi:
- "titolo": il GANCIO all'inizio (entro i primi 1,5 s) e le frasi chiave. "testo" = 2–6 parole forti prese da quello che dice (non riassunti inventati),
  "sotto" = facoltativo, 2–5 parole.
- "numero": SOLO quando dice un numero o un dato (prezzo, ore, percentuale, quantità). "testo" = il numero con l'unità come lo dice («40 ore», «29 €», «3 trucchi»),
  "sotto" = cosa misura in 1–4 parole («di autonomia»).
- "idea": AL MASSIMO UNA, sul momento più visivo: una piccola animazione che illustra quello di cui parla (un'icona che si trasforma, un processo, un confronto).
  "prompt" = descrizione in italiano dell'animazione (oggetti, movimenti, colori), niente testo lungo dentro. Niente loghi di marchi.
Regole: "at" = il secondo in cui inizia la parola giusta (dentro la sua frase). Almeno 5 s tra un momento e l'altro. Mai negli ultimi 2 s.
Non inventare dati che non dice. Testi in italiano, maiuscola solo all'inizio.
Rispondi SOLO con JSON: {"momenti":[{"at":0.4,"tipo":"titolo","testo":"…","sotto":"…"},{"at":7.2,"tipo":"numero","testo":"…","sotto":"…"},{"at":15.1,"tipo":"idea","prompt":"…"}]}`;

// tiene i momenti sensati: tempi dentro il video, distanza minima, un solo «idea», testi corti
export function pulisciMomenti(momenti, durata) {
  const ok = [];
  let idee = 0;
  for (const m of [...(momenti || [])].filter((x) => x && Number.isFinite(+x.at)).sort((a, b) => a.at - b.at)) {
    const tipo = ['titolo', 'numero', 'idea'].includes(m.tipo) ? m.tipo : null;
    if (!tipo) continue;
    const at = Math.max(0.2, +(+m.at).toFixed(2)), dur = DURATE[tipo];
    if (at + dur > durata - 0.3) continue;
    if (ok.length && at < ok[ok.length - 1].at + ok[ok.length - 1].dur + 0.3) continue;
    if (tipo === 'idea') { if (idee++ || !String(m.prompt || '').trim()) continue; ok.push({ tipo, at, dur, prompt: String(m.prompt).slice(0, 600) }); continue; }
    const testo = String(m.testo || '').replace(/\s+/g, ' ').trim();
    if (!testo || (tipo === 'numero' && !/\d/.test(testo))) continue;
    ok.push({ tipo, at, dur, testo: testo.slice(0, tipo === 'titolo' ? 50 : 20), sotto: String(m.sotto || '').replace(/\s+/g, ' ').trim().slice(0, 36) });
  }
  return ok.slice(0, 5);
}

// sovrappone le clip trasparenti: ognuna parte al suo «at» e sfuma negli ultimi 0,35 s
export function filtroSovrapposizioni(momenti, w, h) {
  const parti = [];
  let prima = '0:v';
  momenti.forEach((m, i) => {
    const fine = +(m.at + m.dur).toFixed(2);
    // le scene Black Den Motion sono una fascia (es. 1080×700): larghezza del video, in alto; le altre a schermo intero
    const f = m.fascia, sw = w, sh = f ? Math.round((w * f.h) / f.w / 2) * 2 : h, y = f ? Math.round((f.y * w) / f.w) : 0;
    parti.push(`[${i + 1}:v]scale=${sw}:${sh},setpts=PTS-STARTPTS+${m.at}/TB,fade=t=in:st=${m.at}:d=0.12:alpha=1,fade=t=out:st=${(fine - 0.35).toFixed(2)}:d=0.35:alpha=1[o${i}]`);
    parti.push(`[${prima}][o${i}]overlay=x=0:y=${y}:eof_action=pass:enable='between(t,${m.at},${fine})'[v${i}]`);
    prima = `v${i}`;
  });
  return { filtro: parti.join(';'), uscita: `[${prima}]` };
}

// i suoni delle scene (wav) sotto la voce: ognuno parte al suo «at», volume basso, la voce non si tocca
export function filtroSuoni(suoni, primoIngresso, volume = 0.32) {
  if (!suoni.length) return null;
  const parti = suoni.map((s, i) => `[${primoIngresso + i}:a]aresample=48000,adelay=${Math.round(s.at * 1000)}:all=1,volume=${volume}[s${i}]`);
  parti.push(`[0:a]aresample=48000[voce];[voce]${suoni.map((_, i) => `[s${i}]`).join('')}amix=inputs=${suoni.length + 1}:duration=first:normalize=0[a]`);
  return parti.join(';');
}

// ✨ Ultron 2 (18/11): con le schermate sopra la testa la regia mette già le motion graphic nel render e lascia
// degli spazi «animazione» ({at, dur, prompt, testo}): qui Claude scrive l'animazione e la si sovrappone lì.
// Se non riesce, al suo posto va la scritta di riserva (modello «titolo»): lo spazio non resta mai vuoto.
export function spaziValidi(spazi, durata) {
  return (spazi || []).filter((x) => x && Number.isFinite(+x.at) && +x.at >= 0 && +x.at < durata - 1 && (x.prompt || x.testo || x.scena))
    .map((x) => ({ at: +(+x.at).toFixed(2), dur: +Math.min(x.scena ? 8 : 4.5, Math.max(1.5, +x.dur || 3.5), durata - 0.2 - x.at).toFixed(2), prompt: String(x.prompt || '').slice(0, 600), testo: String(x.testo || '').slice(0, 40),
      ...(x.scena ? { scena: String(x.scena), dati: x.dati || {} } : {}) }))
    .slice(0, 3);
}
// i loghi veri e le foto del video (public/media/img_*): la scena usa quelli, mai loghi disegnati a memoria
function loghiDelVideo() {
  const dir = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'public', 'media');
  try {
    // loghi (img_logo_*) e foto del prodotto/screenshot (img_*): prima i loghi
    const tutte = fs.readdirSync(dir).filter((f) => /^img_.+\.(png|svg|jpe?g|webp)$/i.test(f));
    return [...tutte.filter((f) => f.startsWith('img_logo_')), ...tutte.filter((f) => !f.startsWith('img_logo_'))].slice(0, 12).map((f) => ({ nome: f, file: path.join(dir, f) }));
  } catch { return []; }
}

// fotogrammi del video montato nella fascia, ai tempi della prova: Claude giudica l'animazione sopra il video vero
function sfondiFascia(video, m, dir, i, w) {
  const f = FASCIA.verticale, y = Math.round((f.y * w) / f.w), hh = Math.round((w * f.h) / f.w);
  return [0.12, 0.28, 0.45, 0.62, 0.8, 0.94].map((k, j) => {
    const out = path.join(dir, `sf${i}-${j}.jpg`);
    const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-ss', String(+(m.at + m.dur * k).toFixed(2)), '-i', video, '-frames:v', '1', '-vf', `crop=${w}:${hh}:0:${y},scale=${f.w}:${f.h}`, out]);
    return r.status === 0 ? out : null;
  });
}

async function riempiSpazi({ video, uscita, spazi, dir, durata, w, h, formato, t0, scrittore = gemini }) {
  const fatti = [];
  for (const [i, m] of spaziValidi(spazi, durata).entries()) {
    const clip = path.join(dir, `a${i}.mov`);
    try {
      // 0) scena fatta a mano (motion/scene, «Animazione: <nome>» nel brief): si prova e si renderizza così com'è
      if (m.scena) {
        const { codiceScena, intestazione } = await import('./scene-mano.mjs');
        const media = loghiDelVideo();
        // DATI: quello che la scena deve sapere del video (nome del prodotto, foto vere disponibili in assets/)
        const dati = { ...(m.dati || {}), foto: media.filter((x) => !x.nome.startsWith('img_logo_') && /\.(jpe?g|png|webp)$/i.test(x.nome)).map((x) => `assets/${x.nome}`), loghi: media.filter((x) => x.nome.startsWith('img_logo_')).map((x) => `assets/${x.nome}`) };
        const sorgente = codiceScena(m.scena);
        if (!sorgente) throw new Error(`scena ${m.scena} non trovata`);
        if (intestazione(sorgente).serve === 'foto' && !dati.foto.length) { log(`scena ${m.scena} saltata: nella cartella non c'è una foto del prodotto`); continue; }
        const codice = `const DATI = ${JSON.stringify(dati).replace(/</g, '\\u003c')};\n${sorgente}`;
        const opz = { ...FASCIA.verticale, dur: m.dur };
        const p = await prova(codice, opz, media);
        fs.rmSync(p.dir, { recursive: true, force: true });
        if (p.errore && /errore JavaScript|vuota/.test(p.errore)) throw new Error(`scena ${m.scena}: ${p.errore.slice(0, 120)}`);
        const r = await renderScena({ codice, opz, media, uscita: clip });
        fatti.push({ tipo: 'animazione', at: m.at, dur: m.dur, clip, fascia: opz, wav: r.wav, motore: 'mano' });
        log(`scena fatta a mano ${m.scena}: ${m.dur} s, ${r.suoni} suoni`);
        continue;
      }
      if (!m.prompt) throw new Error('senza descrizione');
      // 1) Black Den Motion: preset provati, 3D vero, effetti sonori, prova in Chrome e revisione di Claude
      if (formato === 'verticale' && process.env.ULTRON_BDM !== '0') {
        try {
          const media = loghiDelVideo();
          const scena = await creaScena({ prompt: m.prompt, dur: m.dur, formato, media, sfondi: sfondiFascia(video, m, dir, i, w), gemini: scrittore });
          const r = await renderScena({ ...scena, media, uscita: clip });
          fatti.push({ tipo: 'animazione', at: m.at, dur: m.dur, clip, fascia: scena.opz, wav: r.wav, motore: 'bdm' });
          continue;
        } catch (e) { log(`animazione ${i + 1}: Black Den Motion non riuscito (${e.message.slice(0, 100)}), provo il motore di prima`); }
      }
      // 2) il motore di prima (HTML scritto da zero)
      const idea = await creaIdea({ prompt: `${m.prompt} (durata ${m.dur} secondi, nella fascia alta sopra la testa)`, formato, trasparente: true, tentativi: 3, revisione: false, ai: 'claude' });
      await renderMotion({ modello: 'idea', formato, uscita: clip, html: idea.html, alfa: true });
      fatti.push({ tipo: 'animazione', at: m.at, dur: m.dur, clip });
    } catch (e) {
      log(`animazione ${i + 1} non riuscita (${e.message.slice(0, 100)}): metto la scritta di riserva`);
      if (!m.testo) continue;
      try {
        await renderMotion({ modello: 'titolo', testi: { testo: m.testo }, formato, uscita: clip, alfa: true });
        fatti.push({ tipo: 'titolo', at: m.at, dur: Math.min(m.dur, DURATE.titolo), clip });
      } catch (e2) { log(`anche la riserva è saltata: ${e2.message.slice(0, 100)}`); }
    }
  }
  if (!fatti.length) return null;
  const { filtro, uscita: v } = filtroSovrapposizioni(fatti, w, h);
  const conAudio = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', video], { encoding: 'utf8' }).stdout.trim() !== '';
  const suoni = conAudio ? fatti.filter((m) => m.wav) : [];
  const fa = filtroSuoni(suoni, fatti.length + 1);
  const tmp = path.join(dir, 'ultron.mp4');
  esegui('ffmpeg', ['-y', '-v', 'error', '-i', video, ...fatti.flatMap((m) => ['-i', m.clip]), ...suoni.flatMap((m) => ['-i', m.wav]),
    '-filter_complex', fa ? `${filtro};${fa}` : filtro, '-map', v, '-map', fa ? '[a]' : '0:a?',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', ...(fa ? ['-c:a', 'aac', '-b:a', '256k'] : ['-c:a', 'copy']), '-movflags', '+faststart', tmp]);
  fs.copyFileSync(tmp, uscita || video);
  log(`fatto: ${fatti.length} animazioni negli spazi (${fatti.filter((m) => m.motore === 'bdm').length} Black Den Motion, ${suoni.length} con suoni) in ${Math.round((Date.now() - t0) / 1000)} s`);
  return fatti.map(({ clip, wav, fascia, ...m }) => m);
}

export async function ultron({ video, uscita, brief = '', spazi = null, scrittore }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ultron-'));
  const t0 = Date.now();
  try {
    const durata = durataDi(video), [w, h] = dimensioni(video);
    const formato = w > h ? 'orizzontale' : 'verticale';
    if (Array.isArray(spazi)) return await riempiSpazi({ video, uscita, spazi, dir, durata, w, h, formato, t0, scrittore });
    const { frasi } = await trascrivi(video, dir);
    if (!frasi.length) { log('nessun parlato: niente grafiche'); return null; }
    const { testo } = await gemini([{ text: PROMPT(frasi, durata, brief) }], 'Rispondi solo con JSON valido.', true);
    const momenti = pulisciMomenti(JSON.parse(testo.replace(/^```(?:json)?|```$/g, '')).momenti, durata);
    log(`${momenti.length} momenti (${momenti.map((m) => m.tipo).join(', ')})`);
    if (!momenti.length) return null;
    const fatti = [];
    for (const [i, m] of momenti.entries()) {
      const clip = path.join(dir, `m${i}.mov`);
      try {
        if (m.tipo === 'idea') {
          const idea = await creaIdea({ prompt: `${m.prompt} (durata ${m.dur} secondi)`, formato, trasparente: true, tentativi: 2, revisione: false });
          await renderMotion({ modello: 'idea', formato, uscita: clip, html: idea.html, alfa: true });
        } else {
          await renderMotion({ modello: m.tipo, testi: { testo: m.testo, sotto: m.sotto }, formato, uscita: clip, alfa: true });
        }
        fatti.push({ ...m, clip });
      } catch (e) { log(`momento ${i + 1} (${m.tipo}) saltato: ${e.message.slice(0, 120)}`); }
    }
    if (!fatti.length) return null;
    const { filtro, uscita: v } = filtroSovrapposizioni(fatti, w, h);
    const tmp = path.join(dir, 'ultron.mp4');
    esegui('ffmpeg', ['-y', '-v', 'error', '-i', video, ...fatti.flatMap((m) => ['-i', m.clip]), '-filter_complex', filtro, '-map', v, '-map', '0:a?',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', tmp]);
    fs.copyFileSync(tmp, uscita || video);
    log(`fatto: ${fatti.length} grafiche in ${Math.round((Date.now() - t0) / 1000)} s`);
    return fatti.map(({ clip, ...m }) => m);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [video, uscita] = process.argv.slice(2);
  try { console.log(JSON.stringify(await ultron({ video, uscita, brief: process.env.BRIEF || '' }))); } catch (e) { console.error(`ultron: ${e.message}`); process.exit(1); }
}
