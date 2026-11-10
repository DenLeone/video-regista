// Conti per dividere un video in pezzi (render su più macchine, 10/11). Solo logica: nessuna dipendenza.
// I fotogrammi si contano come fa Remotion nelle composizioni (src/Root.tsx e src/comune.tsx):
// durata = round(secondi totali × fps), ogni clip dura round(secondi × fps).

// i fotogrammi [da, a] di ogni pezzo: tutti lunghi uguali, l'ultimo prende il resto
export function dividi(durata, pezzi) {
  const n = Math.max(1, Math.min(pezzi, Math.floor(durata / 30) || 1));
  const passo = Math.ceil(durata / n);
  const out = [];
  for (let da = 0; da < durata; da += passo) out.push([da, Math.min(durata, da + passo) - 1]);
  return { passo, intervalli: out };
}

// dove cade ogni clip sulla timeline, in fotogrammi. I secondi sono quelli che il taglio scrive nel
// piano (tre decimali), così i conti tornano uguali prima e dopo aver tagliato.
export function fotogrammiClip(clips, fps) {
  let t = 0, secondi = 0;
  const clip = clips.map((c) => {
    const d = +(c.end - c.start).toFixed(3);
    const len = Math.round(d * fps);
    const p = { da: t, a: t + len - 1 };
    t += len;
    secondi += d;
    return p;
  });
  return { durata: Math.max(30, Math.round(secondi * fps)), clip };
}

// le clip che servono a un tratto [da, a]: quelle che lo toccano, più una per parte (transizioni che
// mostrano la clip prima o dopo, arrotondamenti)
export function clipDelTratto(posizioni, da, a, margine = 1) {
  const dentro = posizioni.map((p, i) => (p.a >= da && p.da <= a ? i : -1)).filter((i) => i >= 0);
  const out = new Set();
  if (!dentro.length) return out;
  for (let i = Math.max(0, dentro[0] - margine); i <= Math.min(posizioni.length - 1, dentro.at(-1) + margine); i++) out.add(i);
  return out;
}

// le inquadrature tra cui si sceglie la copertina: fino a 6, sparse sul video (stessa regola per il
// giro normale e per quello che riunisce i pezzi, che taglia solo queste)
export function sceltePerCopertina(candidati) {
  return candidati.length <= 6 ? candidati : Array.from({ length: 6 }, (_, i) => candidati[Math.round((i * (candidati.length - 1)) / 5)]);
}
