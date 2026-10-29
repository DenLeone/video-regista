// Musica sotto i video (Denis, 29/10): solo quando la chiede nel messaggio ("… con musica"), il brano
// lo sceglie l'AI tra quelli della sua cartella (12 · Risorse/Assets/Suoni/Musica) in base al tono del
// video; sta bassa sotto la voce e scende ancora mentre parla (src/comune.tsx, MusicaSotto).
// Il catalogo (durata, ritmo, energia, brillantezza, dove entra il brano) si calcola una volta per
// brano e si salva nella cartella stessa come _catalogo.json.
import { execFileSync } from 'node:child_process';

export const DIR_MUSICA = process.env.DIR_MUSICA || '12 · Risorse/Assets/Suoni/Musica';
export const ESTENSIONI_MUSICA = /\.(mp3|wav|m4a|aac|flac|ogg|aif|aiff)$/i;

/** "con musica", "musica: Torque Mode" → { nome? }; "senza musica" / "niente musica" → null */
export function richiestaMusica(brief = '') {
  const t = String(brief);
  if (/\b(senza|niente|no)\s+musica\b|\bmusica\s*:\s*no\b/i.test(t)) return null;
  if (!/\bmusic[ah]?\b/i.test(t)) return null;
  const nome = (/\bmusica\s*:\s*([^\n.,;]+)/i.exec(t) || [])[1]?.trim();
  return nome && !/^s[iì]$/i.test(nome) ? { nome } : {};
}

// audio mono a 11025 Hz, i primi `max` secondi
function campioni(file, max = 240) {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-t', String(max), '-i', file, '-ac', '1', '-ar', '11025', '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4));
}

/** misure di un brano: { durata, bpm, energia (dB), brillantezza (0–1), entrata (s) } */
export function analizzaBrano(file) {
  const durata = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim()) || 0;
  const x = campioni(file);
  const passo = 110; // 10 ms
  const n = Math.floor(x.length / passo);
  const rms = new Float32Array(n);
  let incroci = 0;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = i * passo; k < (i + 1) * passo; k++) { s += x[k] * x[k]; if (k && (x[k] >= 0) !== (x[k - 1] >= 0)) incroci++; }
    rms[i] = Math.sqrt(s / passo);
  }
  const ordinati = [...rms].sort((a, b) => a - b);
  const mediana = ordinati[Math.floor(n / 2)] || 1e-6;
  const energia = 20 * Math.log10(Math.max(1e-6, ordinati[Math.floor(n * 0.9)] || mediana));
  // dove il brano "entra": il primo punto con almeno metà del volume tipico (salta i silenzi iniziali)
  const entrata = Math.max(0, rms.findIndex((v) => v >= mediana * 0.5)) / 100;
  // ritmo: autocorrelazione della forza degli attacchi tra 70 e 170 BPM
  const att = new Float32Array(n);
  for (let i = 1; i < n; i++) att[i] = Math.max(0, rms[i] - rms[i - 1]);
  let migliore = 0, bpm = 0;
  for (let b = 70; b <= 170; b += 0.5) {
    const lag = Math.round(6000 / b);
    let s = 0;
    for (let i = lag; i < n; i++) s += att[i] * att[i - lag];
    if (s > migliore) { migliore = s; bpm = b; }
  }
  const brillantezza = Math.min(1, incroci / Math.max(1, x.length) / 0.15);
  return { durata: +durata.toFixed(1), bpm: Math.round(bpm), energia: +energia.toFixed(1), brillantezza: +brillantezza.toFixed(2), entrata: +entrata.toFixed(2) };
}

const fascia = (v, [a, b], nomi) => (v < a ? nomi[0] : v < b ? nomi[1] : nomi[2]);

/** righe del catalogo per il prompt dell'AI */
export function descriviCatalogo(catalogo) {
  return Object.entries(catalogo).map(([nome, m]) => `- "${nome}" · ${Math.round(m.durata)} s · ${m.bpm} BPM (${fascia(m.bpm, [95, 125], ['lento', 'medio', 'veloce'])}) · energia ${fascia(m.energia, [-16, -10], ['bassa', 'media', 'alta'])} · suono ${fascia(m.brillantezza, [0.3, 0.55], ['scuro/morbido', 'pieno', 'brillante'])}`).join('\n');
}

/** il brano da usare: quello chiesto da Denis, se no quello dell'AI, se no il più vicino a un'energia media */
export function scegliBrano(catalogo, { richiesto, dellAI } = {}) {
  const nomi = Object.keys(catalogo);
  if (!nomi.length) return null;
  const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const trova = (t) => t && (nomi.find((x) => norm(x) === norm(t)) || nomi.find((x) => norm(x).includes(norm(t)) || norm(t).includes(norm(x))));
  return trova(richiesto) || trova(dellAI) || nomi.reduce((a, b) => (Math.abs(catalogo[b].energia + 13) < Math.abs(catalogo[a].energia + 13) ? b : a));
}

/** momenti in cui Denis parla (sulla timeline del video): intervalli [da, a] uniti se la pausa è breve */
export function momentiParlati(parole = [], pausa = 0.45) {
  const out = [];
  for (const p of parole) {
    const a = p.at - 0.1, b = p.at + p.dur + 0.15;
    const u = out[out.length - 1];
    if (u && a - u[1] < pausa) u[1] = Math.max(u[1], b);
    else out.push([a, b]);
  }
  return out.map(([a, b]) => [+Math.max(0, a).toFixed(2), +b.toFixed(2)]);
}
