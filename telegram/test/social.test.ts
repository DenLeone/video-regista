import assert from 'node:assert/strict';
import { test } from 'node:test';
import { completaLoginTikTok, confronta, htmlSicuro, linkLoginTikTok, pianoDelGiorno, videoInstagram, type DepsSocial, type Fotografia } from '../src/social';

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

// 27/11: reels_skip_rate = % che scorre via nei primi 3 s (la forza del gancio). Si prova sul primo reel; se l'API non la dà,
// gli altri non la chiedono: le richieste restano quelle di prima (tetto di ~50 a giro del piano gratuito di Cloudflare)
const tre = { data: ['1', '3', '4'].map((id) => ({ id, caption: `reel ${id}`, media_product_type: 'REELS', timestamp: '2026-11-20T10:00:00Z', like_count: 1, comments_count: 0 })) };
const dati = (conSalto: boolean, valore = 41.46) => ({ data: [{ name: 'views', values: [{ value: 500 }] }, { name: 'reach', total_value: { value: 400 } }, { name: 'saved', values: [{ value: 3 }] },
  { name: 'shares', values: [{ value: 2 }] }, { name: 'ig_reels_avg_watch_time', values: [{ value: 7300 }] }, ...(conSalto ? [{ name: 'reels_skip_rate', values: [{ value: valore }] }] : [])] });
test('Instagram: il salto nei primi 3 s arriva quando l\'API lo dà, con una richiesta per reel', async () => {
  const { d, chiamate } = finto((url) => (url.includes('/me/media') ? tre : url.includes('/insights') ? dati(url.includes('reels_skip_rate')) : undefined));
  const v = await videoInstagram(d);
  assert.deepEqual(v.map((x) => x.salto), [41.5, 41.5, 41.5]);
  assert.deepEqual(v.map((x) => x.visioneMedia), [7.3, 7.3, 7.3]);
  assert.equal(chiamate.filter((u) => u.includes('/insights')).length, 3);
});
test('Instagram: se l\'API rifiuta il salto, solo il primo reel lo prova (niente richieste in più per gli altri)', async () => {
  const { d, chiamate } = finto((url) => (url.includes('/me/media') ? tre : url.includes('reels_skip_rate') ? undefined : url.includes('/insights') ? dati(false) : undefined));
  const v = await videoInstagram(d);
  assert.deepEqual(v.map((x) => x.salto), [undefined, undefined, undefined]);
  assert.deepEqual(v.map((x) => x.visioneMedia), [7.3, 7.3, 7.3]);
  const ins = chiamate.filter((u) => u.includes('/insights'));
  assert.equal(ins.length, 5); // il primo: 2 rifiutate + 1 buona; gli altri 2: una a testa, come prima
  assert.ok(!ins.slice(3).some((u) => u.includes('reels_skip_rate')));
});
test('Instagram: un salto senza valore (poche visualizzazioni) non diventa 0%', async () => {
  const { d } = finto((url) => (url.includes('/me/media') ? { data: tre.data.slice(0, 1) } : url.includes('/insights') ? { data: [...dati(false).data, { name: 'reels_skip_rate', values: [{}] }] } : undefined));
  assert.equal((await videoInstagram(d))[0].salto, undefined);
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
