// Decide se un giro può riusare trascrizione e sync già salvati in _regista/materiale.json.
// Niente ffmpeg e niente rete: solo il confronto tra i file di adesso e la cache.

export function improntaMateriale(sorgenti) {
  return sorgenti.map((s) => `${s.id}:${s.byte || 0}`).sort().join('|');
}

// Cache senza `byte` (giri precedenti): si riusa solo per correzione e solo render,
// che partono dallo stesso montaggio. Un file sostituito con lo stesso nome non deve
// tenere la trascrizione vecchia in un montaggio nuovo.
export function cacheSorgente(cache, s, { correzione = false, soloRender = false } = {}) {
  const lista = cache?.sorgenti || cache?.video || [];
  const c = lista.find((x) => x.id === s.id);
  if (!c) return null;
  if (c.byte != null && s.byte != null && c.byte !== s.byte) return null;
  if (c.byte == null && !(correzione || soloRender)) return null;
  return c;
}

export function riusoAnalisiIntera(cache, impronta, modoDiscorso) {
  return Boolean(
    cache?.frasi?.length
    && cache.impronta
    && cache.impronta === impronta
    && cache.modoDiscorso === modoDiscorso,
  );
}

// L'analisi anticipata (prima del tap) non deve sovrascrivere materiale.json di un montaggio vero.
// Si usa solo se i file sul disco sono proprio quelli analizzati.
export function scegliCacheAnalisi(ufficiale, anticipato, bytePerId) {
  const coincide = (cache) => {
    if (!cache?.frasi?.length || !cache.impronta) return false;
    const attesa = [...bytePerId.entries()].map(([id, byte]) => `${id}:${byte}`).sort().join('|');
    return cache.impronta === attesa;
  };
  if (coincide(ufficiale)) return ufficiale;
  if (coincide(anticipato)) return anticipato;
  return ufficiale || anticipato || null;
}
