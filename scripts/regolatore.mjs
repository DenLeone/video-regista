// Regolatore anti-caos (Ultra, 11/11): quello che l'AI esagera lo toglie lo script, così il video
// resta pulito anche quando la regia non rispetta le regole dello stile.
// - bianco e nero "uno": resta solo il primo momento breve (≤ 4 s), gli altri tornano a colori
// - inserti "laterale": al massimo uno ogni 10 s, e una scheda non dura più di ~4 s di fila

export const DISTANZA_INSERTI = 10;
export const DURATA_MAX_SCHEDA = 4;
const MAX_BN = 4;

const durata = (c) => Math.max(0, (c.end ?? 0) - (c.start ?? 0));

export function regolaStile(piano, g) {
  const tolti = { bn: 0, inserti: 0 };
  if (!g || !piano?.clips) return tolti;
  if (g.biancoNero === 'uno') {
    let tenuto = false;
    for (const c of piano.clips) {
      if (!c.bn) continue;
      if (!tenuto && durata(c) <= MAX_BN) { tenuto = true; continue; }
      delete c.bn; tolti.bn++;
    }
  }
  if (g.cornice === 'laterale') {
    let t = 0;
    let ultimo = -Infinity;   // inizio dell'ultima scheda tenuta
    let fineGruppo = -1;      // fine dell'ultimo pezzo tenuto (per i pezzi "continua")
    for (const c of piano.clips) {
      const d = durata(c);
      if (c.inserto) {
        const segue = c.inserto.continua && Math.abs(fineGruppo - t) < 0.05;
        const tieni = segue ? t + d - ultimo <= DURATA_MAX_SCHEDA + 0.5 : t - ultimo >= DISTANZA_INSERTI;
        if (tieni) { if (!segue) ultimo = t; fineGruppo = t + d; }
        else { delete c.inserto; tolti.inserti++; }
      }
      t += d;
    }
  }
  return tolti;
}
