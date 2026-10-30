// Pacchetto YouTube dopo il montaggio: descrizione con i capitoli e i loro tempi (YouTube li rende
// cliccabili: primo a 0:00, almeno 3, ognuno di 10 s o più), 3 titoli, tag e 3 copertine 1920×1080 dal
// video finito. Testi dall'AI (locale o Gemini); senza AI solo i capitoli e le copertine col nome.
//   node pc\pacchetto.mjs pc\progetti\<nome>.json
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chiediAI } from './ai.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const piano = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const nome = piano.nome || path.basename(piano.cartella);
const LAVORO = path.join(ROOT, 'work', 'pc', nome);
const OUT = path.join(LAVORO, 'montaggio');
const info = JSON.parse(fs.readFileSync(path.join(OUT, 'capitoli.json'), 'utf8'));
const log = (...a) => console.log('[pacchetto]', ...a);
const mmss = (s) => { const t = Math.round(s); const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), x = t % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };

// capitoli YouTube: 0:00 apertura, poi uno per capitolo (nomi uguali distinti dal sottotitolo), almeno 10 s l'uno
const righe = [{ t: 0, testo: 'Intro' }];
for (const c of info.capitoli) {
  const doppio = info.capitoli.filter((x) => x.nome === c.nome).length > 1;
  const testo = doppio && c.sotto ? `${c.nome} – ${c.sotto.split('·')[0].trim()}` : c.nome;
  if (c.t - righe[righe.length - 1].t < 10) { if (c.t < 10) righe[0].testo = testo; continue; }
  righe.push({ t: c.t, testo });
}
const capitoliTesto = righe.length >= 3 ? righe.map((r) => `${mmss(r.t)} ${r.testo}`).join('\n') : '';

const riassunto = fs.existsSync(path.join(LAVORO, 'materiale.md')) ? fs.readFileSync(path.join(LAVORO, 'materiale.md'), 'utf8').slice(0, 40000) : '';
const parlato = piano.sequenza.filter((e) => e.v).map((e) => `${e.da} … ${e.a}`).join('\n');
log('chiedo all\'AI titoli, descrizione e tag…');
const risposta = await chiediAI(`Sei il social media manager di Denis (.blackden), creator italiano su YouTube (tech, viaggi, politica).
Per il suo video "${nome}" (${mmss(info.totale)}) scrivi in italiano, tono suo (diretto, ironico, niente frasi da agenzia):
- "titoli": 3 titoli YouTube diversi (max 70 caratteri, che facciano cliccare senza mentire)
- "descrizione": 3-5 righe che raccontano il video e invogliano a guardarlo fino alla fine (niente capitoli: li aggiungo io)
- "tag": 15 tag YouTube
- "copertina": 3 testi brevissimi per la copertina (2-4 parole, in maiuscolo, d'impatto)
Rispondi solo con JSON {"titoli":[],"descrizione":"","tag":[],"copertina":[]}.
Capitoli: ${righe.map((r) => r.testo).join(', ')}
Pezzi parlati usati (inizio … fine):
${parlato.slice(0, 6000)}
Materiale:
${riassunto}`, { json: true }).catch(() => null);
let ai = {};
try { ai = JSON.parse(String(risposta || '').replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { log('l\'AI non ha risposto bene: solo capitoli e copertine col nome'); }

const testo = [
  '=== TITOLI (scegline uno) ===', ...(ai.titoli?.length ? ai.titoli : [nome]), '',
  '=== DESCRIZIONE (copia tutto da qui) ===', ai.descrizione || '', '',
  ...(capitoliTesto ? ['Capitoli:', capitoliTesto, ''] : []),
  '=== TAG ===', (ai.tag || []).join(', '), '',
].join('\n');
const fileTesto = path.join(OUT, `${nome} - YouTube.txt`);
fs.writeFileSync(fileTesto, testo);
log(`testi: ${fileTesto}`);

// copertine: fotogramma del video finito (sigla e inizio dei capitoli), velo scuro a sinistra, scritta gialla enorme
const FONT = path.join(OUT, 'font.ttf');
// fotogrammi senza scritte: 4,5 s dopo l'inizio dei capitoli (il titolo dura 3,2 s), mai sulla sigla
const tempi = info.capitoli.map((c) => c.t + 4.5).filter((x) => x < info.totale - 0.5 && (info.sigla == null || Math.abs(x - info.sigla) > 4)).slice(0, 3);
if (!tempi.length) tempi.push(Math.min(info.totale / 2, info.totale - 0.5));
const scritte = (ai.copertina?.length ? ai.copertina : [nome.toUpperCase()]).map((x) => String(x).toUpperCase());
tempi.forEach((tc, k) => {
  const scritta = scritte[k % scritte.length];
  const ftxt = `copertina${k + 1}.txt`;
  fs.writeFileSync(path.join(OUT, ftxt), scritta.length > 14 ? scritta.replace(/^(.{6,14}?)\s/, '$1\n') : scritta);
  const uscita = path.join(OUT, `${nome} - copertina ${k + 1}.jpg`);
  // Full HD: il massimo sensato per YouTube, che rifiuta le copertine sopra i 2 MB
  const vf = `scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos,crop=1920:1080,eq=saturation=1.25:contrast=1.08,unsharp=5:5:0.6,`
    + `drawbox=x=0:y=0:w=1140:h=1080:color=black@0.35:t=fill,`
    + (fs.existsSync(FONT) ? `drawtext=fontfile=font.ttf:textfile=${ftxt}:fontsize=177:line_spacing=9:fontcolor=0xFFE500:borderw=12:bordercolor=black:x=90:y=(h-text_h)/2` : 'null');
  for (const q of [2, 3, 5, 8]) {
    const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(tc), '-i', info.finale, '-frames:v', '1', '-vf', vf, '-q:v', String(q), uscita], { cwd: OUT });
    if (r.status !== 0) break;
    if (fs.statSync(uscita).size < 1.9e6) { log(`copertina: ${uscita}`); break; }
  }
});
