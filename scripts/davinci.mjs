// Progetto per DaVinci Resolve (FCPXML 1.9) del montaggio appena fatto: le clip ORIGINALI di Denis,
// già tagliate e in ordine sulla timeline, con la voce, i B-roll e gli inserti sopra. Denis lo apre
// in DaVinci (File → Importa → Timeline) e ritocca a mano invece di rilanciare (29/10, dopo il reel
// di Palmier: "fai il progetto per DaVinci"). Si scrive in un attimo: niente render in più.
// Le grafiche (scritte, schede, icone) restano nel video finito, messo in cima come riferimento spento.
// I percorsi puntano a Google Drive sul PC di Denis (DRIVE_LOCALE, di base "G:/Il mio Drive"); se
// non combaciano, in DaVinci basta "Ricollega" scegliendo la cartella del video.

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const url = (base, parti) => `file:///${[base.replace(/\\/g, '/').replace(/\/+$/, ''), ...parti].map((p, i) => (i === 0 ? encodeURI(p) : encodeURIComponent(p))).join('/')}`;

/**
 * @param {object} o
 * @param {object} o.piano      piano dopo il taglio (clip con `sorgente`/`daSorgente`, inserti con `sorgente`/`daSorgente`)
 * @param {object[]} o.sorgenti analisi.sorgenti ({ id, originale, durata, tipo, haAudio, orient })
 * @param {object[]} o.immagini analisi.immagini ({ id, file, originale? })
 * @param {string} o.nome       nome del video (cartella)
 * @param {string} o.cartella   cartella su Drive con gli originali (es. "02 · Fatti/<nome>")
 * @param {string} [o.finale]   nome del video finito nella stessa cartella (traccia di riferimento)
 * @param {number} [o.durataFinale]
 * @param {string} [o.base]     Drive sul PC
 */
export function progettoDaVinci({ piano, sorgenti, immagini = [], nome, cartella, finale, durataFinale, base = process.env.DRIVE_LOCALE || 'G:/Il mio Drive' }) {
  const fps = piano.fps && piano.fps >= 10 && piano.fps <= 60 ? Math.round(piano.fps) : 30;
  const fr = (s) => Math.max(0, Math.round(s * fps));
  const t = (s) => `${fr(s)}/${fps}s`;
  const perId = new Map(sorgenti.map((s) => [s.id, s]));
  const nomeFile = (p) => String(p).split(/[\\/]/).pop();
  const pezziCartella = cartella.split('/');
  const assets = new Map(); // chiave → { id, xml }
  let n = 0;
  const asset = (chiave, file, durata, video, audio) => {
    if (!assets.has(chiave)) {
      const id = `a${++n}`;
      assets.set(chiave, { id, xml: `    <asset id="${id}" name="${esc(file)}" start="0s" duration="${durata > 0 ? t(durata) : '0s'}" hasVideo="${video ? 1 : 0}" hasAudio="${audio ? 1 : 0}"${video ? ' format="r1"' : ''}${audio ? ' audioSources="1" audioChannels="2" audioRate="48000"' : ''}>\n      <media-rep kind="original-media" src="${esc(url(base, [...pezziCartella, file]))}"/>\n    </asset>` });
    }
    return assets.get(chiave).id;
  };
  const avvisi = [];
  const spine = [];
  let ora = 0; // fotogrammi sulla timeline
  for (const c of piano.clips) {
    const dur = c.end - c.start;
    const s = perId.get(c.sorgente);
    if (!s || s.stock) { avvisi.push(`${c.stock ? 'repertorio' : c.file}: non è tra i tuoi originali, al suo posto uno spazio vuoto`); spine.push(`      <gap offset="${ora}/${fps}s" duration="${t(dur)}" start="0s"/>`); ora += fr(dur); continue; }
    const lento = c.lento > 1 ? c.lento : 1;
    const voceSeparata = c.audio && c.audio.file && !c.audio.file.startsWith(`${s.id}.`);
    const conAudio = !c.muto && s.haAudio && !voceSeparata;
    const id = asset(`s:${s.id}`, nomeFile(s.originale), s.durata, true, s.haAudio);
    const figli = [];
    if (lento > 1) figli.push(`        <timeMap><timept time="0s" value="0s" interp="linear"/><timept time="${t(dur)}" value="${t(dur / lento)}" interp="linear"/></timeMap>`);
    // voce da un'altra sorgente (mic, iPhone): sotto, sulla corsia audio
    if (voceSeparata) {
      const vid = String(c.audio.file).replace(/\.voce\.wav$/i, '');
      const v = perId.get(vid);
      if (v) {
        const aid = asset(`s:${v.id}`, nomeFile(v.originale), v.durata, v.tipo === 'video', true);
        figli.push(`        <asset-clip ref="${aid}" lane="-1" offset="${t(c.daSorgente ?? 0)}" start="${t(c.audio.start)}" duration="${t(dur)}" srcEnable="audio" name="voce ${esc(v.id)}"/>`);
      } else avvisi.push(`voce ${vid} non trovata`);
    }
    // inserto sopra (clip o immagine), sulla corsia 1
    const ins = c.inserto;
    if (ins?.tipo === 'video' && ins.sorgente && perId.get(ins.sorgente)) {
      const si = perId.get(ins.sorgente);
      const iid = asset(`s:${si.id}`, nomeFile(si.originale), si.durata, true, si.haAudio);
      const d = Math.min(dur, (ins.end ?? dur) - (ins.start ?? 0));
      figli.push(`        <asset-clip ref="${iid}" lane="1" offset="${t(c.daSorgente ?? 0)}" start="${t(ins.daSorgente ?? 0)}" duration="${t(d)}" srcEnable="${ins.audio ? 'all' : 'video'}" name="inserto ${esc(si.id)}"/>`);
    } else if (ins?.tipo === 'immagine') {
      const im = immagini.find((x) => x.file === ins.file);
      if (im?.originale) {
        const iid = asset(`i:${im.id}`, im.originale, 0, true, false);
        figli.push(`        <video ref="${iid}" lane="1" offset="${t(c.daSorgente ?? 0)}" start="0s" duration="${t(dur)}" name="${esc(im.id)}"/>`);
      }
    }
    spine.push(`      <asset-clip ref="${id}" offset="${ora}/${fps}s" start="${t(c.daSorgente ?? 0)}" duration="${t(dur)}" srcEnable="${conAudio ? 'all' : 'video'}" name="${esc(s.id)}">${figli.length ? `\n${figli.join('\n')}\n      ` : ''}</asset-clip>`);
    ora += fr(dur);
  }
  // il video finito (con le grafiche) in cima, spento: per confrontare e, se serve, accenderlo
  if (finale && spine.length) {
    const fid = asset('finale', finale, durataFinale || ora / fps, true, true);
    const tag = spine[0].match(/^\s*<([\w-]+)/)[1];
    const rif = `\n        <asset-clip ref="${fid}" lane="2" offset="${spine[0].match(/ start="([^"]+)"/)[1]}" start="0s" duration="${ora}/${fps}s" srcEnable="video" enabled="0" name="video finito (riferimento)"/>\n      `;
    spine[0] = spine[0].endsWith('/>') ? `${spine[0].slice(0, -2)}>${rif}</${tag}>` : spine[0].replace(new RegExp(`</${tag}>$`), `${rif}</${tag}>`);
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.9">
  <resources>
    <format id="r1" name="FFVideoFormat1080x1920p${fps}" frameDuration="1/${fps}s" width="1080" height="1920"/>
${[...assets.values()].map((a) => a.xml).join('\n')}
  </resources>
  <library>
    <event name="${esc(nome)}">
      <project name="${esc(nome)}">
        <sequence format="r1" duration="${ora}/${fps}s" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k">
          <spine>
${spine.map((x) => `    ${x}`).join('\n')}
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>
`;
  return { xml, avvisi };
}
