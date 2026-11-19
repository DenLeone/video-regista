// 🎬 Vetrina (19/11, idea 7): una scena fatta a mano diventa un reel a sé, «prompt → risultato».
// In alto il prompt si scrive da solo (come se lo stessi digitando a Claude), poi sotto parte la scena 3D con i suoi
// suoni, in fondo la firma. Serve a far vedere cosa fa la skill Black Den Motion, senza girare niente.
//   node scripts/vetrina.mjs <scena> "<prompt>" uscita.mp4
// La scena è un file di motion/scene (es. skill-vinile). Verticale 1080×1920, 30 fps.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { renderScena } from './bdm.mjs';
import { codiceScena, intestazione } from './scene-mano.mjs';

const W = 1080, H = 1920, Y_SCENA = 820, H_SCENA = 700;
// zone.json (tassative): la scena si rimpicciolisce per stare tra x 60 e 920 (sotto y 970 a destra ci sono i tasti di Instagram)
const X_SCENA = 60, W_SCENA_VIDEO = 860, H_SCENA_VIDEO = Math.round((H_SCENA * W_SCENA_VIDEO) / W / 2) * 2;
const log = (...a) => console.log('vetrina:', ...a);
// dentro <script>: «</script>» nel testo chiuderebbe la pagina, quindi < diventa \u003c
const js = (s) => JSON.stringify(String(s)).replace(/</g, '\\u003c');

// quanto ci mette il prompt a scriversi (28 caratteri al secondo, minimo 1,6 s, massimo 4 s)
export const tempoBattitura = (prompt) => Math.min(4, Math.max(1.6, String(prompt).length / 28));

// la pagina del testo: etichetta, prompt che si scrive, firma in fondo alla durata
export function codiceTesto(prompt, durata) {
  return `
M.el('div', { id: 'et', cls: 'abs sub', text: 'IL PROMPT', style: { left: '60px', top: '240px', letterSpacing: '8px' } });
M.el('div', { id: 'pr', cls: 'abs txt', text: ${js(prompt)}, style: { left: '60px', top: '300px', width: '960px', whiteSpace: 'normal', fontSize: '46px', fontWeight: 700, lineHeight: 1.3 } });
add(P.enter('#et', { t: 0.1, dur: 0.4, from: 'left' }), P.typewriter('#pr', { t: 0.35, cps: 28, cursor: true, hideCursorAfter: ${(0.35 + tempoBattitura(prompt) + 0.4).toFixed(2)} }));
M.el('div', { id: 'ok', cls: 'abs sub', text: '↓ IL RISULTATO', style: { left: '60px', top: '720px', letterSpacing: '8px' } });
add(P.enter('#ok', { t: ${(0.35 + tempoBattitura(prompt) + 0.2).toFixed(2)}, dur: 0.4, from: 'up' }));
M.el('div', { id: 'firma', cls: 'abs row', text: 'Black Den Motion · @itsblackden', style: { top: '1460px', fontSize: '34px', fontWeight: 600, opacity: 0.6 } }); // zone.json: sopra il «cimitero» (y 1530)
add(P.enter('#firma', { t: ${Math.max(0, durata - 2.2).toFixed(2)}, dur: 0.5, from: 'up' }));`;
}

export function filtroVetrina({ tScena, durata }) {
  return [
    `color=c=0x0b0b0e:s=${W}x${H}:d=${durata}:r=30,format=rgba[bg]`,
    `[1:v]setpts=PTS-STARTPTS[t]`,
    `[2:v]scale=${W_SCENA_VIDEO}:${H_SCENA_VIDEO},setpts=PTS-STARTPTS+${tScena}/TB[s]`,
    `[bg][t]overlay=0:0:eof_action=repeat[a]`,
    `[a][s]overlay=${X_SCENA}:${Y_SCENA}:eof_action=repeat,format=yuv420p[v]`,
  ].join(';');
}

export async function vetrina({ scena, prompt, uscita }) {
  const sorgente = codiceScena(scena);
  if (!sorgente) throw new Error(`scena ${scena} non trovata in motion/scene`);
  if (intestazione(sorgente).serve === 'foto') throw new Error(`la scena ${scena} ha bisogno della foto di un prodotto: usala dentro un montaggio`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vetrina-'));
  try {
    const durScena = intestazione(sorgente).durata;
    const tScena = +(0.35 + tempoBattitura(prompt) + 0.5).toFixed(2);
    const durata = +(tScena + durScena + 1.2).toFixed(2);
    log(`prompt ${String(prompt).length} caratteri, scena da ${tScena} s, totale ${durata} s`);
    const testo = await renderScena({ codice: codiceTesto(prompt, durata), opz: { w: W, h: H, dur: durata }, uscita: path.join(dir, 'testo.mov') });
    const s = await renderScena({ codice: `const DATI = {};\n${sorgente}`, opz: { w: W, h: H_SCENA, dur: durScena }, uscita: path.join(dir, 'scena.mov') });
    const audio = [testo.wav, s.wav].map((w, i) => (w ? { w, at: i ? tScena : 0 } : null)).filter(Boolean);
    const ingressi = ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-i', testo.mov, '-i', s.mov, ...audio.flatMap((a) => ['-i', a.w])];
    const fa = audio.length ? `;${audio.map((a, i) => `[${3 + i}:a]aresample=48000,adelay=${Math.round(a.at * 1000)}:all=1[x${i}]`).join(';')};[0:a]${audio.map((_, i) => `[x${i}]`).join('')}amix=inputs=${audio.length + 1}:duration=first:normalize=0,atrim=0:${durata},volume=0.75,alimiter=limit=0.7:level=disabled[au]` : '';
    const r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...ingressi, '-filter_complex', `${filtroVetrina({ tScena, durata })}${fa}`,
      '-map', '[v]', '-map', audio.length ? '[au]' : '0:a', '-t', String(durata), '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', uscita], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`ffmpeg: ${(r.stderr || '').split('\n').filter(Boolean).pop()}`);
    log(`fatto: ${uscita} (${durata} s)`);
    return { uscita, durata };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [scena, prompt, uscita = 'vetrina.mp4'] = process.argv.slice(2);
  try { await vetrina({ scena, prompt, uscita }); } catch (e) { console.error(`vetrina: ${e.message}`); process.exit(1); }
}
