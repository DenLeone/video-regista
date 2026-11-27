// Scheda da editor (Denis, 27/11, stile «Elaborato»): per ~2,5 s il video si rimpicciolisce dentro una finestra bianca da programma
// di montaggio (src/schedaEditor.tsx). L'AI dice dove con `scheda_editor` [{frase, dette?}]; qui si calcolano i tempi.
// Al massimo 2, distanti almeno 8 s tra loro, mai nei primi 2 s né negli ultimi 3 s.
export function schedeEditorDa(lista, { inizio, trova = () => null, totale = Infinity, avvisi = [], dur = 2.6, max = 2, nome = 'scheda editor' }) {
  const out = [];
  for (const s of Array.isArray(lista) ? lista : []) {
    const base = s?.frase ? inizio(s.frase) : null;
    if (base == null) { avvisi.push(`${nome}: frase ${s?.frase || '?'} non usata nel montaggio, tolta`); continue; }
    const detta = s.dette ? trova(String(s.dette), base) : null;
    const at = Math.round(Math.max(0, detta ? detta.at - 0.1 : base) * 100) / 100;
    if (at < 2 || at + dur > totale - 3) continue;
    out.push({ at, dur });
  }
  out.sort((a, b) => a.at - b.at);
  const buone = [];
  for (const x of out) if (buone.length < max && (!buone.length || x.at - buone[buone.length - 1].at >= 8)) buone.push(x);
  return buone;
}
