// Il bot Regista con Telegram finto e memoria finta: il menu per intenzione e ogni suo tasto.
import assert from 'node:assert/strict';
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
globalThis.fetch = (async (u: string | URL | Request, o?: RequestInit) => {
  const url = String(u);
  if (url.includes('api.telegram.org')) {
    chiamate.push({ metodo: url.split('/').pop() || '', corpo: JSON.parse(String(o?.body || '{}')) });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 7 } }));
  }
  return new Response(JSON.stringify({}), { status: 404 }); // GitHub, Drive, Graph: niente rete
}) as typeof fetch;

const memoria = new Map<string, unknown>();
const env: any = {
  ALLOWED_CHAT_ID: '1', TELEGRAM_SECRET: 's', TELEGRAM_TOKEN: 't', GITHUB_TOKEN: 'g', GITHUB_REPO: 'x/y',
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
after(() => { globalThis.fetch = vero; });
