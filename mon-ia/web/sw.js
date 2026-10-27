// Garde l'app et ton IA maison en mémoire pour qu'elles marchent hors connexion.
// Réponse immédiate depuis le cache, puis mise à jour en arrière-plan (les nouvelles versions arrivent au lancement suivant).
const CACHE = 'mon-ia-v1';
const CACHEABLE = (url) => url.origin === location.origin || url.hostname === 'cdn.jsdelivr.net' || url.hostname.endsWith('fonts.gstatic.com') || url.hostname === 'fonts.googleapis.com';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || !CACHEABLE(url)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(event.request, { ignoreSearch: url.origin === location.origin });
    const network = fetch(event.request).then((res) => {
      if (res.ok || res.type === 'opaque') cache.put(event.request, res.clone());
      return res;
    }).catch(() => cached);
    return cached || network;
  })());
});
