const CACHE_NAME = 'sca-player-v1';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);

  // Ignorer les extensions navigateur, les données inline, etc.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }

  // Les requêtes POST/PATCH/PUT ne sont pas cachables
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return;
  }

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then(r => r || new Response('Hors ligne')))
    );
  } else {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req))
    );
  }
});
