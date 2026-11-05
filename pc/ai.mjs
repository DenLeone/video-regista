// Una richiesta di testo all'AI dal PC: prima quella locale (Ollama, gratis), poi Gemini (GEMINI_API_KEY).
// REGISTA_AI=gemini salta la locale; REGISTA_MODELLO sceglie il modello locale (es. gpt-oss:20b).
const OLLAMA = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const MODELLO_LOCALE = process.env.REGISTA_MODELLO || 'qwen2.5:14b';

async function locale(prompt, json) {
  const t = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(3000) }).then((r) => r.json()).catch(() => null);
  if (!t?.models?.some((m) => m.name === MODELLO_LOCALE || m.name.startsWith(MODELLO_LOCALE))) return null;
  const r = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    // in streaming: senza, fetch di Node smette di aspettare la risposta dopo 300 s (headersTimeout)
    // e i modelli grandi (27B in parte nella RAM) non arrivano mai in fondo
    body: JSON.stringify({ model: MODELLO_LOCALE, stream: true, ...(json ? { format: 'json' } : {}), messages: [{ role: 'user', content: prompt }], options: { temperature: 0.5, num_ctx: 32768 } }),
    signal: AbortSignal.timeout(40 * 60 * 1000),
  });
  if (!r.ok) return null;
  let testo = '', resto = '';
  const dec = new TextDecoder();
  for await (const pezzo of r.body) {
    resto += dec.decode(pezzo, { stream: true });
    const righe = resto.split('\n');
    resto = righe.pop();
    for (const riga of righe) if (riga.trim()) testo += JSON.parse(riga).message?.content || '';
  }
  if (resto.trim()) testo += JSON.parse(resto).message?.content || '';
  return testo || null;
}
async function gemini(prompt, json) {
  const chiave = process.env.GEMINI_API_KEY;
  if (!chiave) return null;
  for (const m of ['gemini-flash-latest', 'gemini-flash-lite-latest']) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': chiave },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.6, ...(json ? { responseMimeType: 'application/json' } : {}) } }),
        signal: AbortSignal.timeout(5 * 60 * 1000),
      });
      const j = await r.json();
      const t = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
      if (r.ok && t) return t;
    } catch { /* il prossimo */ }
  }
  return null;
}
export async function chiediAI(prompt, { json = false } = {}) {
  if (process.env.REGISTA_AI !== 'gemini') {
    const t = await locale(prompt, json).catch(() => null);
    if (t) return t;
  }
  return gemini(prompt, json);
}
