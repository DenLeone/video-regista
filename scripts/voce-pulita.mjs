// 🎙️ Voce pulita (27/11): rumore e rimbombo tolti dalla traccia della voce di ogni pezzo (media/*.voce.wav), SOLO se
// chiesto: «Voce: pulita» nel brief o nello stile. Spenta di default: i montaggi di sempre non cambiano.
// Prima scelta DeepFilterNet (Rikorose/DeepFilterNet, MIT/Apache, versione ufficiale v0.5.6 con il modello DFN3 dentro:
// gira sulla CPU più veloce del tempo reale). Se il programma non si scarica o non va, il filtro di ffmpeg (afftdn), più
// leggero: il rumore scende di qualche dB e la voce resta com'è. Mai un errore: nel peggio la voce resta quella di prima.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEEPFILTER_URL = 'https://github.com/Rikorose/DeepFilterNet/releases/download/v0.5.6/deep-filter-0.5.6-x86_64-unknown-linux-musl';
// riduzione al massimo di 30 dB (non 100): resta un filo di ambiente, la voce non suona «sott'acqua»
export const ARGOMENTI_DEEPFILTER = ['--compensate-delay', '--atten-lim-db', '30'];
export const FILTRO_FFMPEG = 'highpass=f=70,afftdn=nr=12:nf=-50:tn=1';
// la voce pulita esce anche allo stesso volume da una clip all'altra («voce livellata», dalla lista DA FARE di Denis).
// −17 LUFS sulla voce mono = circa −14 LUFS nel video stereo (stessa voce sui due canali: +3 dB), lo standard dei social;
// LRA 20: quasi sempre guadagno puro, la dinamica della voce resta com'è
export const LIVELLO_VOCE = 'loudnorm=I=-17:TP=-1.5:LRA=20';
export const chiedeVocePulita = (testo = '') => /\bvoce\s*:?\s*pulit/i.test(String(testo));

let programma; // undefined = non ancora cercato, null = non disponibile
/** Il programma DeepFilterNet, scaricato una volta per giro. deps: run(cmd, args, opts), log, dir */
export function deepFilter({ run, log, dir = os.tmpdir() }) {
  if (programma !== undefined) return programma;
  programma = null;
  try {
    const file = process.env.DEEPFILTER_BIN || path.join(dir, 'deep-filter');
    if (!process.env.DEEPFILTER_BIN && !fs.existsSync(file)) {
      run('curl', ['-fsSL', '--retry', '2', '--max-time', '120', '-o', file, DEEPFILTER_URL]);
      fs.chmodSync(file, 0o755);
      log(`voce pulita: DeepFilterNet scaricato (sha256 ${crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 16)}…)`);
    }
    run(file, ['--version'], { stdio: 'ignore', timeout: 30_000 });
    programma = file;
  } catch (e) { log(`voce pulita: DeepFilterNet non disponibile (${String(e.message).split('\n')[0]}), uso il filtro di ffmpeg`); }
  return programma;
}
export const azzeraDeepFilter = () => { programma = undefined; };

/** Pulisce un file della voce sul posto (una volta sola: segno «.pulita» accanto). Ritorna 'deepfilter', 'ffmpeg' o null */
export function pulisciVoce(file, { run, log, dir = os.tmpdir() }) {
  const segno = `${file}.pulita`;
  if (!fs.existsSync(file) || fs.existsSync(segno)) return null;
  const tmp = file.replace(/\.wav$/i, '') + '.pulita-tmp.wav';
  const finisci = (come) => { fs.renameSync(tmp, file); fs.writeFileSync(segno, come); log(`voce pulita (${come}): ${path.basename(file)}`); return come; };
  const df = deepFilter({ run, log, dir });
  if (df) {
    const fuori = fs.mkdtempSync(path.join(dir, 'voce-pulita-'));
    try {
      run(df, [...ARGOMENTI_DEEPFILTER, '-o', fuori, file], { timeout: 10 * 60_000 });
      const pulito = path.join(fuori, path.basename(file));
      // la durata resta quella di prima (il ritardo compensato toglie qualche ms): la voce resta a tempo con le labbra
      const durata = Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).trim());
      if (!(durata > 0) || !fs.existsSync(pulito)) throw new Error('nessun file pulito');
      // prima si riallunga (dopo loudnorm apad non allunga più), poi si livella
      livella(run, pulito, tmp, `apad=whole_dur=${durata}`, durata);
      return finisci('deepfilter');
    } catch (e) { fs.rmSync(tmp, { force: true }); log(`voce pulita: DeepFilterNet non riuscito su ${path.basename(file)} (${String(e.message).split('\n')[0]}), uso ffmpeg`); }
    finally { fs.rmSync(fuori, { recursive: true, force: true }); }
  }
  try {
    livella(run, file, tmp, FILTRO_FFMPEG);
    return finisci('ffmpeg');
  } catch (e) { fs.rmSync(tmp, { force: true }); log(`voce pulita non riuscita su ${path.basename(file)}: ${String(e.message).split('\n')[0]}`); return null; }
}

// livello in due passaggi (misura, poi guadagno lineare): preciso anche sulle clip corte e senza «pompare» la voce.
// Se la misura non riesce (o è silenzio) resta solo la catena «prima»
function livella(run, da, a, prima, durata = 0) {
  // in mono PRIMA di misurare: misurato in stereo e poi passato a mono, il volume scenderebbe di 3 dB
  prima = `${prima},aformat=channel_layouts=mono`;
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', da, '-af', `${prima},${LIVELLO_VOCE}:print_format=json`, '-f', 'null', '-'], { encoding: 'utf8', timeout: 10 * 60_000 });
  let m = null;
  try { m = JSON.parse(/\{[^{}]*"input_i"[^{}]*\}/s.exec(r.stderr || '')?.[0] || ''); } catch { /* misura non riuscita */ }
  const ok = m && Number(m.input_i) > -70 && [m.input_tp, m.input_lra, m.input_thresh, m.target_offset].every((x) => Number.isFinite(Number(x)));
  const livello = ok ? `,${LIVELLO_VOCE}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true` : '';
  run('ffmpeg', ['-y', '-v', 'error', '-i', da, '-af', `${prima}${livello}`, ...(durata ? ['-t', String(durata)] : []), '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', a]);
}

// 🔊 il volume del video finito (LUFS integrati e picco): solo misurato, mai cambiato. Va in NOTE.txt e nel log (solo numeri)
export function volumeFinale(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-vn', '-af', 'loudnorm=print_format=json', '-f', 'null', '-'], { encoding: 'utf8', timeout: 120_000 });
  try {
    const j = JSON.parse(/\{[^{}]*"input_i"[^{}]*\}/s.exec(r.stderr || '')?.[0] || '');
    const lufs = Number(j.input_i), picco = Number(j.input_tp);
    return Number.isFinite(lufs) && lufs > -70 ? { lufs: Math.round(lufs * 10) / 10, picco: Math.round(picco * 10) / 10 } : null;
  } catch { return null; }
}
