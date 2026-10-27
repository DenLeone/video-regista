// Guscio dell'app. Nessuna Background Sync: iOS non la esegue, e un upload
// lasciato in coda qui si perderebbe senza dirlo. I pezzi già confermati restano sul server.
const CACHE = 'regista-guscio-15';
const GUSCIO = ['/', '/app.css', '/app.js', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all(GUSCIO.map(async (percorso) => {
      const r = await fetch(percorso, { cache: 'reload' });
      if (!r.ok) throw new Error(percorso);
      await c.put(percorso, r);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((chiavi) => Promise.all(chiavi.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || url.pathname.startsWith('/api/') || e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then((r) => {
    const copia = r.clone();
    caches.open(CACHE).then((c) => c.put(e.request, copia)).catch(() => {});
    return r;
  }).catch(() => caches.match(e.request).then((c) => c || caches.match('/'))));
});

self.addEventListener('push', (e) => {
  let dati = {};
  try { dati = e.data ? e.data.json() : {}; } catch { dati = { title: 'Regista', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(dati.title || 'Regista', {
    body: dati.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: dati.url || '/' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((finestre) => {
    for (const c of finestre) {
      if (c.url.includes(self.location.origin) && 'focus' in c) return c.focus();
    }
    return self.clients.openWindow(url);
  }));
});
