// Montaggio di un video YouTube lungo sul PC di Denis (16:9, 30 fps), da un piano scritto con le
// PAROLE: { "v": "V015", "da": "Quello alle mie spalle", "a": "perché è figo" } → i tempi esatti li
// trova qui nelle trascrizioni di pc/analizza.mjs. Niente upload: legge il girato dalla sua cartella.
// - le pause lunghe dentro un pezzo parlato si tagliano (jump cut) alternando lo zoom 100/110%
// - verticali su sfondo sfocato, HDR dell'iPhone riportato a SDR, tutto a 1920×1080 30 fps
// - titoli dei capitoli (giallo, in basso a sinistra) e titolo grande (sigla)
// - musica per capitolo che si abbassa quando Denis parla; voce a −14 LUFS
// - codifica sulla scheda video (NVENC), se no x264
// - progetto DaVinci (FCPXML) con gli originali e i marcatori dei capitoli
//   node pc\monta.mjs pc\progetti\austria.json [--fino 120] [--4k]   (--fino: anteprima dei primi N secondi)
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const FILE_PIANO = process.argv[2];
const FINO = process.argv.includes('--fino') ? Number(process.argv[process.argv.indexOf('--fino') + 1]) : Infinity;
if (!FILE_PIANO) { console.error('uso: node pc/monta.mjs <piano.json> [--fino secondi]'); process.exit(1); }
const piano = JSON.parse(fs.readFileSync(FILE_PIANO, 'utf8'));
const nome = piano.nome || path.basename(piano.cartella);
const LAVORO = path.join(ROOT, 'work', 'pc', nome);
const OUT = path.join(LAVORO, 'montaggio');
const PEZZI = path.join(OUT, 'pezzi');
fs.mkdirSync(PEZZI, { recursive: true });
const log = (...a) => console.log('[monta]', ...a);
// 1080p di base; "--4k" (o "risoluzione": "4k" nel piano) per l'uscita in 3840×2160
const IN_4K = process.argv.includes('--4k') || piano.risoluzione === '4k';
const W = IN_4K ? 3840 : 1920, H = IN_4K ? 2160 : 1080, FPS = 30, K = W / 1920;

const materiale = JSON.parse(fs.readFileSync(path.join(LAVORO, 'materiale.json'), 'utf8'));
const perId = new Map(materiale.video.map((v) => [v.id, v]));
const sorgente = (id) => { const v = perId.get(id); if (!v) throw new Error(`video ${id} non trovato in materiale.json`); return { ...v, percorso: path.join(piano.cartella, v.file) }; };
const parole = (id) => { const f = path.join(LAVORO, 'trascrizioni', `${id}.json`); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : []; };

// ---------- dalle parole ai tempi ----------
const norm = (t) => String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
function trova(ws, frase, da = 0, fine = false) {
  const cerca = norm(frase);
  const tok = ws.map((w) => norm(w.w).join(''));
  const k = Math.min(cerca.length, 5);
  const pezzo = fine ? cerca.slice(-k) : cerca.slice(0, k);
  let meglio = null;
  for (let i = da; i + k <= tok.length; i++) {
    let ok = 0;
    for (let j = 0; j < k; j++) if (tok[i + j] === pezzo[j] || (tok[i + j].length > 3 && pezzo[j].startsWith(tok[i + j].slice(0, 4)))) ok++;
    if (ok / k >= 0.8 && (!meglio || ok > meglio.ok)) { meglio = { i: fine ? i + k - 1 : i, ok }; if (ok === k) break; }
  }
  return meglio?.i ?? -1;
}
/** intervalli [s, e] del parlato tra le due frasi, divisi dove la pausa supera `pausa` secondi */
function intervalli(id, da, a, pausa = 0.7) {
  const ws = parole(id);
  if (!ws.length) throw new Error(`${id}: niente trascrizione`);
  const i = da ? trova(ws, da) : 0;
  if (i < 0) throw new Error(`${id}: non trovo l'inizio «${da}»`);
  const j = a ? trova(ws, a, i, true) : ws.length - 1;
  if (j < 0) throw new Error(`${id}: non trovo la fine «${a}»`);
  const out = [];
  let s = Math.max(ws[i].s - 0.12, i > 0 ? ws[i - 1].e + 0.02 : 0);
  for (let k = i; k <= j; k++) {
    const fineQui = k === j || ws[k + 1].s - ws[k].e > pausa;
    if (!fineQui) continue;
    const e = Math.min(ws[k].e + 0.22, ws[k + 1] ? ws[k + 1].s - 0.03 : Infinity);
    out.push([+s.toFixed(3), +e.toFixed(3)]);
    if (k < j) s = Math.max(ws[k + 1].s - 0.12, ws[k].e + 0.02);
  }
  return out;
}

// ---------- dal piano ai pezzi ----------
// pezzo: { v: {id, t0}, a: {id, t0} | null, amb: volume dell'audio proprio se a è null, dur, zoom, titoli: [] }
const pezzi = [];
const capitoli = []; // { nome, t, musica }
let t = 0, zoomAlterna = false;
let titoliInAttesa = [];
// un titolo di capitolo dura ~3 s anche se il primo pezzo è più corto: prosegue sui pezzi dopo
const aggiungi = (p) => {
  const resto = [];
  for (const x of titoliInAttesa) {
    const qui = Math.min(x.per, p.dur);
    p.titoli = [...(p.titoli || []), { ...x, da: 0, per: qui, esce: qui >= x.per }];
    if (x.per - qui > 0.2) resto.push({ ...x, per: x.per - qui, entra: false });
  }
  titoliInAttesa = resto;
  pezzi.push(p);
  t += p.dur;
};
for (const el of piano.sequenza) {
  if (t >= FINO) break;
  if (el.capitolo) {
    capitoli.push({ nome: el.capitolo, t, musica: el.musica ?? null });
    if (el.titolo !== false) titoliInAttesa.push({ testo: el.capitolo, sotto: el.sotto || '', stile: 'capitolo', per: 3.2 });
    continue;
  }
  if (el.musica !== undefined && !el.capitolo) { capitoli.push({ nome: null, t, musica: el.musica }); continue; }
  if (el.titolo) { // titolo grande su un B-roll (sigla)
    const s = sorgente(el.su);
    aggiungi({ v: { id: s.id, t0: el.dal || 0 }, a: null, amb: 0, dur: el.per || 3.5, zoom: 1, titoli: [{ testo: el.titolo, sotto: el.sotto || '', stile: 'sigla', da: 0, per: el.per || 3.5 }] });
    continue;
  }
  if (el.broll) { // B-roll da solo: si sente l'ambiente piano (o niente), la musica sale
    const s = sorgente(el.broll);
    const dur = Math.min(el.per || 3, Math.max(0.5, s.durata - (el.dal || 0) - 0.05));
    aggiungi({ v: { id: s.id, t0: el.dal || 0 }, a: null, amb: el.audio === 'muto' || !s.audio ? 0 : el.audio === 'pieno' ? 1 : 0.25, dur, zoom: 1 });
    continue;
  }
  if (el.v) { // parlato
    const s = sorgente(el.v);
    const ivs = intervalli(s.id, el.da, el.a, el.pausa ?? 0.7);
    // B-roll sopra la voce: { v, dal, al (secondi nel pezzo montato), per }
    const sopra = (el.sopra || []).map((x) => ({ ...x, s: sorgente(x.v) }));
    let tp = 0;
    ivs.forEach(([a, b], k) => {
      if (k > 0) zoomAlterna = !zoomAlterna;
      const zoom = s.w >= s.h && el.zoom !== false ? (zoomAlterna ? 1.1 : 1) : 1;
      // il pezzo si spezza dove inizia e finisce un B-roll sopra
      const tagli = [0, b - a];
      for (const x of sopra) for (const q of [x.al - tp, x.al + x.per - tp]) if (q > 0.3 && q < b - a - 0.3) tagli.push(q);
      tagli.sort((x, y) => x - y);
      for (let n = 0; n + 1 < tagli.length; n++) {
        const q0 = tagli[n], q1 = tagli[n + 1], dur = +(q1 - q0).toFixed(3);
        if (dur < 0.05) continue;
        const br = sopra.find((x) => tp + q0 >= x.al - 0.01 && tp + q0 < x.al + x.per);
        if (br) aggiungi({ v: { id: br.s.id, t0: (br.dal || 0) + (tp + q0 - br.al) }, a: { id: s.id, t0: a + q0 }, dur, zoom: 1 });
        else aggiungi({ v: { id: s.id, t0: a + q0 }, a: { id: s.id, t0: a + q0 }, dur, zoom });
      }
      tp += b - a;
    });
  }
}
const totale = t;
log(`${pezzi.length} pezzi, ${Math.floor(totale / 60)}:${String(Math.round(totale % 60)).padStart(2, '0')} di video, ${capitoli.filter((c) => c.nome).length} capitoli`);

// ---------- render dei pezzi ----------
let encoder = null;
function codifica() {
  if (encoder) return encoder;
  const prova = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=320x240:d=0.2', '-c:v', 'h264_nvenc', '-f', 'null', '-']);
  encoder = prova.status === 0 ? ['-c:v', 'h264_nvenc', '-preset', 'p5', '-rc', 'vbr', '-cq', IN_4K ? '22' : '20', '-b:v', '0', '-pix_fmt', 'yuv420p']
    : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p'];
  log(`codifica: ${prova.status === 0 ? 'scheda video (NVENC)' : 'processore (x264)'}`);
  return encoder;
}
// font: quello di Windows se c'è, copiato nella cartella di lavoro (i percorsi con "C:" nei filtri di ffmpeg sono un incubo)
const FONT = path.join(OUT, 'font.ttf');
if (!fs.existsSync(FONT)) {
  const cand = ['C:/Windows/Fonts/segoeuib.ttf', 'C:/Windows/Fonts/arialbd.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'].find((f) => fs.existsSync(f));
  if (cand) fs.copyFileSync(cand, FONT);
}
const TONEMAP = 'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv';
function filtroTitoli(p, n) {
  const out = [];
  p.titoli.forEach((x, k) => {
    const a = x.da || 0, b = Math.min(p.dur, a + (x.per || 3));
    const entra = x.entra !== false, esce = x.esce !== false;
    const alpha = `if(lt(t\\,${a}+0.3*${entra ? 1 : 0})\\,(t-${a})/0.3\\,if(gt(t\\,${b}-0.3*${esce ? 1 : 0})\\,(${b}-t)/0.3\\,1))*between(t\\,${a}\\,${b})`;
    const f1 = `t${n}_${k}a.txt`, f2 = `t${n}_${k}b.txt`;
    fs.writeFileSync(path.join(OUT, f1), x.testo.toUpperCase());
    if (x.stile === 'sigla') {
      out.push(`drawtext=fontfile=font.ttf:textfile=${f1}:fontsize=${190 * K}:fontcolor=0xFFE500:shadowcolor=black@0.55:shadowx=${6 * K}:shadowy=${6 * K}:x=(w-text_w)/2:y=(h-text_h)/2-${40 * K}:alpha='${alpha}'`);
      if (x.sotto) { fs.writeFileSync(path.join(OUT, f2), x.sotto); out.push(`drawtext=fontfile=font.ttf:textfile=${f2}:fontsize=${52 * K}:fontcolor=white:shadowcolor=black@0.6:shadowx=${3 * K}:shadowy=${3 * K}:x=(w-text_w)/2:y=(h/2)+${90 * K}:alpha='${alpha}'`); }
    } else {
      out.push(`drawtext=fontfile=font.ttf:textfile=${f1}:fontsize=${104 * K}:fontcolor=0xFFE500:shadowcolor=black@0.6:shadowx=${5 * K}:shadowy=${5 * K}:x=${90 * K}:y=h-${300 * K}:alpha='${alpha}'`);
      if (x.sotto) { fs.writeFileSync(path.join(OUT, f2), x.sotto); out.push(`drawtext=fontfile=font.ttf:textfile=${f2}:fontsize=${46 * K}:fontcolor=white:shadowcolor=black@0.6:shadowx=${3 * K}:shadowy=${3 * K}:x=${96 * K}:y=h-${175 * K}:alpha='${alpha}'`); }
    }
  });
  return out.join(',');
}
function renderPezzo(p, n) {
  const uscita = path.join(PEZZI, `p${String(n).padStart(4, '0')}.mp4`);
  const firma = JSON.stringify({ ...p, W });
  const fileFirma = `${uscita}.json`;
  if (fs.existsSync(uscita) && fs.existsSync(fileFirma) && fs.readFileSync(fileFirma, 'utf8') === firma) return uscita;
  const sv = sorgente(p.v.id);
  const sa = p.a ? sorgente(p.a.id) : null;
  const args = ['-v', 'error', '-y', '-ss', p.v.t0.toFixed(3), '-t', (p.dur + 0.1).toFixed(3), '-i', sv.percorso];
  let ia = null;
  if (sa && sa.id !== sv.id) { args.push('-ss', p.a.t0.toFixed(3), '-t', (p.dur + 0.1).toFixed(3), '-i', sa.percorso); ia = '1:a:0'; }
  else if (sa) ia = '0:a:0';
  const hdr = sv.hdr ? `${TONEMAP},` : '';
  const verticale = sv.h > sv.w;
  const z = p.zoom || 1;
  let v = verticale
    ? `[0:v:0]${hdr}split[a][b];[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},gblur=sigma=${40 * K},eq=brightness=-0.12[bg];[b]scale=-2:${H}[fg];[bg][fg]overlay=(W-w)/2:0`
    : `[0:v:0]${hdr}scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}${z > 1 ? `,crop=iw/${z}:ih/${z},scale=${W}:${H}` : ''}`;
  v += `,fps=${FPS},format=yuv420p,setsar=1`;
  const tit = p.titoli?.length ? filtroTitoli(p, n) : '';
  if (tit) v += `,${tit}`;
  v += `,trim=duration=${p.dur.toFixed(3)},setpts=PTS-STARTPTS[v]`;
  const nul = `anullsrc=r=48000:cl=stereo,atrim=duration=${p.dur.toFixed(3)}[a]`;
  let a;
  if (ia) a = `[${ia}]aresample=48000,aformat=channel_layouts=stereo,apad,atrim=duration=${p.dur.toFixed(3)},afade=t=in:d=0.02,afade=t=out:st=${Math.max(0, p.dur - 0.03).toFixed(3)}:d=0.03[a]`;
  else if (p.amb > 0 && sv.audio) a = `[0:a:0]aresample=48000,aformat=channel_layouts=stereo,volume=${p.amb},apad,atrim=duration=${p.dur.toFixed(3)},afade=t=in:d=0.15,afade=t=out:st=${Math.max(0, p.dur - 0.2).toFixed(3)}:d=0.2[a]`;
  else a = nul;
  const comando = (vf) => [...args, '-filter_complex', `${vf};${a}`, '-map', '[v]', '-map', '[a]', ...codifica(), '-r', String(FPS), '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', uscita];
  let r = spawnSync('ffmpeg', comando(v), { cwd: OUT, encoding: 'utf8' });
  if (r.status !== 0 && hdr) r = spawnSync('ffmpeg', comando(v.replace(`${TONEMAP},`, '')), { cwd: OUT, encoding: 'utf8' }); // ffmpeg senza zscale
  if (r.status !== 0) throw new Error(`pezzo ${n} (${p.v.id} da ${p.v.t0}s): ${String(r.stderr).split('\n').filter(Boolean).slice(-3).join(' | ')}`);
  fs.writeFileSync(fileFirma, firma);
  return uscita;
}

const t0 = Date.now();
const fatti = pezzi.map((p, n) => {
  const u = renderPezzo(p, n);
  process.stdout.write(`\r[monta] pezzi ${n + 1}/${pezzi.length}`);
  return u;
});
console.log('');
const lista = path.join(OUT, 'lista.txt');
fs.writeFileSync(lista, fatti.map((f) => `file '${f.replace(/\\/g, '/')}'`).join('\n'));
const voce = path.join(OUT, 'voce.mp4');
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lista, '-c', 'copy', voce]);

// ---------- musica e mix ----------
const DIR_MUSICA = piano.musicaCartella || 'G:/Il mio Drive/12 · Risorse/Assets/Suoni/Musica';
const brani = [];
const tratti = capitoli.filter((c) => c.musica !== null || c.nome);
tratti.forEach((c, k) => {
  const fine = k + 1 < tratti.length ? tratti[k + 1].t : totale;
  if (!c.musica || fine - c.t < 1) return;
  const f = path.isAbsolute(c.musica) ? c.musica : path.join(DIR_MUSICA, c.musica);
  if (!fs.existsSync(f)) { log(`musica non trovata: ${f} (quel tratto resta senza)`); return; }
  brani.push({ f, da: c.t, dur: fine - c.t });
});
const finale = path.join(OUT, `${nome}${Number.isFinite(FINO) ? ' - ANTEPRIMA' : ''}.mp4`);
const vol = piano.volumeMusica ?? 0.22;
if (brani.length) {
  const ins = brani.flatMap((b) => ['-stream_loop', '-1', '-i', b.f]);
  const parti = brani.map((b, k) => `[${k + 1}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=duration=${b.dur.toFixed(2)},afade=t=in:d=1,afade=t=out:st=${Math.max(0, b.dur - 1.2).toFixed(2)}:d=1.2,volume=${vol},adelay=${Math.round(b.da * 1000)}|${Math.round(b.da * 1000)}[m${k}]`);
  const mix = `${parti.join(';')};${brani.map((_, k) => `[m${k}]`).join('')}amix=inputs=${brani.length}:normalize=0:duration=longest,apad[mus];`
    + `[0:a]asplit[voce][chiave];[mus][chiave]sidechaincompress=threshold=0.02:ratio=10:attack=30:release=500[duck];`
    + `[voce][duck]amix=inputs=2:normalize=0:duration=first,loudnorm=I=-14:TP=-1:LRA=11[a]`;
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', voce, ...ins, '-filter_complex', mix, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', finale]);
} else {
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', voce, '-af', 'loudnorm=I=-14:TP=-1:LRA=11', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', finale]);
}
log(`video: ${finale} (${Math.round((Date.now() - t0) / 1000)} s)`);

// ---------- progetto DaVinci ----------
const fr = (s) => Math.round(s * FPS);
const tt = (s) => `${fr(s)}/${FPS}s`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const url = (p) => `file:///${p.replace(/\\/g, '/').split('/').map((x, i) => (i === 0 ? x : encodeURIComponent(x))).join('/')}`;
const assets = new Map();
const asset = (id) => {
  if (!assets.has(id)) {
    const s = sorgente(id);
    assets.set(id, { ref: `a${assets.size + 1}`, xml: `    <asset id="a${assets.size + 1}" name="${esc(s.file)}" start="0s" duration="${tt(s.durata)}" hasVideo="1" hasAudio="${s.audio ? 1 : 0}" format="r1" audioSources="1" audioChannels="2" audioRate="48000">\n      <media-rep kind="original-media" src="${esc(url(s.percorso))}"/>\n    </asset>` });
  }
  return assets.get(id).ref;
};
let ora = 0;
const spine = pezzi.map((p) => {
  const ref = asset(p.v.id);
  const marc = capitoli.filter((c) => c.nome && Math.abs(c.t - ora) < 0.02).map((c) => `\n        <marker start="${tt(p.v.t0)}" duration="1/${FPS}s" value="${esc(c.nome)}"/>`).join('');
  const voceAltrove = p.a && p.a.id !== p.v.id ? `\n        <asset-clip ref="${asset(p.a.id)}" lane="-1" offset="${tt(p.v.t0)}" start="${tt(p.a.t0)}" duration="${tt(p.dur)}" srcEnable="audio"/>` : '';
  const conAudio = p.a && p.a.id === p.v.id;
  const x = `      <asset-clip ref="${ref}" offset="${ora === 0 ? '0s' : `${fr(ora)}/${FPS}s`}" start="${tt(p.v.t0)}" duration="${tt(p.dur)}" srcEnable="${conAudio ? 'all' : 'video'}" name="${esc(p.v.id)}">${marc}${voceAltrove}${marc || voceAltrove ? '\n      ' : ''}</asset-clip>`;
  ora += p.dur;
  return x;
});
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.9">
  <resources>
    <format id="r1" name="FFVideoFormat${IN_4K ? '3840x2160p30' : '1080p30'}" frameDuration="1/${FPS}s" width="${W}" height="${H}"/>
${[...assets.values()].map((a) => a.xml).join('\n')}
  </resources>
  <library>
    <event name="${esc(nome)}">
      <project name="${esc(nome)}">
        <sequence format="r1" duration="${tt(ora)}" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k">
          <spine>
${spine.join('\n')}
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>
`;
const progetto = path.join(OUT, `${nome} - DaVinci.fcpxml`);
fs.writeFileSync(progetto, xml);
log(`DaVinci: ${progetto} (File → Importa → Timeline; titoli e musica sono solo nel video)`);
