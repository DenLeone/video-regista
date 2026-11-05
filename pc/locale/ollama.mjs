// Richiesta a un'AI locale (Ollama) per i passi del flusso locale: una sola implementazione per pulizia, immagini e regia.
//   import { chiediLocale } from './ollama.mjs';
//   const testo = await chiediLocale(prompt, { modello: 'qwen3.8:27b', pensa: 'low', temperatura: 0.1 });
// - in streaming: senza, fetch di Node smette di aspettare la risposta dopo 300 s (headersTimeout)
// - contesto calcolato sulla lunghezza del prompt (più piccolo = meno memoria sulla scheda video)
// - pensa: livello di ragionamento (qwen3.8: low | medium | xhigh; "no" = spento). Variabile LOCALE_PENSA per tutti.
// - se il modello ragiona fino a finire lo spazio e non scrive la risposta, si riprova senza ragionamento
// Restituisce il testo e scrive in console il tempo e i token.
const OLLAMA = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';

async function una(prompt, { modello, pensa, temperatura, contesto }) {
  const r = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: modello, stream: true, format: 'json', ...(pensa ? { think: pensa === 'no' ? false : pensa } : {}),
      messages: [{ role: 'user', content: prompt }], options: { temperature: temperatura, num_ctx: contesto },
    }),
    signal: AbortSignal.timeout(40 * 60 * 1000),
  });
  if (!r.ok) throw new Error(`Ollama ${r.status}: ${(await r.text()).slice(0, 200)}`);
  let testo = '', resto = '', fine = null;
  const dec = new TextDecoder();
  const riga = (l) => { if (!l.trim()) return; const j = JSON.parse(l); testo += j.message?.content || ''; if (j.done) fine = j; };
  for await (const pezzo of r.body) {
    resto += dec.decode(pezzo, { stream: true });
    const righe = resto.split('\n');
    resto = righe.pop();
    righe.forEach(riga);
  }
  riga(resto);
  return { testo, fine };
}

export async function chiediLocale(prompt, { modello = 'qwen3.8:27b', pensa = process.env.LOCALE_PENSA || 'low', temperatura = 0.1 } = {}) {
  // ~2,6 caratteri per token con i numeri delle parole (misurato: 6451 token per un prompt di 3 minuti di parlato);
  // + 7k per ragionamento e risposta (meno contesto = più modello sulla scheda video). Se la risposta esce troncata
  // (contesto pieno) si riprova con il doppio.
  let contesto = Math.max(8192, Math.ceil((prompt.length / 2.6 + 7168) / 2048) * 2048);
  const t0 = Date.now();
  let { testo, fine } = await una(prompt, { modello, pensa, temperatura, contesto });
  if (fine?.done_reason === 'length' || (testo.includes('{') && !testo.trim().endsWith('}'))) {
    contesto *= 2;
    console.log(`[ollama] ${modello}: risposta troncata (contesto pieno), riprovo con contesto ${contesto}`);
    ({ testo, fine } = await una(prompt, { modello, pensa, temperatura, contesto }));
  }
  if (!testo.includes('{') && pensa !== 'no') {
    console.log(`[ollama] ${modello}: risposta vuota, riprovo senza ragionamento`);
    ({ testo, fine } = await una(prompt, { modello, pensa: 'no', temperatura, contesto }));
  }
  const s = ((Date.now() - t0) / 1000).toFixed(0);
  const tok = fine ? `, ${fine.prompt_eval_count ?? '?'} token letti, ${fine.eval_count ?? '?'} scritti (${fine.eval_duration ? (fine.eval_count / (fine.eval_duration / 1e9)).toFixed(1) : '?'} token/s)` : '';
  console.log(`[ollama] ${modello} (ragionamento ${pensa}, contesto ${contesto}) in ${s} s${tok}`);
  return testo;
}
