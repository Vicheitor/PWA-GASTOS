// Service worker: archivos propios "red primero" (siempre la versión publicada, nunca mezcla
// de versiones en caché) con copia para abrir sin internet. Librerías del CDN "caché primero"
// porque tienen versión fija. Supabase (datos y login) no se intercepta.

const CACHE = 'gastos-v1';
const CDN_PREFIX = 'https://cdn.jsdelivr.net/npm/';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin) event.respondWith(networkFirst(request));
  else if (url.href.startsWith(CDN_PREFIX)) event.respondWith(cacheFirst(request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    // no-cache: revalida con el servidor aunque el navegador tenga una copia "fresca".
    // (Una petición de navegación no se puede copiar con opciones: se pide por su URL.)
    const response = request.mode === 'navigate'
      ? await fetch(request.url, { cache: 'no-cache', credentials: 'same-origin' })
      : await fetch(new Request(request, { cache: 'no-cache' }));
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const shell = await cache.match(new URL('./', self.location).href);
      if (shell) return shell;
    }
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}
