import assert from 'node:assert/strict';
import { test } from 'node:test';
import { curvaDa, numeriYouTube, secondiIso, spiegaErrore } from './statistiche-youtube.mjs';

test('durata ISO e curva', () => {
  assert.equal(secondiIso('PT1M5S'), 65);
  assert.equal(secondiIso('PT42S'), 42);
  assert.deepEqual(curvaDa([[0.5, 0.61234], [0, 1.2], ['x', 1]]), [[0, 1.2], [0.5, 0.612]]);
});

test('permessi mancanti: spiega cosa fare invece di rompersi', () => {
  assert.match(spiegaErrore(403, { error: { message: 'Request had insufficient authentication scopes.' } }), /yt-analytics\.readonly/);
  assert.match(spiegaErrore(403, { error: { message: 'YouTube Analytics API has not been used in project 1 before or it is disabled.' } }), /abilita/);
});

test('legge numeri e curva dai servizi di Google (finti)', async () => {
  const vecchio = globalThis.fetch;
  Object.assign(process.env, { YT_CLIENT_ID: 'a', YT_CLIENT_SECRET: 'b', YT_REFRESH_TOKEN: 'c' });
  const ok = (j) => new Response(JSON.stringify(j), { status: 200 });
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('oauth2')) return ok({ access_token: 't' });
    if (u.includes('/channels')) return ok({ items: [{ contentDetails: { relatedPlaylists: { uploads: 'UU1' } } }] });
    if (u.includes('/playlistItems')) return ok({ items: [{ contentDetails: { videoId: 'v1' } }] });
    if (u.includes('/videos')) return ok({ items: [{ id: 'v1', snippet: { title: 'La god mode', publishedAt: '2026-11-16T23:00:00Z' }, contentDetails: { duration: 'PT48S' }, statistics: { viewCount: '900' } }] });
    if (u.includes('elapsedVideoTimeRatio')) return ok({ rows: [[0.01, 1.1], [0.5, 0.55], [1, 0.3]] });
    if (u.includes('dimensions=video')) {
      return ok({ columnHeaders: ['video', 'views', 'averageViewDuration', 'averageViewPercentage', 'likes', 'comments', 'shares', 'subscribersGained'].map((name) => ({ name })),
        rows: [['v1', 1000, 24, 50.4, 80, 9, 12, 3]] });
    }
    return new Response('{}', { status: 404 });
  };
  try {
    const { video, errori } = await numeriYouTube();
    assert.deepEqual(errori, []);
    assert.equal(video.length, 1);
    const v = video[0];
    assert.equal(v.p, 'yt');
    assert.equal(v.views, 1000);
    assert.equal(v.visioneMedia, 24);
    assert.equal(v.vistoPct, 50);
    assert.equal(v.durata, 48);
    assert.equal(v.follower, 3);
    assert.equal(v.curva.length, 3);
  } finally { globalThis.fetch = vecchio; }
});
