import assert from 'node:assert/strict';
import { test } from 'node:test';
import { completaLoginTikTok, confronta, htmlSicuro, linkLoginTikTok, pianoDelGiorno, type DepsSocial, type Fotografia } from '../src/social';

function finto(rispondi: (url: string, init?: RequestInit) => unknown, extra: Partial<DepsSocial> = {}) {
  const db = new Map<string, unknown>();
  const chiamate: string[] = [];
  const d: DepsSocial = {
    fetch: (async (i: RequestInfo | URL, init?: RequestInit) => {
      const url = String(i);
      chiamate.push(url);
      const corpo = rispondi(url, init);
      return new Response(JSON.stringify(corpo ?? {}), { status: corpo === undefined ? 404 : 200 });
    }) as typeof fetch,
    leggi: async <T>(k: string) => db.get(k) as T | undefined,
    scrivi: async (k, v) => { db.set(k, structuredClone(v)); },
    cancella: async (k) => { db.delete(k); },
    igToken: 'IG', geminiKey: 'G', ...extra,
  };
  return { d, db, chiamate };
}

let views = 100;
const instagram = (url: string) => {
  if (url.includes('/me/media')) {
    return { data: [
      { id: '1', caption: 'Tastiera Hall Effect', media_product_type: 'REELS', timestamp: '2026-10-26T10:00:00Z', like_count: 5, comments_count: 1, permalink: 'https://ig/1' },
      { id: '2', caption: 'foto', media_product_type: 'FEED', timestamp: '2026-10-26T10:00:00Z' },
    ] };
  }
  if (url.includes('/1/insights')) {
    if (url.includes('ig_reels_avg_watch_time')) return undefined; // rifiutata: si riprova senza
    return { data: [{ name: 'views', values: [{ value: views }] }, { name: 'reach', total_value: { value: 80 } }, { name: 'saved', values: [{ value: 3 }] }, { name: 'shares', values: [{ value: 2 }] }] };
  }
  if (url.includes('generativelanguage')) return { candidates: [{ content: { parts: [{ text: '<b>Oggi</b> rifai la tastiera' }] } }] };
  return undefined;
};

test('il secondo giorno misura la crescita e manda all’AI i dati veri', async () => {
  const { d, chiamate } = finto(instagram);
  const giorno1 = Date.parse('2026-10-27T06:17:00Z');
  const primo = await pianoDelGiorno(d, giorno1);
  assert.match(primo, /primo giorno di storico/);
  assert.match(primo, /TikTok<\/b> non collegato/);
  views = 250;
  const secondo = await pianoDelGiorno(d, giorno1 + 86_400_000);
  assert.match(secondo, /\+150 views/);
  assert.match(secondo, /<b>Oggi<\/b> rifai la tastiera/);
  assert.ok(!chiamate.some((u) => u.includes('/2/insights')), 'i post che non sono reel non chiedono statistiche');
});

test('un errore di Instagram arriva nel messaggio senza bloccare tutto', async () => {
  const { d } = finto(() => undefined);
  const t = await pianoDelGiorno(d);
  assert.match(t, /⚠️ Instagram: HTTP 404/);
});

test('crescita dalla rilevazione più recente che ha lo stesso video', () => {
  const v = (id: string, views: number) => ({ id, p: 'ig' as const, data: '2026-10-20T00:00:00Z', titolo: id, views, like: 0, commenti: 0, condivisioni: 0 });
  const oggi: Fotografia = { giorno: '2026-10-28', quando: Date.parse('2026-10-28T06:00:00Z'), video: [v('a', 50), v('b', 10)], errori: [], tiktok: false };
  const ieri: Fotografia = { giorno: '2026-10-27', quando: Date.parse('2026-10-27T06:00:00Z'), video: [v('b', 4)], errori: [], tiktok: false };
  const ieriL: Fotografia = { giorno: '2026-10-26', quando: Date.parse('2026-10-26T06:00:00Z'), video: [v('a', 20)], errori: [], tiktok: false };
  const r = confronta(oggi, [ieri, ieriL]);
  assert.equal(r[0].dViews, 30);
  assert.equal(r[0].oreDa, 48);
  assert.equal(r[1].dViews, 6);
});

test('HTML per Telegram: solo <b>/<i> bilanciati, il resto escapato', () => {
  assert.equal(htmlSicuro('**ciao** <i>x</i> <script>'), '<b>ciao</b> <i>x</i> &lt;script&gt;');
  assert.equal(htmlSicuro('<b>aperto senza chiusura'), 'aperto senza chiusura');
});

test('login TikTok: lo stato vale una volta sola', async () => {
  const { d, db } = finto((url, init) => {
    if (url.includes('oauth/token')) {
      assert.match(String(init?.body), /grant_type=authorization_code/);
      return { access_token: 'A', expires_in: 86400, refresh_token: 'R', refresh_expires_in: 31536000, open_id: 'O' };
    }
    return undefined;
  }, { ttKey: 'K', ttSecret: 'S' });
  const link = await linkLoginTikTok(d, 'https://bot');
  const state = new URL(link).searchParams.get('state') || '';
  assert.equal(new URL(link).searchParams.get('redirect_uri'), 'https://bot/tiktok/callback');
  await assert.rejects(() => completaLoginTikTok(d, 'https://bot', 'c', 'sbagliato'));
  await completaLoginTikTok(d, 'https://bot', 'c', state);
  assert.equal((db.get('tt_token') as { access: string }).access, 'A');
  await assert.rejects(() => completaLoginTikTok(d, 'https://bot', 'c', state));
});
