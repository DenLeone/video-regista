// Campionario dei contenitori di Lista UI per DaVinci: ogni contenitore come video trasparente
// (ProRes 4444 con canale alfa) animato, la sua versione ferma (PNG + video fermo da 3 s) e un
// progetto FCPXML con tutto già in timeline su un fondo crema, ogni pezzo su una clip sua.
// I testi di prova stanno in pc\campionario.json. Istruzioni: pc\CAMPIONARIO-DAVINCI.md
//   node pc\campionario.mjs [--solo chat]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const OUT = path.join(ROOT, 'work', 'pc', 'Campionario');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'pc', 'campionario.json'), 'utf8'));
const DUR = Number(cfg.durata) || 3;
const FPS = 30, W = 1080, H = 1920;
const solo = process.argv.includes('--solo') ? process.argv[process.argv.indexOf('--solo') + 1] : null;
const log = (...a) => console.log('[campionario]', ...a);
fs.mkdirSync(OUT, { recursive: true });

// la shell serve solo a npx su Windows (è un .cmd); ffmpeg va lanciato senza, se no i nomi con gli spazi si spezzano
function esegui(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' && cmd === 'npx' });
  if (r.status !== 0) throw new Error(`${cmd} ${args.slice(0, 3).join(' ')}: uscito con ${r.status}`);
}
const browser = process.env.REMOTION_BROWSER ? [`--browser-executable=${process.env.REMOTION_BROWSER}`] : [];
const q = (p) => (process.platform === 'win32' ? `"${p}"` : p); // con shell su Windows i percorsi con spazi vanno tra virgolette

const fatti = [];
for (const [i, p] of cfg.pezzi.entries()) {
  if (solo && !p.nome.includes(solo)) continue;
  const base = `${String(i + 1).padStart(2, '0')} ${p.nome}`;
  const props = path.join(OUT, `${base}.json`);
  fs.writeFileSync(props, JSON.stringify({ s: { at: 0, dur: DUR, ...p.s }, durata: DUR }));
  const animato = path.join(OUT, `${base}.mov`);
  const png = path.join(OUT, `${base} (fermo).png`);
  const fermo = path.join(OUT, `${base} (fermo).mov`);
  log(`${p.nome}: animato`);
  esegui('npx', ['remotion', 'render', 'src/index.ts', 'Pezzo', q(animato), `--props=${q(props)}`, '--codec=prores', '--prores-profile=4444',
    '--pixel-format=yuva444p10le', '--image-format=png', '--muted', '--log=error', ...browser]);
  log(`${p.nome}: fermo`);
  esegui('npx', ['remotion', 'still', 'src/index.ts', 'Pezzo', q(png), `--props=${q(props)}`, `--frame=${Math.round(DUR * FPS) - 2}`, '--image-format=png', '--log=error', ...browser]);
  esegui('ffmpeg', ['-v', 'error', '-y', '-loop', '1', '-framerate', String(FPS), '-t', String(DUR), '-i', png, '-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', fermo]);
  fs.rmSync(props, { force: true });
  fatti.push({ nome: p.nome, animato, fermo });
}
if (!fatti.length) { log('niente da fare'); process.exit(0); }

// fondo crema lungo quanto tutto (animati e poi fermi, uno dopo l'altro)
const totale = fatti.length * 2 * DUR;
const fondo = path.join(OUT, '00 fondo crema.mov');
esegui('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=0xF7F5EF:s=${W}x${H}:r=${FPS}:d=${totale}`, '-c:v', 'prores_ks', '-profile:v', '2', fondo]);

// ---------- progetto DaVinci (FCPXML) ----------
const fr = (s) => Math.round(s * FPS);
const tt = (s) => `${fr(s)}/${FPS}s`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const url = (p) => `file:///${p.replace(/\\/g, '/').replace(/^\//, '').split('/').map((x, i) => (i === 0 ? x : encodeURIComponent(x))).join('/')}`;
const assets = [];
const asset = (file, dur) => {
  const id = `a${assets.length + 1}`;
  assets.push(`    <asset id="${id}" name="${esc(path.basename(file))}" start="0s" duration="${tt(dur)}" hasVideo="1" hasAudio="0" format="r1">\n      <media-rep kind="original-media" src="${esc(url(file))}"/>\n    </asset>`);
  return id;
};
const fondoRef = asset(fondo, totale);
const sopra = [];
let t = 0;
for (const versione of ['animato', 'fermo']) {
  for (const x of fatti) {
    const ref = asset(x[versione], DUR);
    sopra.push(`        <asset-clip ref="${ref}" lane="1" offset="${tt(t)}" start="0s" duration="${tt(DUR)}" name="${esc(`${x.nome} (${versione})`)}">\n          <marker start="0s" duration="1/${FPS}s" value="${esc(`${x.nome} · ${versione}`)}"/>\n        </asset-clip>`);
    t += DUR;
  }
}
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.9">
  <resources>
    <format id="r1" name="FFVideoFormat1080x1920p30" frameDuration="1/${FPS}s" width="${W}" height="${H}"/>
${assets.join('\n')}
  </resources>
  <library>
    <event name="Campionario Lista UI">
      <project name="Campionario Lista UI">
        <sequence format="r1" duration="${tt(totale)}" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k">
          <spine>
      <asset-clip ref="${fondoRef}" offset="0s" start="0s" duration="${tt(totale)}" name="fondo crema">
${sopra.join('\n')}
      </asset-clip>
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>
`;
const progetto = path.join(OUT, 'Campionario Lista UI - DaVinci.fcpxml');
fs.writeFileSync(progetto, xml);
log(`fatto: ${OUT}`);
log(`DaVinci: File → Importa → Timeline → ${path.basename(progetto)}`);
