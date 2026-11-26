// Il bot Regista con Telegram finto e memoria finta: il menu per intenzione e ogni suo tasto.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { after, test } from 'node:test';
import { register } from 'node:module';

// 'cloudflare:workers' esiste solo sul Worker: qui una classe vuota
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s, c, next) {
  if (s === 'cloudflare:workers') return { url: 'data:text/javascript,export class DurableObject {}', shortCircuit: true };
  return next(s, c);
}`));

type Chiamata = { metodo: string; corpo: any };
const chiamate: Chiamata[] = [];
const vero = globalThis.fetch;
const lanciati: any[] = [];
globalThis.fetch = (async (u: string | URL | Request, o?: RequestInit) => {
  const url = String(u);
  if (url.includes('/dispatches')) { lanciati.push({ url, corpo: JSON.parse(String(o?.body || '{}')) }); return new Response(null, { status: 204 }); }
  if (url.includes('api.telegram.org')) {
    chiamate.push({ metodo: url.split('/').pop() || '', corpo: JSON.parse(String(o?.body || '{}')) });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 7 } }));
  }
  return new Response(JSON.stringify({}), { status: 404 }); // GitHub, Drive, Graph: niente rete
}) as typeof fetch;

const memoria = new Map<string, unknown>();
const env: any = {
  ALLOWED_CHAT_ID: '1', TELEGRAM_SECRET: 's', TELEGRAM_BOT_TOKEN: 't', NOTIFY_TOKEN: 'ntok', STATO_APP_CHIAVE: 'chiave-stato', GITHUB_TOKEN: 'g', GITHUB_REPO: 'x/y',
  MEMORIA: { idFromName: () => 'm', get: () => ({
    leggi: async (k: string) => memoria.get(k), scrivi: async (k: string, v: unknown) => { memoria.set(k, v); },
    cancella: async (k: string) => { memoria.delete(k); }, aggiungi: async () => 1, socialDopo: async () => {},
  }) },
};
const { default: bot } = await import('../src/index');

async function manda(update: unknown) {
  chiamate.length = 0;
  const lavori: Promise<unknown>[] = [];
  const r = await bot.fetch(new Request('https://bot.test/tg', { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 's' }, body: JSON.stringify(update) }), env, { waitUntil: (p: Promise<unknown>) => lavori.push(p) });
  assert.equal(r.status, 200);
  await Promise.all(lavori);
  return chiamate.filter((c) => /^send|^edit|^answer/.test(c.metodo));
}
const tastiDi = (c: Chiamata): string[] => (c.corpo.reply_markup?.inline_keyboard || []).flat().map((b: any) => b.callback_data).filter(Boolean);
const testoDi = (c: Chiamata) => String(c.corpo.text || '');
const premi = (data: string) => manda({ callback_query: { id: 'c', data, from: { id: 1 }, message: { chat: { id: 1 }, message_id: 5 } } });

test('il pannello ha 6 intenzioni, non 8 tasti per funzione', async () => {
  const [m] = await manda({ message: { chat: { id: 1 }, text: '/menu' } });
  const dati = tastiDi(m);
  assert.deepEqual(dati.sort(), ['altro', 'guida', 'nuovo', 'social', 'stato', 'stili', 'video'].sort());
});

test('🧰 Altro: tutto quello che prima era nascosto ha un tasto', async () => {
  const m = (await premi('altro')).find((c) => c.corpo.reply_markup)!;
  assert.deepEqual(tastiDi(m).sort(), ['commenti', 'doc', 'imp', 'lotto', 'menu', 'mo', 'radar', 'report', 'tiktok'].sort());
  const [c] = await manda({ message: { chat: { id: 1 }, text: '/altro' } });
  assert.match(testoDi(c), /Altro/);
});

test('ogni tasto dei due menu risponde (nessun punto morto)', async () => {
  const da = new Set<string>();
  for (const t of ['/menu', '/altro']) for (const d of tastiDi((await manda({ message: { chat: { id: 1 }, text: t } }))[0])) da.add(d);
  assert.ok(da.size >= 14);
  for (const d of da) {
    const r = await premi(d);
    assert.ok(r.some((c) => c.metodo !== 'answerCallbackQuery'), `«${d}» non ha risposto`);
  }
});

test('/motion e /altro esistono anche come comandi', async () => {
  const [mo] = await manda({ message: { chat: { id: 1 }, text: '/motion' } });
  assert.match(testoDi(mo), /Motion/);
});

// ---- 📱 la app dentro Telegram ----
const firmato = (campi: Record<string, string>, token = 't') => {
  const controllo = Object.entries(campi).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('\n');
  const hash = createHmac('sha256', createHmac('sha256', 'WebAppData').update(token).digest()).update(controllo).digest('hex');
  return new URLSearchParams({ ...campi, hash }).toString();
};
const initDi = (id: number, token = 't') => firmato({ auth_date: String(Math.floor(Date.now() / 1000) - 30), user: JSON.stringify({ id }) }, token);
const accedi = (initData: string) => bot.fetch(new Request('https://bot.test/api/auth/telegram', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ initData }) }), env, { waitUntil: () => {} });

test('il pannello ha il tasto «📱 Apri la app» che apre la Mini App dentro Telegram', async () => {
  const [m] = await manda({ message: { chat: { id: 1 }, text: '/menu' } });
  const bottoni = (m.corpo.reply_markup.inline_keyboard as any[][]).flat();
  const app = bottoni.find((b) => b.web_app);
  assert.equal(app.text, '📱 Apri la app');
  assert.equal(app.web_app.url, 'https://bot.test/');
  const [c] = await manda({ message: { chat: { id: 1 }, text: '/app' } });
  assert.ok((c.corpo.reply_markup.inline_keyboard as any[][]).flat().some((b) => b.web_app));
});

test('accesso con Telegram: firma giusta e account di Denis → sessione; altrimenti 401 senza cookie', async () => {
  const bene = await accedi(initDi(1));
  assert.equal(bene.status, 200);
  const cookie = bene.headers.get('set-cookie') || '';
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  // con quel cookie la sessione risulta attiva
  const stato = await bot.fetch(new Request('https://bot.test/api/auth/stato', { headers: { cookie: cookie.split(';')[0] } }), env, { waitUntil: () => {} });
  assert.equal(((await stato.json()) as { sessione: boolean }).sessione, true);
  for (const male of [initDi(1, 'altro-token'), initDi(777), '']) {
    const r = await accedi(male);
    assert.equal(r.status, 401);
    assert.equal(r.headers.get('set-cookie'), null);
  }
});

test('senza accesso le API restano chiuse', async () => {
  const r = await bot.fetch(new Request('https://bot.test/api/home'), env, { waitUntil: () => {} });
  assert.equal(r.status, 401);
});

// ---- 🎵 Pubblica anche su TikTok (dal bot Regista) ----
const memoPub = (extra: Record<string, unknown> = {}) => ({ nome: 'Ajazz AK820', pubblica: { fileId: 'F1', file: 'Ajazz - FINALE.mp4', didascalia: 'Tastiera meccanica #tech', youtube: { titolo: 'Ajazz AK820' }, ...extra } });
const tastiPub = (c: Chiamata) => tastiDi(c);
const testoTutto = (cs: Chiamata[]) => cs.map(testoDi).join('\n');

test('TikTok non collegato: la schermata lo dice e non offre il tasto', async () => {
  memoria.set('run:R1', memoPub());
  memoria.set('ig_token', { token: 'x', rinnovata: 1 });
  memoria.set('yt_pronto', true);
  memoria.delete('tt_token');
  const r = await premi('pub:R1');
  const m = r.find((c) => c.corpo.reply_markup)!;
  assert.match(testoDi(m), /TikTok: ⚠️ <i>da collegare/);
  assert.ok(!tastiPub(m).includes('pubtt:R1'));
});

test('TikTok collegato: bozza di default, si può togliere, e va nei dati del workflow', async () => {
  memoria.set('run:R2', memoPub());
  memoria.set('ig_token', { token: 'x', rinnovata: 1 });
  memoria.set('yt_pronto', true);
  memoria.set('tt_token', { access: 'a', scade: Date.now() + 1e6, refresh: 'r', refreshScade: Date.now() + 1e9, scope: 'user.info.basic,video.list,video.upload' });
  let m = (await premi('pub:R2')).find((c) => c.corpo.reply_markup)!;
  assert.match(testoDi(m), /TikTok: <i>bozza nella tua app/);
  assert.ok(tastiPub(m).includes('pubtt:R2'));
  const etichette = (c: Chiamata): string[] => (c.corpo.reply_markup.inline_keyboard as any[][]).flat().map((b) => b.text);
  assert.ok(etichette(m).includes('✅ Pubblica')); // tutte le piattaforme collegate: «Pubblica» e basta
  // si toglie con l'interruttore
  m = (await premi('pubtt:R2')).find((c) => c.corpo.reply_markup)!;
  assert.match(testoDi(m), /TikTok: <i>no<\/i>/);
  assert.ok((m.corpo.reply_markup.inline_keyboard as any[][]).flat().some((b) => b.text === '✅ Pubblica su Instagram e YouTube'));
  await premi('pubtt:R2'); // si rimette
  lanciati.length = 0;
  await premi('pub!:R2');
  assert.equal(lanciati.length, 1);
  assert.match(lanciati[0].url, /pubblica\.yml/);
  const dati = JSON.parse(lanciati[0].corpo.inputs.dati);
  assert.deepEqual({ ig: dati.ig, yt: dati.yt, tt: dati.tt }, { ig: true, yt: true, tt: true });
});

test('TikTok scaduto o senza il permesso di caricare: trattato come non collegato', async () => {
  for (const tt of [{ scope: 'user.info.basic,video.list', refreshScade: Date.now() + 1e9 }, { scope: 'video.upload', refreshScade: Date.now() - 1 }]) {
    memoria.set('run:R3', memoPub());
    memoria.set('tt_token', { access: 'a', scade: 1, refresh: 'r', ...tt });
    const m = (await premi('pub:R3')).find((c) => c.corpo.reply_markup)!;
    assert.match(testoDi(m), /TikTok: ⚠️ <i>da collegare/);
  }
});

test('solo TikTok scelto: parte; senza nessuna piattaforma: errore chiaro', async () => {
  memoria.set('run:R4', memoPub({ ig: false, yt: false }));
  memoria.set('tt_token', { access: 'a', scade: Date.now() + 1e6, refresh: 'r', refreshScade: Date.now() + 1e9, scope: 'video.upload' });
  lanciati.length = 0;
  await premi('pub!:R4');
  assert.deepEqual(['ig', 'yt', 'tt'].map((k) => JSON.parse(lanciati[0].corpo.inputs.dati)[k]), [false, false, true]);
  memoria.set('run:R5', memoPub({ ig: false, yt: false, tt: false }));
  lanciati.length = 0;
  const r = await premi('pub!:R5');
  assert.equal(lanciati.length, 0);
  assert.match(testoTutto(r), /Scegli almeno una piattaforma/);
});

test('esito dal workflow: la bozza TikTok si annuncia con il testo da incollare; in attesa non è un errore', async () => {
  memoria.set('run:R6', memoPub());
  memoria.set('pub:abc123', { runId: 'R6', chat: '1', msg: 9 });
  chiamate.length = 0;
  await bot.fetch(new Request('https://bot.test/notify', { method: 'POST', headers: { 'x-regista-token': env.NOTIFY_TOKEN, 'content-type': 'application/json' }, body: JSON.stringify({
    tipo: 'pubblicato', nonce: 'abc123', nome: 'Ajazz AK820', instagram: { ok: true, link: 'https://ig/x' }, tiktok: { ok: true, bozza: true } }) }), env, { waitUntil: () => {} });
  const t = testoTutto(chiamate.filter((c) => /^send|^edit/.test(c.metodo)));
  assert.match(t, /TikTok: ✅ online · 📥 <b>bozza pronta<\/b>/);
  assert.match(t, /Testo per la bozza TikTok/);
  assert.match(t, /Tastiera meccanica #tech/);
  assert.equal(((memoria.get('run:R6') as { pubblicato: string }).pubblicato).includes('TikTok'), true);
  // ancora in elaborazione: né ✅ né ❌
  memoria.set('pub:def456', { runId: 'R6', chat: '1', msg: 9 });
  chiamate.length = 0;
  await bot.fetch(new Request('https://bot.test/notify', { method: 'POST', headers: { 'x-regista-token': env.NOTIFY_TOKEN, 'content-type': 'application/json' }, body: JSON.stringify({
    tipo: 'pubblicato', nonce: 'def456', nome: 'Ajazz AK820', tiktok: { ok: false, inAttesa: true, errore: 'TikTok sta ancora elaborando il video' } }) }), env, { waitUntil: () => {} });
  const t2 = testoTutto(chiamate.filter((c) => /^send|^edit/.test(c.metodo)));
  assert.match(t2, /TikTok: ⏳/);
  assert.doesNotMatch(t2, /TikTok: ❌/);
});

// ---- 📱 stato della Squadra per l'app ----
const invia_ = (corpo: unknown, chiave?: string, env_: any = env) => bot.fetch(new Request('https://bot.test/squadra-stato', { method: 'POST', headers: { 'content-type': 'application/json', ...(chiave ? { 'x-squadra-chiave': chiave } : {}) }, body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo) }), env_, { waitUntil: () => {} });
const STATO = { quando: '2026-11-26T12:00:00.000Z', stato: { agenti: { regista: { stato: 'lavora', cosa: 'DA NON SALVARE' } }, passi: ['🗂️ Archivista'],
  lavori: [{ id: 'Ajazz', stile: 'Kal', passo: 3, stato: 'lavora', testo: 'montaggio in corso', nota: 'sk-SEGRETA', prodotti: [{ nome: 'Ajazz', passo: 3, stato: 'lavora', testo: 'in corso' }] }],
  adesso: [{ testo: '🎬 Montaggio di Ajazz', coda: false, min: 4, link: 'https://github.com/privato/run/1' }], extra: 'x' } };

test('POST /squadra-stato: senza chiave, con chiave sbagliata o non attiva → rifiutato', async () => {
  memoria.delete('squadra:stato');
  assert.equal((await invia_(STATO)).status, 401);
  assert.equal((await invia_(STATO, 'sbagliata')).status, 401);
  assert.equal((await invia_(STATO, 'chiave-stato', { ...env, STATO_APP_CHIAVE: undefined })).status, 503);
  assert.equal(memoria.get('squadra:stato'), undefined);
});

test('POST /squadra-stato: con la chiave giusta si salva solo quello che è ammesso', async () => {
  assert.equal((await invia_(STATO, 'chiave-stato')).status, 200);
  const salvato = JSON.stringify(memoria.get('squadra:stato'));
  for (const vietato of ['DA NON SALVARE', 'sk-SEGRETA', 'github.com', 'extra', 'nota']) assert.ok(!salvato.includes(vietato), `salvato «${vietato}»`);
  assert.ok(salvato.includes('Ajazz'));
  assert.equal((await invia_('non è json', 'chiave-stato')).status, 400);
  assert.equal((await invia_({ stato: [1, 2] }, 'chiave-stato')).status, 400);
  assert.equal((await invia_({ stato: { passi: [] }, x: 'y'.repeat(30_000) }, 'chiave-stato')).status, 413);
});

test('GET /api/squadra/stato: serve il login; poi dà lo stato (e dice se è vecchio)', async () => {
  const senza = await bot.fetch(new Request('https://bot.test/api/squadra/stato'), env, { waitUntil: () => {} });
  assert.equal(senza.status, 401);
  const cookie = (await accedi(initDi(1))).headers.get('set-cookie')!.split(';')[0];
  const leggi_ = async () => (await (await bot.fetch(new Request('https://bot.test/api/squadra/stato', { headers: { cookie } }), env, { waitUntil: () => {} })).json()) as any;
  const r = await leggi_();
  assert.equal(r.presente, true);
  assert.equal(r.vecchio, false);
  assert.equal(r.stato.lavori[0].id, 'Ajazz');
  assert.ok(!JSON.stringify(r).includes('sk-SEGRETA'));
  const salvato = memoria.get('squadra:stato') as { ricevuto: number };
  memoria.set('squadra:stato', { ...salvato, ricevuto: Date.now() - 50 * 60_000 });
  assert.equal((await leggi_()).vecchio, true);
  memoria.delete('squadra:stato');
  assert.deepEqual(await leggi_(), { presente: false });
});
after(() => { globalThis.fetch = vero; });
