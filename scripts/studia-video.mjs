// 🔎 Studia un video da Drive (19/11): trascrizione (Groq, lingua automatica) e fogli di fotogrammi (uno ogni 3 s,
// 3×3 per foglio; nei video corti più fitti, almeno ~18), così Claude può «guardare» un video troppo grande da scaricare in chat.
//   node scripts/studia-video.mjs video.mp4 cartella-uscita
// Repo pubblico: nel log solo conteggi, mai il testo.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const [video, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const durata = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video], { encoding: 'utf8' }));
// video corti (es. classifiche veloci): fotogrammi più fitti e più grandi, almeno ~18 in tutto
const ogni = Math.min(3, Math.max(0.5, +(durata / 18).toFixed(2)) || 3);
const largo = ogni < 3 ? 480 : 360;
// un file solo audio (la voce di un microfono): niente fotogrammi, solo la trascrizione
const conVideo = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', video], { encoding: 'utf8' }).includes('video');
if (!conVideo) console.log('studio: nessuna traccia video, solo trascrizione');
if (conVideo) execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', video, '-vf', `fps=1/${ogni},scale=${largo}:-2,tile=3x3`, '-q:v', '4', path.join(out, 'fogli_%02d.jpg')]);
// 3 fotogrammi a risoluzione piena (25%, 50%, 75%): per giudicare nitidezza, rumore e colore, non solo il contenuto
for (const [i, k] of (conVideo ? [0.25, 0.5, 0.75] : []).entries()) {
  try { execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', (durata * k).toFixed(2), '-i', video, '-frames:v', '1', '-q:v', '2', path.join(out, `pieno_${i + 1}.jpg`)]); } catch { /* fotogramma non riuscito */ }
}
// le etichette di colore e codifica (spazio colore, gamma, bit): per capire perché un video «cambia colore» nel render
try { fs.writeFileSync(path.join(out, 'info.txt'), execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,profile,pix_fmt,width,height,r_frame_rate,color_range,color_space,color_transfer,color_primaries:stream_side_data=:format_tags=encoder,com.apple.quicktime.software', '-of', 'default=nw=1', video], { encoding: 'utf8' })); } catch { /* niente info */ }
const mp3 = path.join(out, 'voce.mp3');
// un video senza audio (solo musica tolta, schermate) non ha niente da trascrivere
let conAudio = true;
try { execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', video, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '48k', mp3], { stdio: 'ignore' }); } catch { conAudio = false; }
let testo = '';
if (process.env.GROQ_API_KEY && conAudio) {
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(mp3)]), 'voce.mp3');
  form.append('model', 'whisper-large-v3');
  form.append('response_format', 'verbose_json');
  const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }, body: form, signal: AbortSignal.timeout(300_000) });
  if (r.ok) {
    const j = await r.json();
    testo = `lingua: ${j.language || '?'}\n\n` + (j.segments || []).map((g) => `[${Math.floor(g.start / 60)}:${String(Math.floor(g.start % 60)).padStart(2, '0')}] ${String(g.text).trim()}`).join('\n');
  } else console.log(`trascrizione: Groq ${r.status}`);
}
fs.writeFileSync(path.join(out, 'trascrizione.txt'), testo);
fs.rmSync(mp3, { force: true });
console.log(`studio: ${Math.round(durata)} s, ${fs.readdirSync(out).filter((f) => f.startsWith('fogli_')).length} fogli, trascrizione ${testo ? 'fatta' : 'non fatta'}`);
