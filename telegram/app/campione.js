// Decisioni pure del campionamento sul telefono. Nessun DOM, così i test le leggono.

export const AUDIO_MAX = 8 * 1024 * 1024;
export const SOGLIA_SALTO = 0.18;

/** Nero piatto: il decoder non ha dato un fotogramma (tipico HEVC prima del frame vero). */
export function quadroVuoto(media, varianza) {
  return media < 12 && varianza < 40;
}

export function statLuma(data) {
  let sum = 0;
  let sum2 = 0;
  let n = 0;
  for (let p = 0; p + 2 < data.length; p += 16) {
    const y = data[p] + data[p + 1] + data[p + 2];
    sum += y;
    sum2 += y * y;
    n += 1;
  }
  const media = n ? sum / n : 0;
  const varianza = n ? Math.max(0, sum2 / n - media * media) : 0;
  return { media, varianza, vuoto: quadroVuoto(media, varianza) };
}

export function contaSalti(valori, soglia = SOGLIA_SALTO) {
  let n = 0;
  for (let i = 1; i < (valori || []).length; i++) {
    const a = Number(valori[i - 1]) || 0;
    const b = Number(valori[i]) || 0;
    if (Math.abs(b - a) / Math.max(1, Math.abs(a)) >= soglia) n += 1;
  }
  return n;
}

export function messaggioDecodifica() {
  return 'Questo video non si decodifica sul telefono (spesso i MOV della fotocamera, HEVC). Esportalo in H.264 e riprova.';
}

export function èErroreRete(e) {
  const nome = String(e?.name || '');
  const m = String(e?.message || e || '');
  if (nome === 'TypeError' || nome === 'AbortError' || nome === 'TimeoutError') return true;
  return /failed to fetch|load failed|networkerror|network error|aborted|abort|timed out|timeout|the network connection was lost|connessione interrotta/i.test(m);
}

export function bozzaNuova(bozza, prima) {
  const q = Number(bozza?.quando);
  return Boolean(bozza?.haTesto && Number.isFinite(q) && q > Number(prima || 0));
}

/** Il service worker non ricarica la pagina mentre c’è un’analisi o un invio in corso. */
export function ricaricoBloccato(studio, faseCarica) {
  return Boolean(studio && (studio.occupato || studio.invio)) || faseCarica === 'invio';
}
