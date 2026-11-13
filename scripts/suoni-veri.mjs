// Suoni veri (12/11): al posto degli 8 effetti sintetici di public/sfx (genera-sfx.mjs) il Regista usa
// i suoni comprati da Denis. Per ogni ruolo (whoosh, colpo, impatto…) sceglie una variante dal pack
// @kummetzz, dalla tassonomia "SFX — regista" e, se servono altre varianti, da Suoni/Effetti (cerca per
// nome del file). La scelta dipende dal nome della cartella: stesso video = stessi suoni su tutte le
// macchine (render a pezzi), video diverso = suoni diversi.
// I file stanno solo su Drive e sul runner: si scrivono in public/sfx/<ruolo>.wav soltanto su GitHub
// Actions (sul PC restano i sintetici del repo). Nei log niente nomi dei file del pack (repo pubblico).
// Ogni suono: silenzio iniziale tolto, al massimo 1,9 s (il riser prende la coda, dove sale), sfumato,
// 48 kHz stereo, picco portato a quello del sintetico (i volumi in src/ sono tarati su quelli).
// REGISTA_SUONI_VERI=0 li spegne; =1 li accende anche fuori da GitHub.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DIR_ASSETS, DIR_SFX } from './cartelle.mjs';

const PACK = `${DIR_ASSETS}/@kummetzz _ SIGNATURE SFX PACK`;
const SUONI = `${DIR_ASSETS}/Suoni`;
const EFFETTI = `${SUONI}/Effetti`;
// le altre cartelle di Suoni (es. «Transizioni e UI», 13/11) sono scelte da Denis: entrano sempre nel
// mucchio, per nome del file (anche in italiano: «sfx-whoosh-leggero-07»). Una cartella nuova lì dentro
// entra da sola al montaggio dopo
const INDICE = `${DIR_SFX}/_indice-effetti.json`; // elenco di Suoni/Effetti (5000+ file), rifatto ogni 7 giorni
const AUDIO = /\.(wav|mp3|aif|aiff|ogg|flac|m4a)$/i;
const MAX_BYTE = 4 << 20;

// dove cercare ogni ruolo: cartelle del pack, cartelle della tassonomia, parole nel nome (Suoni/Effetti)
export const RUOLI = {
  whoosh: { pack: /^Whoosh/i, sfx: /05 Movimento\/(whoosh|swish)/i, nome: /\b(whoosh|woosh|swoosh|swish|swipe|transizione)/i },
  ui_in: { pack: null, sfx: /07 Digitale\/(pop|clic interfaccia)/i, nome: /\b(pop|ui|interface|button|bubble|blip|click|clic|tap)\b/i },
  colpo: { pack: /^Impact_Hits/i, sfx: /03 Timbri e colpi\/colpo|08 Cinematico\/hit/i, nome: /\b(hit|punch|thud|knock|colpo|botta)\b/i },
  impatto: { pack: /^(Impact_Hits|Boulders)/i, sfx: /08 Cinematico\/(boom|sub drop)|03 Timbri e colpi\/impatto/i, nome: /\b(impact|impatto|boom|slam|sub ?drop)\b/i },
  glitch: { pack: /^Gli/i, sfx: /07 Digitale\/glitch/i, nome: /glitch|stutter|distort/i },
  riser: { pack: /^Riser/i, sfx: /05 Movimento\/riser/i, nome: /\b(riser|rise|uplift|build ?up|salita)/i },
  strappo: { pack: null, sfx: /01 Carta\/strappo/i, nome: /\b(rip|ripping|tear|tearing|strappo)\b/i },
  ui_conferma: { pack: null, sfx: /07 Digitale\/notifica/i, nome: /\b(confirm|success|notification|ding|chime|correct|notifica|conferma)\b/i },
};

const elenca = (rclone, dove) => JSON.parse(rclone('lsjson', '-R', '--files-only', '--fast-list', dove))
  .filter((x) => AUDIO.test(x.Path) && x.Size > 0 && x.Size < MAX_BYTE).map((x) => ({ p: x.Path, s: x.Size }));

function indiceEffetti({ rclone, remote, dir }) {
  try {
    const i = JSON.parse(rclone('cat', remote(INDICE)));
    if (Date.now() - Date.parse(i.quando) < 7 * 864e5 && Array.isArray(i.file)) return i.file;
  } catch { /* manca o vecchio: si rifà */ }
  const file = elenca(rclone, remote(EFFETTI)).map((x) => x.p);
  try {
    const tmp = path.join(dir, 'indice.json');
    fs.writeFileSync(tmp, JSON.stringify({ quando: new Date().toISOString(), file }));
    rclone('copyto', tmp, remote(INDICE));
  } catch { /* lo rifà la prossima volta */ }
  return file;
}

// numero stabile 0..1 dal seme (nome della cartella) e dal ruolo
const caso = (seme, k) => crypto.createHash('sha1').update(`${seme}|${k}`).digest().readUInt32BE(0) / 2 ** 32;

function picco(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /max_volume:\s*(-?[\d.]+) dB/.exec(String(r.stderr || ''));
  return m ? Number(m[1]) : null;
}

function durata(run, file) {
  try { return Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).trim()) || 0; } catch { return 0; }
}

export const suoniVeriAccesi = () => process.env.REGISTA_SUONI_VERI === '1' || (process.env.REGISTA_SUONI_VERI !== '0' && process.env.GITHUB_ACTIONS === 'true');

export function preparaSuoni({ ROOT, WORK, rclone, remote, run, log, seme }) {
  if (!suoniVeriAccesi()) return {};
  const t0 = Date.now();
  const dir = path.join(WORK, 'suoni-veri');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  let pack = [], sfx = [], effetti = null;
  try { pack = elenca(rclone, remote(PACK)); } catch (e) { log('suoni veri: pack non leggibile', String(e.message).split('\n')[0]); }
  try { sfx = elenca(rclone, remote(DIR_SFX)); } catch { /* facoltativa */ }
  let scelte = [];
  try {
    for (const d of JSON.parse(rclone('lsjson', '--dirs-only', remote(SUONI))).map((x) => x.Path).filter((x) => x !== 'Effetti' && !x.startsWith('_'))) {
      try { scelte.push(...elenca(rclone, remote(SUONI, d)).map((x) => ({ ...x, p: `${d}/${x.p}` }))); } catch { /* una cartella sola */ }
    }
  } catch { /* facoltativa */ }
  const perNome = (p) => path.basename(p).replace(/\.[a-z0-9]+$/i, '').replace(/[_\-.]+/g, ' ');
  const scelti = {};
  for (const [ruolo, r] of Object.entries(RUOLI)) {
    const pool = [
      ...(r.pack ? pack.filter((x) => r.pack.test(x.p)).map((x) => remote(PACK, x.p)) : []),
      ...sfx.filter((x) => r.sfx.test(x.p)).map((x) => remote(DIR_SFX, x.p)),
      ...scelte.filter((x) => r.nome.test(perNome(x.p))).map((x) => remote(SUONI, x.p)),
    ];
    if (pool.length < 4) {
      if (!effetti) { try { effetti = indiceEffetti({ rclone, remote, dir }); } catch (e) { effetti = []; log('suoni veri: Effetti non leggibile', String(e.message).split('\n')[0]); } }
      pool.push(...effetti.filter((p) => r.nome.test(path.basename(p).replace(/[_\-.]+/g, ' '))).map((p) => remote(EFFETTI, p)));
    }
    if (!pool.length) continue;
    pool.sort(); // stesso ordine su tutte le macchine del giro (i pezzi in parallelo devono scegliere lo stesso file)
    const inizio = Math.floor(caso(seme, ruolo) * pool.length);
    // fino a 3 tentativi: un file troppo lungo o rotto passa al successivo
    for (let k = 0; k < Math.min(3, pool.length); k++) {
      const da = pool[(inizio + k) % pool.length];
      const grezzo = path.join(dir, `${ruolo}-${k}${path.extname(da).toLowerCase()}`);
      try {
        rclone('copyto', da, grezzo);
        const d = durata(run, grezzo);
        if (!d || d > (ruolo === 'riser' ? 12 : 6)) continue;
        const dest = path.join(ROOT, 'public', 'sfx', `${ruolo}.wav`);
        const rif = picco(dest);
        const pulito = path.join(dir, `${ruolo}.wav`);
        const tieni = 1.9;
        const filtri = ruolo === 'riser'
          ? [`atrim=start=${Math.max(0, d - tieni).toFixed(3)}`, 'asetpts=N/SR/TB', 'afade=t=in:d=0.08']
          : ['silenceremove=start_periods=1:start_threshold=-50dB', `atrim=end=${tieni}`, 'asetpts=N/SR/TB', `afade=t=out:st=${(tieni - 0.25).toFixed(2)}:d=0.25`];
        run('ffmpeg', ['-y', '-v', 'error', '-i', grezzo, '-af', [...filtri, 'aresample=48000'].join(','), '-ac', '2', '-ar', '48000', pulito]);
        const p = picco(pulito);
        const gain = rif != null && p != null ? Math.max(-30, Math.min(24, rif - p)) : 0;
        run('ffmpeg', ['-y', '-v', 'error', '-i', pulito, '-af', `volume=${gain.toFixed(2)}dB,alimiter=limit=0.97`, '-ac', '2', '-ar', '48000', '-c:a', 'pcm_s16le', dest]);
        scelti[ruolo] = { fonte: da.includes(PACK) ? 'pack' : da.includes(EFFETTI) ? 'effetti' : da.includes(SUONI) ? 'suoni di Denis' : 'sfx-regista', varianti: pool.length };
        break;
      } catch (e) { log(`suoni veri: ${ruolo} tentativo ${k + 1} non riuscito`, String(e.message).split('\n')[0]); }
    }
  }
  fs.rmSync(dir, { recursive: true, force: true });
  const n = Object.keys(scelti).length;
  log(`suoni veri: ${n}/${Object.keys(RUOLI).length} in ${((Date.now() - t0) / 1000).toFixed(0)} s — ${Object.entries(scelti).map(([k, v]) => `${k} (${v.fonte}, 1 di ${v.varianti})`).join(', ')}`);
  return scelti;
}

// suoni dello stile con il nome di un ruolo (asset/suoni/whoosh.wav) vincono sul kit
export function suoniDelloStile({ ROOT, run, log, suoni }) {
  if (!suoniVeriAccesi()) return;
  const usati = [];
  for (const [nome, file] of Object.entries(suoni || {})) {
    const ruolo = nome.replace(/\s+/g, '_');
    if (!RUOLI[ruolo]) continue;
    run('ffmpeg', ['-y', '-v', 'error', '-i', path.join(ROOT, 'public', file), '-ac', '2', '-ar', '48000', '-c:a', 'pcm_s16le', path.join(ROOT, 'public', 'sfx', `${ruolo}.wav`)]);
    usati.push(ruolo);
  }
  if (usati.length) log(`stile: suoni propri per ${usati.join(', ')}`);
}
