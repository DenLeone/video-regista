// Chiamate corte a Gemini (e, se c'è la chiave HTTP, a Claude). Nessun log del testo.
import { leggiJsonModello } from './stile-studio';

export type EsitoStile = { ok: true; risposta: string; stile: string } | { ok: false; errore: string };

const ILLEGGIBILE = 'L’AI non ha restituito uno stile leggibile. Riprova.';

export function erroreModello(stato: number, riserva: boolean): string {
  if (stato === 429) return 'L’AI è al limite per un minuto. Riprova tra poco.';
  if (stato === 401 || stato === 403) return 'La chiave dell’AI non è accettata.';
  if (stato === -1) return 'Gemini ci ha messo troppo, anche col modello veloce. Riprova tra qualche minuto.';
  if (stato === 0) return 'Il Worker non riesce a raggiungere Gemini (rete). Riprova tra poco.';
  if (stato === 400 || stato === 404) return `L’AI ha rifiutato la richiesta (errore ${stato}): modello o immagini non accettati.`;
  if (riserva) return 'Gemini non ha risposto. Ho provato anche Claude, senza risultato.';
  return 'Gemini non ha risposto e sul Worker non c’è una chiave Claude HTTP. Riprova tra un momento.';
}

// stato -1 = nessuna risposta entro `ms`, 0 = rete
async function postJson(fetchFn: typeof fetch, url: string, headers: Record<string, string>, body: unknown, ms = 40_000): Promise<{ ok: true; testo: string } | { ok: false; stato: number }> {
  try {
    const r = await fetchFn(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(ms),
    });
    if (!r.ok) {
      // nei log di Cloudflare (Workers Logs): senza, un 4xx/5xx dell'AI non lasciava traccia. Solo il
      // codice, mai il testo: può contenere la trascrizione
      console.error(`stile: ${new URL(url).host} ha risposto ${r.status}`);
      return { ok: false, stato: r.status };
    }
    const j = await r.json() as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      content?: { text?: string }[];
    };
    const gemini = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
    const claude = (j.content || []).map((p) => p.text || '').join('');
    return { ok: true, testo: gemini || claude };
  } catch (e) {
    const lento = (e as Error).name === 'TimeoutError' || (e as Error).name === 'AbortError';
    console.error(`stile: ${new URL(url).host} ${lento ? `nessuna risposta in ${ms / 1000} s` : 'non raggiungibile'} (${(e as Error).name})`);
    return { ok: false, stato: lento ? -1 : 0 };
  }
}

function esitoDaTesto(testo: string): EsitoStile {
  const letto = leggiJsonModello(testo);
  if (!letto) console.error(`stile: risposta dell'AI illeggibile (${testo.length} caratteri)`);
  return letto ? { ok: true, ...letto } : { ok: false, errore: ILLEGGIBILE };
}

// Prima il Flash con un ragionamento corto (24/10: col ragionamento libero, 6 immagini superavano
// anche 55 s); se rifiuta l'impostazione (400) lo stesso senza. Se è lento, sovraccarico o al limite,
// il Flash Lite, più svelto. Dove si arriva al massimo: ~40 + 35 s, sotto i 2 minuti dell'app
const TENTATIVI_GEMINI = [
  { modello: 'gemini-flash-latest', ragiona: true, ms: 40_000 },
  { modello: 'gemini-flash-latest', ragiona: false, ms: 40_000, soloDopo400: true },
  { modello: 'gemini-flash-lite-latest', ragiona: false, ms: 35_000 },
];

async function gemini(fetchFn: typeof fetch, chiave: string, prompt: string, foto: string[]): Promise<EsitoStile | { ok: false; stato: number }> {
  const parts: unknown[] = [{ text: prompt }, ...foto.map((data) => ({ inline_data: { mime_type: 'image/jpeg', data } }))];
  let ultimo = 0;
  for (const t of TENTATIVI_GEMINI) {
    if (t.soloDopo400 && ultimo !== 400) continue;
    if (!t.soloDopo400 && ultimo === 400) continue; // il Lite non risolve un rifiuto
    if (ultimo === 401 || ultimo === 403) break;
    const body = {
      contents: [{ role: 'user', parts }],
      // maxOutputTokens largo: il ragionamento dei Flash lo consuma, con 2048 la risposta usciva tagliata
      generationConfig: {
        responseMimeType: 'application/json', temperature: 0.4, maxOutputTokens: 8192,
        ...(t.ragiona ? { thinkingConfig: { thinkingBudget: 512 } } : {}),
      },
    };
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${t.modello}:generateContent`;
    const r = await postJson(fetchFn, url, { 'x-goog-api-key': chiave }, body, t.ms);
    if (r.ok) return esitoDaTesto(r.testo);
    ultimo = r.stato;
    console.error(`stile: ${t.modello}${t.ragiona ? ' (ragionamento corto)' : ''} non riuscito (${r.stato})`);
  }
  return { ok: false, stato: ultimo };
}

async function claude(fetchFn: typeof fetch, chiave: string, prompt: string, foto: string[]): Promise<EsitoStile | { ok: false; stato: number }> {
  const content: unknown[] = [{ type: 'text', text: prompt }];
  for (const data of foto) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } });
  const r = await postJson(fetchFn, 'https://api.anthropic.com/v1/messages', {
    'x-api-key': chiave,
    'anthropic-version': '2023-06-01',
  }, { model: 'claude-haiku-4-5', max_tokens: 2048, messages: [{ role: 'user', content }] });
  if (!r.ok) return { ok: false, stato: r.stato };
  return esitoDaTesto(r.testo);
}

export async function chiediStile(c: {
  fetch: typeof fetch;
  geminiKey?: string;
  anthropicKey?: string;
  prompt: string;
  foto: string[];
}): Promise<EsitoStile> {
  if (!c.geminiKey && !c.anthropicKey) {
    return { ok: false, errore: 'Manca GEMINI_API_KEY sul Worker. L’analisi dello stile non parte.' };
  }
  if (c.geminiKey) {
    const g = await gemini(c.fetch, c.geminiKey, c.prompt, c.foto);
    if (g.ok) return g;
    if (c.anthropicKey) {
      const a = await claude(c.fetch, c.anthropicKey, c.prompt, c.foto);
      if (a.ok) return a;
      if ('errore' in a) return a;
      return { ok: false, errore: erroreModello(a.stato, true) };
    }
    if ('errore' in g) return g;
    return { ok: false, errore: erroreModello(g.stato, false) };
  }
  const a = await claude(c.fetch, c.anthropicKey || '', c.prompt, c.foto);
  if (a.ok) return a;
  if ('errore' in a) return a;
  return { ok: false, errore: erroreModello(a.stato, false) };
}

/** Whisper solo sul pezzo corto. Se fallisce, si va avanti senza voce e senza log. */
export async function trascriviBreve(fetchFn: typeof fetch, chiave: string | undefined, wav: Uint8Array | undefined): Promise<string | undefined> {
  if (!chiave || !wav || wav.byteLength < 1000 || wav.byteLength > 1_500_000) return undefined;
  try {
    const form = new FormData();
    const pezzo = new Uint8Array(wav.byteLength);
    pezzo.set(wav);
    form.append('file', new Blob([pezzo.buffer], { type: 'audio/wav' }), 'clip.wav');
    form.append('model', 'whisper-large-v3-turbo');
    form.append('language', 'it');
    form.append('response_format', 'json');
    const r = await fetchFn('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { authorization: `Bearer ${chiave}` },
      body: form,
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) return undefined;
    const j = await r.json() as { text?: string };
    const t = String(j.text || '').trim();
    return t ? t.slice(0, 1500) : undefined;
  } catch {
    return undefined;
  }
}
