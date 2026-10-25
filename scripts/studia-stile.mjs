// Studio di uno stile dal video di riferimento intero (workflow "stile", avviato dall'app con
// "Studia uno stile"). Al posto dei 6 fotogrammi piccoli analizzati dal Worker (25/10: stili
// generici, lontani da quelli fatti a mano), qui l'AI guarda il video tutto, con l'audio:
//   1. scarica il riferimento da R2 (inbox/<R2_ID>/), lo porta a 720p H.264 (anche HEVC/MOV)
//   2. misura i tagli con ffmpeg (cambi di scena) e la durata media delle inquadrature
//   3. lo carica su Gemini (File API) e chiede lo stile a Gemini Pro (riserva: Flash), con le
//      opzioni di stile.txt (MODELLO) e due stili fatti a mano come esempi del livello voluto
//   4. rimanda al bot (POST /stile-esito) lo stile, la risposta per Denis e quello che le
//      opzioni non sanno fare ("da creare": nuove grafiche da scrivere insieme a Claude)
// Variabili: R2_ID, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET,
// GEMINI_API_KEY, NOTIFY_URL, NOTIFY_TOKEN; STILE_MODELLI (facoltativo, "a,b").
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bloccoRemoteR2, comandiScaricoR2 } from './rete.mjs';
import { MODELLO } from './stile-su-misura.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const WORK = path.join(ROOT, 'work', 'studio-stile');
const GEMINI = process.env.GEMINI_URL || 'https://generativelanguage.googleapis.com';
const R2_ID = (process.env.R2_ID || '').trim();
const MODELLI = (process.env.STILE_MODELLI || 'gemini-pro-latest,gemini-flash-latest').split(',').map((m) => m.trim()).filter(Boolean);
const MAX_SECONDI = 180; // un riferimento più lungo si studia sui primi 3 minuti

const log = (...a) => console.log('[stile]', ...a);
const run = (cmd, args) => String(execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 26 }) ?? '');
const attesa = (ms) => new Promise((ok) => setTimeout(ok, ms));

function scaricaRiferimento() {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(R2_ID)) throw new Error('riferimento R2 mancante o non valido');
  const dir = path.join(os.homedir(), '.config', 'rclone');
  fs.mkdirSync(dir, { recursive: true });
  const conf = path.join(dir, 'rclone.conf');
  if (!fs.existsSync(conf) || !/^\[r2\]/m.test(fs.readFileSync(conf, 'utf8'))) {
    fs.appendFileSync(conf, `\n${bloccoRemoteR2({
      accountId: process.env.R2_ACCOUNT_ID || '', accessKeyId: process.env.R2_ACCESS_KEY_ID || '', secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    })}`);
  }
  const dest = path.join(WORK, 'in');
  fs.mkdirSync(dest, { recursive: true });
  run('rclone', comandiScaricoR2({ id: R2_ID, bucket: process.env.R2_BUCKET || '', dest }));
  const video = fs.readdirSync(dest).filter((f) => /\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(f))
    .map((f) => path.join(dest, f)).sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0];
  if (!video) throw new Error('nel caricamento non c’è un video');
  return video;
}

function scaricaDaDrive(percorso) {
  const dest = path.join(WORK, 'in', path.basename(percorso));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  run('rclone', ['copyto', `${process.env.REGISTA_REMOTE || 'gdrive'}:${percorso}`, dest]);
  return dest;
}

function durataDi(file) {
  return Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).trim()) || 0;
}

// 720p sul lato corto, H.264 + AAC: Gemini legge tutto e il caricamento è leggero
function preparaVideo(sorgente) {
  const out = path.join(WORK, 'riferimento.mp4');
  run('ffmpeg', ['-y', '-v', 'error', '-i', sorgente, '-t', String(MAX_SECONDI),
    '-vf', "scale='if(gt(iw,ih),-2,720)':'if(gt(iw,ih),720,-2)'", '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26',
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', out]);
  return out;
}

// cambi di inquadratura: scene detection di ffmpeg (soglia 0,3) su una copia piccola. showinfo
// scrive su stderr anche quando va tutto bene, quindi spawnSync e non execFileSync
function contaTagli(file, durata) {
  const r = spawnSync('ffmpeg', ['-v', 'info', '-i', file, '-an', '-vf', "scale=160:-2,select='gt(scene,0.3)',showinfo", '-f', 'null', '-'],
    { encoding: 'utf8', maxBuffer: 1 << 26 });
  const tagli = (String(r.stderr || '').match(/pts_time:/g) || []).length;
  return { tagli, taglioMedio: +(durata / (tagli + 1)).toFixed(1) };
}

async function json(r, cosa) {
  const t = await r.text();
  if (!r.ok) throw new Error(`${cosa}: HTTP ${r.status} ${t.slice(0, 200)}`);
  try { return JSON.parse(t); } catch { throw new Error(`${cosa}: risposta non JSON`); }
}

// File API di Gemini: caricamento ripristinabile in un colpo, poi si aspetta che sia ACTIVE
async function caricaSuGemini(file, chiave) {
  const size = fs.statSync(file).size;
  const inizio = await fetch(`${GEMINI}/upload/v1beta/files`, {
    method: 'POST',
    headers: {
      'x-goog-api-key': chiave, 'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(size), 'X-Goog-Upload-Header-Content-Type': 'video/mp4', 'content-type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: 'riferimento-stile' } }),
  });
  if (!inizio.ok) throw new Error(`Gemini non apre il caricamento: HTTP ${inizio.status}`);
  const url = inizio.headers.get('x-goog-upload-url');
  if (!url) throw new Error('Gemini non ha dato l’indirizzo di caricamento');
  const fine = await json(await fetch(url, {
    method: 'POST',
    headers: { 'Content-Length': String(size), 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' },
    body: fs.readFileSync(file),
  }), 'caricamento su Gemini');
  let f = fine.file;
  for (let i = 0; f?.state === 'PROCESSING' && i < 60; i++) {
    await attesa(5000);
    f = await json(await fetch(`${GEMINI}/v1beta/${f.name}`, { headers: { 'x-goog-api-key': chiave } }), 'stato del video su Gemini');
  }
  if (f?.state !== 'ACTIVE') throw new Error(`Gemini non ha elaborato il video (${f?.state || 'stato sconosciuto'})`);
  return f;
}

function prompt({ durata, tagli, taglioMedio }) {
  const esempi = fs.readdirSync(path.join(ROOT, 'scripts', 'stili', 'esempi-studio')).filter((f) => f.endsWith('.txt'))
    .map((f) => `--- esempio: ${f.replace(/\.txt$/, '')} ---\n${fs.readFileSync(path.join(ROOT, 'scripts', 'stili', 'esempi-studio', f), 'utf8').trim()}`);
  return [
    'Sei il regista di Denis, creator italiano di video verticali 9:16 (Reels, TikTok, Shorts). Guardi TUTTO il video di riferimento allegato, con l\'audio, e ne ricavi lo STILE di montaggio da rifare sui video di Denis.',
    '',
    'Guarda con attenzione, come se lo studiassi fotogramma per fotogramma:',
    '- scritte: quante, dove (alto/centro/basso, davanti o dietro la persona), font (graziato, bastone, corsivo, condensato), peso, maiuscole/minuscole, colori esatti in esadecimale, come entrano ed escono (parola per parola, a blocchi, sfocatura, scramble, scatto…), quanto restano;',
    '- ritmo: quanto durano le inquadrature, tagli dentro le frasi, zoom/punch sui jump cut, rallentatori;',
    '- inquadrature e B-roll: volto, dettagli, repertorio, schermate, inserti (come sono incorniciati);',
    '- transizioni, effetti, colore e luce (caldo, freddo, contrasto, bianco e nero), musica ed effetti sonori;',
    '- apertura e chiusura del video.',
    `Misure fatte con ffmpeg sul video: durata ${durata.toFixed(1)} s, ${tagli} cambi di inquadratura, inquadratura media ${taglioMedio} s.`,
    '',
    'Scrivi lo stile come stile.txt: SOLO i campi del modello qui sotto, con valori tra quelli ammessi (le note dopo # dicono quali). I campi di REGIA invece sono testo libero: lì metti tutto quello che serve all\'AI che monta (ritmo, struttura, inquadrature, cose da evitare), in modo preciso e concreto. Sopra i campi puoi mettere righe che iniziano con # per spiegare le scelte. Obbligatori: Nome, Sottotitoli, Look, Ritmo dei tagli e almeno 8 campi in tutto.',
    'Il livello di dettaglio deve essere quello degli esempi qui sotto, stili fatti a mano studiando i video: copia il livello di precisione, non i valori.',
    '',
    'Effetti che ESISTONO GIÀ come opzioni, da usare e MAI da mettere in "da_creare": parole grandi che entrano a lettere casuali che si compongono (Entrata parole grandi: scramble), transizioni a nuvola di fumo (Transizioni: fumo), parlato a blocchi davanti al petto con parole chiave enormi (Sottotitoli: blocchi), cartelli a tutto schermo battuti a macchina (Titoli: cartelli), inserti in un televisore anni \'70 (Inserti: tv), video di repertorio (B-roll stock: sì), scritte che passano dietro alla persona (Scritte dietro di me), bianco e nero nei momenti di racconto, soggetto in risalto, inizio "prima e dopo".',
    'Sempre: "Chiusura: no" e "Firma: no" (Denis non vuole il suo nome Instagram nei video, il valore negli esempi del modello è solo un esempio) e "Musica: no" (gli stili studiati non hanno brani). Un effetto d\'apertura con un titolo enorme (anche dietro la persona) si fa con "Apertura: grande" (+ "Scritte dietro di me: sì" se passa dietro), non descrivendolo solo nella regia. Inviti finali a schermo (commenta, segui, salva) che non sono tra le opzioni vanno in "da_creare".',
    'Coerenza: con "Sottotitoli: blocchi" le parole chiave grandi le fanno già i blocchi, quindi "Titoli" va su cartelli (scritte a tutto schermo) o no, mai "parole grandi" o "frasi"; con i blocchi "Posizione sottotitoli" e "Dimensione sottotitoli" non servono.',
    'Quello che nel video c\'è ma le opzioni del modello non sanno rifare (un\'entrata delle scritte diversa, una cornice, una transizione, un effetto grafico) NON va forzato su un\'opzione sbagliata: scegli l\'opzione più vicina e descrivilo in "da_creare", una voce per effetto, con cosa si vede, dove e come si muove, abbastanza preciso da poterlo programmare.',
    '',
    'Rispondi SOLO con JSON: {"risposta": "2-4 frasi per Denis in italiano: cosa hai visto e cosa rende riconoscibile lo stile", "stile": "il testo di stile.txt", "da_creare": ["…"]}',
    '',
    '=== MODELLO DI stile.txt (campi e valori ammessi) ===',
    MODELLO.trim(),
    '',
    '=== ESEMPI DI STILI FATTI BENE ===',
    ...esempi,
  ].join('\n');
}

function leggiRisposta(testo) {
  const t = String(testo || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const i = t.indexOf('{'), j = t.lastIndexOf('}');
  if (i < 0 || j <= i) return null;
  try {
    const o = JSON.parse(t.slice(i, j + 1));
    const stile = String(o.stile || '').trim();
    if (!stile || !/^\s*Nome\s*:/mi.test(stile)) return null;
    return { risposta: String(o.risposta || '').trim(), stile, daCreare: (Array.isArray(o.da_creare) ? o.da_creare : []).map(String).map((x) => x.trim()).filter(Boolean).slice(0, 8) };
  } catch { return null; }
}

async function chiediStile(fileGemini, misure, chiave) {
  const corpo = {
    contents: [{ role: 'user', parts: [{ file_data: { mime_type: 'video/mp4', file_uri: fileGemini.uri } }, { text: prompt(misure) }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.3, maxOutputTokens: 16384 },
  };
  let ultimo = '';
  for (const modello of MODELLI) {
    for (let tentativo = 1; tentativo <= 2; tentativo++) {
      try {
        const r = await fetch(`${GEMINI}/v1beta/models/${modello}:generateContent`, {
          method: 'POST', headers: { 'x-goog-api-key': chiave, 'content-type': 'application/json' },
          body: JSON.stringify(corpo), signal: AbortSignal.timeout(5 * 60 * 1000),
        });
        if (r.status === 429 || r.status >= 500) { ultimo = `${modello}: HTTP ${r.status}`; log(ultimo, '(riprovo)'); await attesa(15000); continue; }
        const j = await json(r, modello);
        const testo = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
        const letto = leggiRisposta(testo);
        if (letto) { log(`stile scritto da ${modello}`); return { ...letto, modello }; }
        ultimo = `${modello}: risposta illeggibile`;
        log(ultimo);
      } catch (e) { ultimo = `${modello}: ${e.message}`; log(ultimo); }
      break;
    }
  }
  throw new Error(`nessun modello ha scritto lo stile (${ultimo})`);
}

async function rispondi(dati) {
  if (!process.env.NOTIFY_URL || !R2_ID) { log('NOTIFY_URL mancante: risultato solo nel log', JSON.stringify(dati).slice(0, 500)); return; }
  const url = process.env.NOTIFY_URL.replace(/\/notify$/, '/stile-esito');
  for (let i = 1; i <= 3; i++) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-regista-token': process.env.NOTIFY_TOKEN || '' }, body: JSON.stringify({ r2: R2_ID, ...dati }) });
      log(`esito al bot: ${r.status}`);
      if (r.ok) return;
    } catch (e) { log('esito al bot non riuscito', e.message); }
    await attesa(5000 * i);
  }
}

async function main() {
  const chiave = process.env.GEMINI_API_KEY;
  fs.rmSync(WORK, { recursive: true, force: true });
  fs.mkdirSync(WORK, { recursive: true });
  let fileGemini = null;
  try {
    if (!chiave) throw new Error('manca GEMINI_API_KEY nei secret di GitHub');
    // STILE_FILE: un file locale (prove in locale); STILE_DRIVE: un video su Drive (prove dal
    // workflow, per confrontare con gli stili fatti a mano); altrimenti il riferimento su R2
    const sorgente = process.env.STILE_FILE || (process.env.STILE_DRIVE ? scaricaDaDrive(process.env.STILE_DRIVE) : scaricaRiferimento());
    log(`riferimento: ${path.basename(sorgente)} (${(fs.statSync(sorgente).size / 1e6).toFixed(1)} MB)`);
    const video = preparaVideo(sorgente);
    const durata = durataDi(video);
    const { tagli, taglioMedio } = contaTagli(video, durata);
    log(`durata ${durata.toFixed(1)} s, ${tagli} tagli, inquadratura media ${taglioMedio} s`);
    fileGemini = await caricaSuGemini(video, chiave);
    const esito = await chiediStile(fileGemini, { durata, tagli, taglioMedio }, chiave);
    // nel riepilogo del giro su GitHub: lo stile si legge anche senza aprire l'app
    const riepilogo = `## Stile studiato (${esito.modello})\n\n${esito.risposta}\n\n\`\`\`\n${esito.stile}\n\`\`\`\n${esito.daCreare.length ? `\n### Da creare\n${esito.daCreare.map((d) => `- ${d}`).join('\n')}\n` : ''}`;
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, riepilogo);
    fs.writeFileSync(path.join(WORK, 'stile.txt'), esito.stile);
    fs.writeFileSync(path.join(WORK, 'esito.json'), JSON.stringify(esito, null, 1));
    // prova da Drive: lo stile va anche in Stili/<STILE_SALVA_DRIVE>/ (con i "da creare" come note),
    // così si prova subito con un render breve
    if (process.env.STILE_SALVA_DRIVE) {
      const cartella = `${process.env.DIR_STILI || '12 · Risorse/Stili'}/${process.env.STILE_SALVA_DRIVE}`;
      const testo = esito.stile.replace(/^\s*Nome:.*$/m, `Nome: ${process.env.STILE_SALVA_DRIVE}`)
        + (esito.daCreare.length ? `\n\n# --- DA CREARE ---\n${esito.daCreare.map((d) => `# DA CREARE: ${d}`).join('\n')}\n` : '');
      fs.writeFileSync(path.join(WORK, 'stile-drive.txt'), testo);
      run('rclone', ['copyto', path.join(WORK, 'stile-drive.txt'), `${process.env.REGISTA_REMOTE || 'gdrive'}:${cartella}/stile.txt`]);
      log(`stile salvato su Drive in ${cartella}`);
    }
    console.log(esito.stile);
    await rispondi({ ok: true, ...esito, durata: +durata.toFixed(1), tagli, taglioMedio });
  } catch (e) {
    log('studio non riuscito:', e.message);
    await rispondi({ ok: false, errore: e.message.slice(0, 300) });
    process.exitCode = 1;
  } finally {
    if (fileGemini?.name && chiave) await fetch(`${GEMINI}/v1beta/${fileGemini.name}`, { method: 'DELETE', headers: { 'x-goog-api-key': chiave } }).catch(() => {});
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(ROOT, 'scripts', 'studia-stile.mjs')) main();
export { leggiRisposta, prompt, contaTagli };
