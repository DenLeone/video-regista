// 🔎 Studia un video da Drive (19/11): trascrizione (Groq, lingua automatica) e fogli di fotogrammi (uno ogni 3 s,
// 3×3 per foglio), così Claude può «guardare» un video troppo grande da scaricare in chat.
//   node scripts/studia-video.mjs video.mp4 cartella-uscita
// Repo pubblico: nel log solo conteggi, mai il testo.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const [video, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const durata = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video], { encoding: 'utf8' }));
execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', video, '-vf', 'fps=1/3,scale=360:-2,tile=3x3', '-q:v', '4', path.join(out, 'fogli_%02d.jpg')]);
const mp3 = path.join(out, 'voce.mp3');
execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', video, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '48k', mp3]);
let testo = '';
if (process.env.GROQ_API_KEY) {
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
fs.rmSync(mp3);
console.log(`studio: ${Math.round(durata)} s, ${fs.readdirSync(out).filter((f) => f.startsWith('fogli_')).length} fogli, trascrizione ${testo ? 'fatta' : 'non fatta'}`);
