import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scegliCartella } from '../../scripts/scegli-cartella.mjs';
import {
  ATTESE_STILE, TETTO_STILE_MS, azzeraQuoteStile, quotaGiornoDaTesto, quotaStileFinita, ricordaQuotaStile,
} from '../../scripts/studia-stile.mjs';
import {
  DIDASCALIE_MODELLI, GEMINI_TENTATIVI, GEMINI_TIMEOUT_MS, MOTIVO_CREDITO,
  WORK, azzeraQuoteGiorno, chiamaGemini, chiediRegia, quotaGiornoFinita, scriviDidascalie, serveChiaveGratuita,
} from '../../scripts/regista.mjs';

test('lo spazio in fondo non è un\'altra cartella, un nome inesistente non si indovina', () => {
  assert.equal(scegliCartella('Manifestazioni ', ['Manifestazioni']), 'Manifestazioni');
  assert.equal(scegliCartella('manifestazioni', ['Manifestazioni ']), 'Manifestazioni ');
  assert.equal(scegliCartella('Anime', ['Manifestazioni', 'Cinematic Talk']), null);
  assert.equal(scegliCartella('  ', ['Anime']), null);
  assert.equal(scegliCartella('bar', ['Bar', 'BAR']), null);
  assert.equal(scegliCartella('Foo', ['Foo', 'Foo ']), 'Foo');
});

test('la quota del giorno si ricorda e il giro di Gemini ha un solo retry', async () => {
  assert.equal(GEMINI_TENTATIVI, 2);
  assert.equal(GEMINI_TIMEOUT_MS, 90_000);
  assert.equal(DIDASCALIE_MODELLI, 4);
  azzeraQuoteGiorno();
  const prima = globalThis.fetch;
  let chiamate = 0;
  try {
    globalThis.fetch = (async () => {
      chiamate += 1;
      return new Response('{"error":{"message":"Quota exceeded for metric generate_content_free_tier_requests PerDay"}}', { status: 429 });
    }) as typeof fetch;
    const esito = await chiamaGemini('gemini-2.5-flash', '{}', {});
    assert.equal(esito.motivo, 'richieste del giorno finite');
    assert.equal(chiamate, 1);
    assert.equal(quotaGiornoFinita('gemini-2.5-flash'), true);
    const ancora = await chiamaGemini('gemini-2.5-flash', '{}', {});
    assert.equal(ancora.motivo, 'richieste del giorno finite');
    assert.equal(chiamate, 1);
    await chiamaGemini('gemini-2.5-flash-lite', '{}', {});
    assert.equal(chiamate, 2);
  } finally {
    globalThis.fetch = prima;
    azzeraQuoteGiorno();
  }
});

test('un modello oltre il tetto non viene nemmeno chiamato', async () => {
  azzeraQuoteGiorno();
  const prima = globalThis.fetch;
  let chiamate = 0;
  try {
    globalThis.fetch = (async () => { chiamate += 1; return new Response('{}', { status: 200 }); }) as typeof fetch;
    const esito = await chiamaGemini('gemini-2.5-flash', '{}', {}, { scadenza: Date.now() - 5 });
    assert.equal(chiamate, 0);
    assert.equal(esito.motivo, 'tempo massimo del giro finito');
  } finally {
    globalThis.fetch = prima;
    azzeraQuoteGiorno();
  }
});

// 27/11: credito prepagato finito = 429 «prepayment credits are depleted» su tutti i modelli, per ore. Non è un limite
// al minuto: niente attese né altri modelli con quella chiave; la chiave gratuita (un'altra) resta buona
test('credito Gemini finito: si riconosce subito e vale solo per quella chiave', async () => {
  azzeraQuoteGiorno();
  const prima = globalThis.fetch;
  const chiamate: string[] = [];
  try {
    globalThis.fetch = (async (_u: unknown, init?: RequestInit) => {
      const k = (init?.headers as Record<string, string>)['x-goog-api-key'];
      chiamate.push(k);
      if (k === 'paga') return new Response('{"error":{"code":429,"message":"Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing.","status":"RESOURCE_EXHAUSTED"}}', { status: 429 });
      return new Response('{}', { status: 200 });
    }) as typeof fetch;
    const inizio = Date.now();
    const esito = await chiamaGemini('gemini-2.5-flash', '{}', { 'x-goog-api-key': 'paga' });
    assert.equal(esito.motivo, MOTIVO_CREDITO);
    assert.equal(esito.credito, true);
    assert.ok(Date.now() - inizio < 2000, 'non aspetta come per il limite al minuto');
    assert.equal((await chiamaGemini('gemini-2.5-flash-lite', '{}', { 'x-goog-api-key': 'paga' })).motivo, MOTIVO_CREDITO);
    assert.deepEqual(chiamate, ['paga']); // l'altro modello non si chiama nemmeno
    assert.ok((await chiamaGemini('gemini-2.5-flash', '{}', { 'x-goog-api-key': 'gratis' })).risposta, 'la chiave gratuita resta buona');
    // 402 è la stessa cosa
    azzeraQuoteGiorno();
    globalThis.fetch = (async () => new Response('{"error":{"code":402,"message":"Your prepayment credits are depleted."}}', { status: 402 })) as typeof fetch;
    assert.equal((await chiamaGemini('gemini-2.5-flash', '{}', { 'x-goog-api-key': 'paga' })).motivo, MOTIVO_CREDITO);
    // un 429 qualunque («check your plan and billing details») resta un limite al minuto
    azzeraQuoteGiorno();
    globalThis.fetch = (async () => new Response('{"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details.","details":[{"retryDelay":"0s"}]}}', { status: 429 })) as typeof fetch;
    const minuto = await chiamaGemini('gemini-2.5-flash', '{}', { 'x-goog-api-key': 'paga' });
    assert.equal(minuto.motivo, 'limite al minuto');
    assert.equal(minuto.credito, undefined);
  } finally {
    globalThis.fetch = prima;
    azzeraQuoteGiorno();
  }
});

// 27/11: chiave a pagamento senza credito → la regia la fa Gemini con la chiave gratuita (stessi Flash), non Claude.
// PATH che non esiste: se la prova arrivasse a Claude (o a npm per installarlo), fallisce invece di chiamarlo davvero
test('regia: senza credito sulla chiave a pagamento passa alla gratuita prima di Claude', async () => {
  assert.equal(serveChiaveGratuita(`Gemini: ${MOTIVO_CREDITO} su tutti i modelli (2.5 Flash)`), true);
  assert.equal(serveChiaveGratuita('Gemini: limite al minuto su tutti i modelli (2.5 Flash)'), true);
  assert.equal(serveChiaveGratuita('Gemini: regia inutilizzabile (frasi inesistenti) su tutti i modelli (2.5 Flash)'), false);
  assert.equal(serveChiaveGratuita('Gemini: tempo massimo del giro finito su tutti i modelli (2.5 Flash)'), false);
  azzeraQuoteGiorno();
  const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
  const salva = { fetch: globalThis.fetch, env: { ...env } };
  const chiavi: string[] = [];
  const regia = { titolo: 'Prova', sequenza: [{ frase: 'Ciao a tutti.' }] };
  // la regia si salva in work/regia.json: sulla macchina di GitHub work/ non c'è (27/11: la prova finiva su Claude).
  // import dinamico: il controllo dei tipi del bot gira senza node_modules, quindi senza i tipi di node:fs
  const modFs: string = 'node:fs';
  const fs = await import(modFs);
  const fileRegia = `${WORK}/regia.json`;
  const primaRegia = fs.existsSync(fileRegia) ? fs.readFileSync(fileRegia, 'utf8') : null;
  fs.mkdirSync(WORK, { recursive: true });
  try {
    Object.assign(env, { GEMINI_API_KEY: 'paga', GEMINI_API_KEY_GRATIS: 'gratis', GEMINI_MODELLI: 'gemini-2.5-flash', PATH: '/percorso-che-non-esiste' });
    delete env.REGISTA_AI; delete env.NOTIFY_URL;
    globalThis.fetch = (async (u: unknown, init?: RequestInit) => {
      if (String(u).includes(':countTokens')) return Response.json({ totalTokens: 10 });
      const k = (init?.headers as Record<string, string>)['x-goog-api-key'];
      chiavi.push(k);
      if (k === 'paga') return new Response('{"error":{"code":429,"message":"Your prepayment credits are depleted.","status":"RESOURCE_EXHAUSTED"}}', { status: 429 });
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(regia) }] } }] });
    }) as typeof fetch;
    const r = await chiediRegia('materiale finto', [], null, (x: unknown) => x);
    assert.deepEqual(r.regia, regia);
    assert.deepEqual(chiavi, ['paga', 'gratis']); // una richiesta a pagamento (rifiutata), una gratuita (buona)
  } finally {
    globalThis.fetch = salva.fetch;
    for (const k of Object.keys(env)) if (!(k in salva.env)) delete env[k];
    Object.assign(env, salva.env);
    if (primaRegia === null) fs.rmSync(fileRegia, { force: true }); else fs.writeFileSync(fileRegia, primaRegia);
    azzeraQuoteGiorno();
  }
});

// MacBook, 29/10: con Gemini giù la descrizione deve arrivare lo stesso (Claude, poi le parole del video).
// 16/11: lavoro facile → al massimo quattro modelli sulla chiave GRATUITA; senza chiave gratuita, sulla chiave
// a pagamento solo Flash-Lite (una chiamata)
test('le didascalie provano al massimo quattro modelli e arrivano comunque', async () => {
  azzeraQuoteGiorno();
  const primaFetch = globalThis.fetch;
  const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
  const modelli = env.GEMINI_MODELLI;
  const chiave = env.GEMINI_API_KEY;
  const claude = env.CLAUDE_CODE_OAUTH_TOKEN;
  let chiamate = 0;
  try {
    delete env.CLAUDE_CODE_OAUTH_TOKEN;
    env.GEMINI_MODELLI = 'gemini-a,gemini-b,gemini-c,gemini-d,gemini-e';
    env.GEMINI_API_KEY = 'prova';
    const chiavi: string[] = [];
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      chiamate += 1;
      chiavi.push(String((init?.headers as Record<string, string> | undefined)?.['x-goog-api-key']));
      return new Response('no', { status: 404 });
    }) as typeof fetch;
    // solo la chiave a pagamento: una chiamata, Flash-Lite
    let out = await scriviDidascalie({ titolo: 't', testo: 'detto nel video', brief: '', keywords: [] });
    assert.equal(chiamate, 1);
    assert.ok(out?.descrizione.includes('detto nel video'));
    // con la chiave gratuita: quattro modelli lì, poi Flash-Lite a pagamento
    chiamate = 0; chiavi.length = 0;
    env.GEMINI_API_KEY_GRATIS = 'gratis';
    out = await scriviDidascalie({ titolo: 't', testo: 'detto nel video', brief: '', keywords: [] });
    assert.deepEqual(chiavi, ['gratis', 'gratis', 'gratis', 'gratis', 'prova']);
    assert.ok(out?.descrizione.includes('detto nel video'));
  } finally {
    globalThis.fetch = primaFetch;
    delete env.GEMINI_API_KEY_GRATIS;
    if (modelli === undefined) delete env.GEMINI_MODELLI; else env.GEMINI_MODELLI = modelli;
    if (chiave === undefined) delete env.GEMINI_API_KEY; else env.GEMINI_API_KEY = chiave;
    if (claude !== undefined) env.CLAUDE_CODE_OAUTH_TOKEN = claude;
    azzeraQuoteGiorno();
  }
});

test('lo studio dello stile tiene i 9 minuti di Flash e salta la quota del giorno', () => {
  assert.equal(ATTESE_STILE['gemini-flash-latest'], 9);
  assert.equal(ATTESE_STILE['gemini-pro-latest'], 9);
  assert.equal(ATTESE_STILE['gemini-flash-lite-latest'], 6);
  assert.equal(TETTO_STILE_MS, 22 * 60 * 1000);
  azzeraQuoteStile();
  assert.equal(quotaGiornoDaTesto(429, 'generate_content_free_tier_requests PerDay'), true);
  assert.equal(quotaGiornoDaTesto(429, 'PerMinute'), false);
  ricordaQuotaStile('gemini-pro-latest');
  assert.equal(quotaStileFinita('gemini-pro-latest'), true);
  assert.equal(quotaStileFinita('gemini-flash-latest'), false);
  azzeraQuoteStile();
});
