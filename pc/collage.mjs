// Collage 4K verticale (2160×3840) sul PC: una cartella = un video.
//   node pc\collage.mjs <nome>                  render 4K   → work\collage\<nome>\<nome>-4k.mp4
//   node pc\collage.mjs <nome> --anteprima      1080×1920 veloce, per controllare i tempi
//   node pc\collage.mjs <nome> --fotogrammi 2,17.5,26   PNG piccoli in work\collage\<nome>\prove
//   node pc\collage.mjs <nome> --studio         apre Remotion Studio sul progetto
// La prima volta crea la cartella con scena.json di esempio. Si cambia il video cambiando i file
// della cartella (stesso nome) o i numeri in scena.json; i file che mancano escono come segnaposto rosa.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const nome = args.find((a) => !a.startsWith('--') && !/^[\d.,]+$/.test(a));
if (!nome) {
  console.log('uso: node pc\\collage.mjs <nome> [--anteprima | --fotogrammi 2,17.5 | --studio]');
  process.exit(1);
}
const opz = (k) => args.includes(`--${k}`);
const valore = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };

const DIR = path.join(ROOT, 'work', 'collage', nome);
const PUBBLICO = path.join(ROOT, 'public', 'collage', nome);

if (!fs.existsSync(path.join(DIR, 'scena.json'))) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'pc', 'collage-esempio.json'), path.join(DIR, 'scena.json'));
  // il font e la texture della prova collage, se ci sono: il resto lo mette Denis
  for (const f of ['InstrumentSerif-Italic.ttf', 'giornale.png']) {
    const da = path.join(ROOT, 'public', 'prova-collage', f);
    if (fs.existsSync(da)) fs.copyFileSync(da, path.join(DIR, f));
  }
  console.log(`creata ${DIR} con scena.json di esempio`);
}

const scena = JSON.parse(fs.readFileSync(path.join(DIR, 'scena.json'), 'utf8'));
const presenti = fs.readdirSync(DIR).filter((f) => fs.statSync(path.join(DIR, f)).isFile());

// tutti i file che scena.json nomina (gli sprite {n} uno per fotogramma)
const servono = new Set(Object.values(scena.font || {}));
if (scena.base?.video) servono.add(scena.base.video);
if (scena.musica?.file) servono.add(scena.musica.file);
for (const s of scena.scene) for (const l of s.livelli) {
  if (!l.file) continue;
  if (l.fotogrammi && l.file.includes('{n}')) for (let n = 1; n <= l.fotogrammi; n++) servono.add(l.file.replace('{n}', n));
  else servono.add(l.file);
}
const mancano = [...servono].filter((f) => !presenti.includes(f)).sort();
if (mancano.length) console.log(`mancano ${mancano.length} file (escono come segnaposto o col colore di riserva):\n  ${mancano.join('\n  ')}`);

// copia in public\collage\<nome>, solo i file cambiati. Niente junction: il bundler di Remotion
// ricrea i link nella sua cartella temporanea e su Windows senza admin fallisce (EPERM)
if (fs.existsSync(PUBBLICO) && fs.lstatSync(PUBBLICO).isSymbolicLink()) fs.rmSync(PUBBLICO);
fs.mkdirSync(PUBBLICO, { recursive: true });
for (const f of presenti) {
  const da = path.join(DIR, f), a = path.join(PUBBLICO, f);
  const s = fs.statSync(da);
  if (!fs.existsSync(a) || fs.statSync(a).size !== s.size || fs.statSync(a).mtimeMs < s.mtimeMs) fs.copyFileSync(da, a);
}
for (const f of fs.readdirSync(PUBBLICO)) {
  const a = path.join(PUBBLICO, f);
  if (!presenti.includes(f) && fs.lstatSync(a).isFile()) fs.rmSync(a);
}

let durata = scena.durata;
if (!durata && scena.base?.video && presenti.includes(scena.base.video)) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(DIR, scena.base.video)], { encoding: 'utf8' });
  durata = parseFloat(r.stdout) || undefined;
}
const props = { ...scena, cartella: `collage/${nome}`, presenti, durata };
const fileProps = path.join(DIR, '.props.json');
fs.writeFileSync(fileProps, JSON.stringify(props));

const npx = (a) => {
  const r = spawnSync('npx', ['remotion', ...a, ...(process.env.REMOTION_BROWSER ? [`--browser-executable=${process.env.REMOTION_BROWSER}`] : [])],
    { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

if (opz('studio')) {
  npx(['studio', 'src/index.ts', `--props=${fileProps}`]);
} else if (valore('fotogrammi')) {
  const prove = path.join(DIR, 'prove');
  fs.mkdirSync(prove, { recursive: true });
  for (const t of valore('fotogrammi').split(',').map(Number)) {
    const out = path.join(prove, `t${t.toFixed(2)}.png`);
    npx(['still', 'src/index.ts', 'Collage', out, `--props=${fileProps}`, `--frame=${Math.round(t * (scena.fps || 30))}`, '--scale=0.25']);
  }
} else {
  const anteprima = opz('anteprima');
  const out = path.join(DIR, `${nome}-${anteprima ? 'anteprima' : '4k'}.mp4`);
  const inizio = Date.now();
  // 4K: CRF 14 (le grafiche piatte pesano poco, i dettagli della carta restano), fotogrammi PNG e
  // BT.709 come i corti (vedi renderizza in scripts/regista.mjs). L'anteprima è 1080 a CRF 20.
  npx(['render', 'src/index.ts', 'Collage', out, `--props=${fileProps}`,
    '--codec=h264', `--crf=${anteprima ? 20 : 14}`, `--x264-preset=${anteprima ? 'veryfast' : 'medium'}`,
    '--audio-bitrate=320k', '--image-format=png', '--color-space=bt709',
    ...(anteprima ? ['--scale=0.5'] : [])]);
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,bit_rate', '-of', 'csv=p=0', out], { encoding: 'utf8' });
  console.log(`\n${out}\n${r.stdout.trim()}  (${Math.round((Date.now() - inizio) / 1000)} s)`);
}
