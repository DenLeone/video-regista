// Stile Beat (Denis, 29/10, 6 esempi in Stili/Beat studiati il 29/10): video brevi di prodotti, solo
// musica. Nessuna regia dell'AI: tutto si decide dal brano e dal movimento delle riprese.
// - il brano dà la griglia delle battute; il video dura un numero intero di misure (~12–16 s)
// - ogni inquadratura dura 1, 2 o 4 battute (negli esempi: 1 1 2 4 8 battute) e cambia SUL colpo
// - dentro l'inquadratura la velocità cambia: veloce all'inizio e alla fine (la camera "frusta"
//   sul colpo), lenta in mezzo; il pezzo si sceglie dove la ripresa si muove di più e in modo continuo
// - sui tagli, a giro: frustata mossa (la più frequente), griglia 3×3 con lampi, scheda che ruota,
//   zoom a scatto; scintille su un colpo forte a metà; si chiude su un'inquadratura lunga e calma
import { execFileSync } from 'node:child_process';

const PASSO = 0.01; // 10 ms

/** attacchi del brano (forza per finestra di 10 ms) e volume, da `da` per `dur` secondi */
function inviluppoAttacchi(file, da = 0, dur = 0) {
  const buf = execFileSync('ffmpeg', ['-v', 'error', ...(da ? ['-ss', String(da)] : []), ...(dur ? ['-t', String(dur)] : []), '-i', file,
    '-ac', '1', '-ar', '11025', '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  const x = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4));
  const lato = Math.round(11025 * PASSO), n = Math.floor(x.length / lato);
  const rms = new Float32Array(n), att = new Float32Array(n);
  for (let i = 0; i < n; i++) { let q = 0; for (let k = i * lato; k < (i + 1) * lato; k++) q += x[k] * x[k]; rms[i] = Math.sqrt(q / lato); }
  for (let i = 1; i < n; i++) att[i] = Math.max(0, rms[i] - rms[i - 1]);
  return { rms, att, n };
}

/** griglia delle battute: { bpm, beat (s), battute: [s], forza: [0–1 per battuta] } */
export function grigliaBattute(file, { da = 0, dur = 0 } = {}) {
  const { rms, att, n } = inviluppoAttacchi(file, da, dur);
  // tempo: autocorrelazione degli attacchi, con una preferenza per 85–135 BPM (come gli esempi)
  let migliore = -1, lag = 60;
  for (let b = 70; b <= 180; b += 0.25) {
    const l = 60 / b / PASSO;
    let q = 0;
    for (let i = Math.ceil(l); i < n; i++) q += att[i] * att[Math.round(i - l)];
    q *= b >= 85 && b <= 135 ? 1.15 : 1;
    if (q > migliore) { migliore = q; lag = l; }
  }
  // fase: lo spostamento in cui i colpi cadono più forti sulla griglia
  let fase = 0, best = -1;
  for (let o = 0; o < lag; o++) {
    let q = 0;
    for (let t = o; t < n; t += lag) q += att[Math.round(t)] + 0.5 * (att[Math.round(t) + 1] || 0);
    if (q > best) { best = q; fase = o; }
  }
  // rifinitura: per ogni battuta prevista il colpo vero più vicino (±70 ms), poi retta dei minimi
  // quadrati t = fase + k·lag (sul brano di prova a 120 BPM la sola autocorrelazione dava 116,8)
  for (let giro = 0; giro < 3; giro++) {
    const punti = [];
    for (let k = 0, t = fase; t < n - 1; k++, t += lag) {
      const c = Math.round(t);
      let m = -1, dove = -1;
      for (let j = Math.max(1, c - 7); j <= Math.min(n - 1, c + 7); j++) if (att[j] > m) { m = att[j]; dove = j; }
      if (m > 0) punti.push([k, dove, m]);
    }
    if (punti.length < 4) break;
    const soglia = [...punti].map((p) => p[2]).sort((a, b) => a - b)[Math.floor(punti.length * 0.4)];
    const forti = punti.filter((p) => p[2] >= soglia);
    const mk = forti.reduce((a, p) => a + p[0], 0) / forti.length, mt = forti.reduce((a, p) => a + p[1], 0) / forti.length;
    const num = forti.reduce((a, p) => a + (p[0] - mk) * (p[1] - mt), 0), den = forti.reduce((a, p) => a + (p[0] - mk) ** 2, 0);
    if (den <= 0) break;
    lag = num / den;
    fase = mt - lag * mk;
    while (fase - lag >= 0) fase -= lag;
  }
  const battute = [], forza = [];
  for (let t = fase; t < n - 1; t += lag) { battute.push(+(da + t * PASSO).toFixed(3)); forza.push(rms[Math.round(t)] || 0); }
  const max = Math.max(...forza, 1e-6);
  return { bpm: +(60 / (lag * PASSO)).toFixed(1), beat: +(lag * PASSO).toFixed(4), battute, forza: forza.map((f) => +(f / max).toFixed(3)) };
}

/** il tratto del brano da usare: N battute (multiplo di 4, ~obiettivo secondi) dove il brano è più pieno */
export function scegliTratto(griglia, obiettivo = 14) {
  const { beat, battute, forza } = griglia;
  // sempre misure intere, anche quando il brano è più corto dell'obiettivo
  const n = Math.max(8, Math.floor(Math.min(battute.length - 1, Math.round(obiettivo / beat / 4) * 4) / 4) * 4);
  let inizio = 0, meglio = -1;
  for (let i = 0; i + n < battute.length; i += 4) {
    const media = forza.slice(i, i + n).reduce((a, b) => a + b, 0) / n;
    if (media > meglio + 0.02) { meglio = media; inizio = i; }
  }
  return { primo: inizio, n, da: battute[inizio], dur: +(n * beat).toFixed(3) };
}

/** durate delle inquadrature in battute (somma = n): apre e chiude lunghe, in mezzo 1–2 con una pausa da 4 */
export function schemaDurate(n, seme = 1) {
  const motivi = [[2, 1, 1], [2, 2], [1, 1, 2], [1, 1, 1, 1], [2, 1, 1, 2]];
  const out = [4];
  let resto = n - 8, k = seme, pausa = false;
  while (resto > 0) {
    if (!pausa && resto <= n / 2 && resto >= 6) { out.push(4); resto -= 4; pausa = true; continue; }
    const m = motivi[k++ % motivi.length].filter(Boolean);
    for (const d of m) { if (resto <= 0) break; const x = Math.min(d, resto); out.push(x); resto -= x; }
  }
  out.push(4);
  return out;
}

/** movimento globale di una ripresa, un valore ogni 0,1 s (media della differenza tra fotogrammi) */
export function motoRipresa(file, durata) {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-an', '-vf', 'fps=10,scale=64:64:flags=area,format=gray', '-t', String(durata), '-f', 'rawvideo', '-'],
    { maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] });
  const px = 64 * 64, n = Math.floor(raw.length / px), m = new Float32Array(n);
  for (let t = 1; t < n; t++) { let q = 0; for (let k = 0; k < px; k++) q += Math.abs(raw[t * px + k] - raw[(t - 1) * px + k]); m[t] = q / px; }
  m[0] = m[1] || 0;
  return Array.from(m, (v) => +v.toFixed(2));
}

const TRANSIZIONI = ['frustata', 'frustata', 'zoom', 'frustata', 'griglia', 'frustata', 'carta', 'zoom'];

/**
 * il montaggio: per ogni inquadratura la ripresa e il pezzo, la rampa di velocità e la transizione
 * @param {{ riprese: {id,file,durata,fps,moto:number[]}[], griglia, tratto }} o
 */
export function pianoBeat({ riprese, griglia, tratto, seme = 1 }) {
  const durate = schemaDurate(tratto.n, seme);
  const beat = griglia.beat;
  const usati = new Map(); // id → [[da, a]] già presi
  const clips = [];
  let transizione = 0, colpo = tratto.primo;
  durate.forEach((nb, k) => {
    const D = nb * beat;
    const ultimo = k === durate.length - 1;
    // rampa: frusta 2,4× per mezza battuta all'inizio e alla fine (solo sulle inquadrature da 2+ battute)
    const bordo = nb >= 2 ? Math.min(beat * 0.5, D * 0.25) : 0;
    const veloce = 2.4;
    const scegli = (r) => {
      // il rallentatore solo se la ripresa ha fotogrammi in più; le inquadrature da 1 battuta vanno un po' più veloci
      const lento = nb === 1 ? 1.2 : (r.fps || 30) >= 50 ? 0.55 : 0.85;
      const mezzo = D - 2 * bordo;
      const fonte = bordo * veloce * 2 + mezzo * (ultimo ? Math.min(1, lento + 0.2) : lento);
      return { lento, fonte };
    };
    let meglio = null;
    for (const r of riprese) {
      const { lento, fonte } = scegli(r);
      if (r.durata - 1 < fonte) continue;
      const passi = Math.ceil(fonte * 10);
      for (let i = 5; i + passi < r.moto.length - 5; i += 2) {
        const pezzo = r.moto.slice(i, i + passi);
        const media = pezzo.reduce((a, b) => a + b, 0) / passi;
        const varianza = pezzo.reduce((a, b) => a + (b - media) ** 2, 0) / passi;
        // movimento continuo e né fermo né caotico; la chiusura calma; mai la stessa ripresa di fila, poco riuso
        const giaPreso = (usati.get(r.id) || []).some(([a, b]) => i / 10 < b && (i + passi) / 10 > a);
        const diFila = clips[clips.length - 1]?.sorgente === r.id;
        let voto = ultimo ? -Math.abs(media - 3) - Math.sqrt(varianza) * 0.5 : Math.min(media, 14) - Math.sqrt(varianza) * 0.6;
        if (giaPreso) voto -= 50;
        if (diFila) voto -= 8;
        voto -= (usati.get(r.id)?.length || 0) * 2;
        if (!meglio || voto > meglio.voto) meglio = { voto, r, da: i / 10, fonte, lento };
      }
    }
    if (!meglio) return;
    const { r, da, fonte, lento } = meglio;
    usati.set(r.id, [...(usati.get(r.id) || []), [da, da + fonte]]);
    const lentoFinale = ultimo ? Math.min(1, lento + 0.2) : lento;
    clips.push({
      sorgente: r.id, file: r.file, da: +da.toFixed(2), fonte: +fonte.toFixed(3), dur: +D.toFixed(3), battute: nb, colpo,
      rampa: { bordo: +bordo.toFixed(3), veloce, lento: lentoFinale },
      transizione: k === 0 ? 'nessuna' : TRANSIZIONI[transizione++ % TRANSIZIONI.length],
    });
    colpo += nb;
  });
  // scintille sul colpo più forte della seconda metà (una volta)
  const meta = Math.floor(clips.length / 2);
  let scintille = null, f = -1;
  for (const c of clips.slice(meta, -1)) { const v = griglia.forza[c.colpo] || 0; if (v > f) { f = v; scintille = c.colpo; } }
  return { clips, scintille: scintille != null ? +(griglia.battute[scintille] - tratto.da).toFixed(3) : null };
}

/** filtro setpts della rampa: veloce `bordo` s all'inizio e alla fine, lento in mezzo (tempi in uscita) */
export function filtroRampa({ bordo, veloce, lento }, dur) {
  const a = bordo * veloce, mezzo = dur - 2 * bordo, b = a + mezzo * lento;
  // T = tempo nella sorgente dal punto d'ingresso → tempo in uscita
  return `setpts='(if(lt(T,${a.toFixed(4)}),T/${veloce},if(lt(T,${b.toFixed(4)}),${bordo.toFixed(4)}+(T-${a.toFixed(4)})/${lento},${(bordo + mezzo).toFixed(4)}+(T-${b.toFixed(4)})/${veloce})))/TB'`;
}
