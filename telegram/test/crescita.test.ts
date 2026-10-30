import assert from 'node:assert/strict';
import { test } from 'node:test';
import { commentiNuovi, controllaEsplosioni, coppie, proposte, similitudine } from '../src/crescita';
import type { DepsSocial, Video } from '../src/social';

const ORA = Date.parse('2026-10-30T12:00:00Z');
const ore = (h: number) => new Date(ORA - h * 3_600_000).toISOString();

function finto(rispondi: (url: string, init?: RequestInit) => unknown) {
  const db = new Map<string, unknown>();
  const d: DepsSocial = {
    fetch: (async (i: RequestInfo | URL, init?: RequestInit) => {
      const corpo = rispondi(String(i), init);
      return new Response(JSON.stringify(corpo ?? {}), { status: corpo === undefined ? 404 : 200 });
    }) as typeof fetch,
    leggi: async <T>(k: string) => db.get(k) as T | undefined,
    scrivi: async (k, v) => { db.set(k, structuredClone(v)); },
    cancella: async (k) => { db.delete(k); },
    igToken: 'IGAA', geminiKey: 'G',
  };
  return { d, db };
}

test('lo stesso video su Instagram e TikTok si riconosce dal testo, non da un video qualsiasi', () => {
  const v = (p: 'ig' | 'tt', id: string, titolo: string, h: number): Video => ({ id, p, data: ore(h), titolo, views: 1, like: 0, commenti: 0, condivisioni: 0 });
  assert.ok(similitudine('Tastiera Hall Effect sotto 50 euro #tech', 'La tastiera Hall Effect che costa 50 euro') > 0.5);
  const c = coppie([v('ig', '1', 'Tastiera Hall Effect sotto 50 euro', 30), v('tt', 'a', 'Mouse wireless leggerissimo', 30), v('tt', 'b', 'tastiera hall effect 50 euro', 28)]);
  assert.deepEqual(c.map((x) => [x.ig.id, x.tt.id]), [['1', 'b']]);
});

test('sta esplodendo: avvisa una volta per raddoppio, solo sui video recenti', async () => {
  let viewsNuovo = 900;
  const { d } = finto((url) => {
    if (url.includes('/me/media')) {
      return { data: [
        { id: 'n', caption: 'Video nuovo', media_product_type: 'REELS', timestamp: ore(10) },
        ...['a', 'b', 'c'].map((id) => ({ id, caption: `vecchio ${id}`, media_product_type: 'REELS', timestamp: ore(24 * 6) })),
      ] };
    }
    const m = url.match(/\/(\w+)\/insights/);
    if (m) return { data: [{ name: 'views', values: [{ value: m[1] === 'n' ? viewsNuovo : 200 }] }] };
    return undefined;
  });
  const primo = await controllaEsplosioni(d, ORA);
  assert.equal(primo.length, 1);
  assert.match(primo[0], /Sta esplodendo/);
  assert.match(primo[0], /4\.5×/);
  assert.equal((await controllaEsplosioni(d, ORA + 3_600_000)).length, 0, 'stesso livello: niente doppione');
  viewsNuovo = 1800;
  assert.equal((await controllaEsplosioni(d, ORA + 7_200_000)).length, 1, 'raddoppiato: nuovo avviso');
});

test('commenti: il primo giro tiene solo le ultime 48 ore e salta quelli di Denis, poi solo i nuovi', async () => {
  let commenti = [
    { id: 'c1', text: 'link?', username: 'mario', timestamp: ore(5) },
    { id: 'c2', text: 'vecchio', username: 'luca', timestamp: ore(24 * 5) },
    { id: 'c3', text: 'grazie!', username: '_black_den', timestamp: ore(4) },
  ];
  const { d } = finto((url) => {
    if (url.includes('fields=username')) return { username: '_black_den' };
    if (url.includes('/me/media')) return { data: [{ id: 'm1', caption: 'Mouse', permalink: 'https://ig/m1', timestamp: ore(24 * 6), comments_count: 3 }] };
    if (url.includes('/m1/comments')) return { data: commenti };
    return undefined;
  });
  assert.deepEqual((await commentiNuovi(d, ORA)).map((c) => c.id), ['c1']);
  commenti = [...commenti, { id: 'c4', text: 'funziona su Mac?', username: 'anna', timestamp: ore(1) }];
  assert.deepEqual((await commentiNuovi(d, ORA)).map((c) => c.id), ['c4']);
  assert.deepEqual(await commentiNuovi(d, ORA), []);
});

test('le risposte proposte arrivano dal JSON dell’AI anche dentro un blocco di codice', async () => {
  const { d } = finto((url) => (url.includes('generativelanguage')
    ? { candidates: [{ content: { parts: [{ text: '```json\n{"c1": {"risposta": "È in bio 🔗", "spam": false}, "c2": {"risposta": "", "spam": true}}\n```' }] } }] }
    : undefined));
  const p = await proposte(d, [
    { id: 'c1', testo: 'link?', utente: 'a', quando: ore(1), media: 'm', titolo: 'x' },
    { id: 'c2', testo: 'guadagna 1000€ al giorno', utente: 'b', quando: ore(1), media: 'm', titolo: 'x' },
  ]);
  assert.equal(p.c1.risposta, 'È in bio 🔗');
  assert.equal(p.c2.spam, true);
});
