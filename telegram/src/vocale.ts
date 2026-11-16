// 🎙️ Montaggio a voce (16/11, Denis): un vocale al bot («monta Stuzzicadenti in Ultra senza tagli, musica Sly and
// Nimble») → Groq lo trascrive (Whisper) e lo capisce (Llama), tutto gratis → riepilogo con ▶️ Parti.
// Se il vocale non è un comando resta quello di prima: materiale per il montaggio (la voce del video).

export type Comando = {
  azione: 'monta' | 'correggi' | 'youtube' | 'netflix' | 'tre_reel' | 'nessuna';
  cartella?: string; stile?: string; senza_tagli?: boolean; musica?: string; durata?: string; note?: string; correzione?: string;
};

const GROQ = 'https://api.groq.com/openai/v1';

// il file del vocale da Telegram (Bot API: fino a 20 MB, un vocale pesa pochi KB) e la trascrizione
export async function trascriviVocale(fetchFn: typeof fetch, groqKey: string, botToken: string, fileId: string): Promise<string | undefined> {
  const f = (await (await fetchFn(`https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`)).json()) as { result?: { file_path?: string } };
  if (!f.result?.file_path) return undefined;
  const audio = await (await fetchFn(`https://api.telegram.org/file/bot${botToken}/${f.result.file_path}`)).arrayBuffer();
  const form = new FormData();
  form.append('file', new Blob([audio], { type: 'audio/ogg' }), 'vocale.ogg');
  form.append('model', 'whisper-large-v3-turbo');
  form.append('language', 'it');
  form.append('response_format', 'json');
  const r = await fetchFn(`${GROQ}/audio/transcriptions`, { method: 'POST', headers: { authorization: `Bearer ${groqKey}` }, body: form, signal: AbortSignal.timeout(30_000) });
  if (!r.ok) return undefined;
  return String(((await r.json()) as { text?: string }).text || '').trim() || undefined;
}

export const promptVocale = (testo: string, cartelle: string[], stili: string[]) => `Sei il bot "Regista" di Denis, creator italiano. Denis ti ha mandato un vocale, trascritto così:
«${testo}»

Capisci se è un COMANDO per il bot e quale. Azioni:
- "monta": montare un video nuovo da una cartella di "01 · Da editare" (es. «monta Stuzzicadenti in Ultra»).
- "correggi": correggere/rifare un video già montato (es. «nel video Stuzzicadenti togli la musica»): "correzione" = cosa cambiare, a parole di Denis.
- "youtube": documentario YouTube 16:9 con capitoli e immagini d'archivio da una cartella.
- "netflix": documentario 16:9 stile Netflix (solo titoli e parole rosse) da una cartella.
- "tre_reel": tagliare i reel migliori da un video lungo («fammi i 3 reel di …»).
- "nessuna": non è un comando (Denis parla d'altro, o è la voce per un video).

Cartelle in 01 · Da editare: ${cartelle.length ? cartelle.join(' | ') : '(elenco non disponibile)'}
Stili: ${stili.join(' | ')}
"cartella" = il nome della cartella più simile a quello che dice Denis (scritto esattamente come nell'elenco; se non c'è, come lo dice lui).
"stile" = uno degli stili, solo se lo nomina. "senza_tagli" = true se dice «senza tagli», «non tagliare», «intero».
"musica" = il nome del brano se lo nomina. "durata" = es. "30 s" se la dice. "note" = altre indicazioni per il montaggio, brevi.
Rispondi SOLO con JSON: {"azione":"…","cartella":"…","stile":"…","senza_tagli":false,"musica":"…","durata":"…","note":"…","correzione":"…"}`;

export async function capisciVocale(fetchFn: typeof fetch, groqKey: string, testo: string, cartelle: string[], stili: string[]): Promise<Comando> {
  for (const modello of ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant']) {
    try {
      const r = await fetchFn(`${GROQ}/chat/completions`, {
        method: 'POST', headers: { authorization: `Bearer ${groqKey}`, 'content-type': 'application/json' }, signal: AbortSignal.timeout(25_000),
        body: JSON.stringify({ model: modello, temperature: 0.1, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: promptVocale(testo, cartelle.slice(0, 80), stili) }] }),
      });
      if (!r.ok) continue;
      const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
      return pulisciComando(JSON.parse(j.choices?.[0]?.message?.content || '{}'), stili);
    } catch { /* il prossimo modello */ }
  }
  return { azione: 'nessuna' };
}

const AZIONI = new Set(['monta', 'correggi', 'youtube', 'netflix', 'tre_reel']);
const t = (x: unknown, n: number) => (typeof x === 'string' ? x.trim().slice(0, n) : '') || undefined;
export function pulisciComando(c: Partial<Record<keyof Comando, unknown>>, stili: string[]): Comando {
  const azione = AZIONI.has(String(c.azione)) ? (c.azione as Comando['azione']) : 'nessuna';
  const cartella = t(c.cartella, 80);
  if (azione === 'nessuna' || !cartella) return { azione: 'nessuna' };
  const stileDetto = t(c.stile, 40)?.toLowerCase();
  const stile = stileDetto ? stili.find((s) => s.toLowerCase() === stileDetto) || stili.find((s) => s.toLowerCase().startsWith(stileDetto)) : undefined;
  const correzione = t(c.correzione, 1500);
  if (azione === 'correggi' && !correzione) return { azione: 'nessuna' };
  return { azione, cartella, ...(stile ? { stile } : {}), ...(c.senza_tagli === true ? { senza_tagli: true } : {}),
    ...(t(c.musica, 60) ? { musica: t(c.musica, 60) } : {}), ...(t(c.durata, 20) ? { durata: t(c.durata, 20) } : {}),
    ...(t(c.note, 400) ? { note: t(c.note, 400) } : {}), ...(correzione ? { correzione } : {}) };
}

// il brief per il Regista, come quello che scrive il bot dai tasti
export const briefVocale = (c: Comando, stileBase: string) => [
  `Stile: ${c.stile || stileBase}`, c.durata ? `Durata: ${c.durata}` : '', c.musica ? `Musica: ${c.musica}` : '', c.note ? `Note: ${c.note}` : '', c.senza_tagli ? 'senza tagli' : '',
].filter(Boolean).join('. ');

const NOMI: Record<Comando['azione'], string> = { monta: '🎬 Monto', correggi: '✏️ Correggo', youtube: '🎬 Documentario YouTube di', netflix: '🎬 Netflix 16:9 di', tre_reel: '✂️ 3 reel da', nessuna: '' };
export function riepilogoVocale(c: Comando, stileBase: string, esc: (s: string) => string): string {
  const righe = [`${NOMI[c.azione]} <b>${esc(c.cartella || '')}</b>`];
  if (c.azione === 'monta') {
    righe.push(`🎨 Stile: <b>${esc(c.stile || stileBase)}</b>${c.stile ? '' : ' (quello di sempre)'}`);
    if (c.senza_tagli) righe.push('✂️ Senza tagli');
    if (c.musica) righe.push(`🎵 Musica: ${esc(c.musica)}`);
    if (c.durata) righe.push(`⏱ Durata: ${esc(c.durata)}`);
    if (c.note) righe.push(`📝 ${esc(c.note)}`);
  }
  if (c.azione === 'correggi') righe.push(`📝 ${esc(c.correzione || '')}`);
  if (c.azione === 'tre_reel') righe.push('🎨 Uno in Cinematico, uno in Kal, uno in Ultra');
  return righe.join('\n');
}
