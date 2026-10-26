import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scegliCartella } from '../../scripts/scegli-cartella.mjs';
import {
  ATTESE_STILE, TETTO_STILE_MS, azzeraQuoteStile, quotaGiornoDaTesto, quotaStileFinita, ricordaQuotaStile,
} from '../../scripts/studia-stile.mjs';
import {
  DIDASCALIE_MODELLI, GEMINI_TENTATIVI, GEMINI_TIMEOUT_MS,
  azzeraQuoteGiorno, chiamaGemini, quotaGiornoFinita, scriviDidascalie,
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
  assert.equal(DIDASCALIE_MODELLI, 2);
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

test('le didascalie provano al massimo due modelli', async () => {
  azzeraQuoteGiorno();
  const primaFetch = globalThis.fetch;
  const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
  const modelli = env.GEMINI_MODELLI;
  const chiave = env.GEMINI_API_KEY;
  let chiamate = 0;
  try {
    env.GEMINI_MODELLI = 'gemini-a,gemini-b,gemini-c,gemini-d';
    env.GEMINI_API_KEY = 'prova';
    globalThis.fetch = (async () => {
      chiamate += 1;
      return new Response('no', { status: 404 });
    }) as typeof fetch;
    const out = await scriviDidascalie({ titolo: 't', testo: 'detto nel video', brief: '', keywords: [] });
    assert.equal(out, null);
    assert.equal(chiamate, 2);
  } finally {
    globalThis.fetch = primaFetch;
    if (modelli === undefined) delete env.GEMINI_MODELLI; else env.GEMINI_MODELLI = modelli;
    if (chiave === undefined) delete env.GEMINI_API_KEY; else env.GEMINI_API_KEY = chiave;
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
