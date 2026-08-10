const CACHE_NAME = 'sca-player-v4';
const APP_VERSION = '1.0.34';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Clean up old caches
      caches.keys().then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
    ])
  );
});

// Notify clients when a new SW takes control
self.addEventListener('controllerchange', e => {
  // This fires on the client side, not here
});

// Handle SKIP_WAITING message from client
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
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
        if (res.ok && res.type !== 'error') {
          // Normaliser la clé de cache : ignorer le cache-busting "?v="
          // (Cache.put accepte une URL en string, pas besoin de reconstruire un Request)
          const cacheUrl = new URL(req.url);
          cacheUrl.searchParams.delete('v');
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(cacheUrl.toString(), copy)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || new Response('Hors ligne')))
    );
  } else {
    e.respondWith(
      fetch(req).then(res => {
        if (res.ok && res.type !== 'error') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy).catch(() => {}));
        }
        return res;
      }).catch(() => caches.match(req))
    );
  }
});
