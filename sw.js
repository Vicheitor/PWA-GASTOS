// Service worker: archivos propios "red primero" (siempre la versión publicada, nunca mezcla
// de versiones en caché) con copia para abrir sin internet. Librerías del CDN "caché primero"
// porque tienen versión fija. Supabase (datos y login) no se intercepta.

// Subir la versión al cambiar las librerías del CDN o la lista de PRECACHE.
const CACHE = 'gastos-v2';
const CDN_PREFIX = 'https://cdn.jsdelivr.net/npm/';
const NETWORK_TIMEOUT_MS = 10_000; // con mala señal, usar la copia en vez de esperar indefinidamente

// Para abrir sin internet incluso si solo se visitó una vez.
const PRECACHE = [
  './', './manifest.webmanifest', './css/styles.css', './icons/icon-192.png',
  './js/boot.js', './js/app.js', './js/api.js', './js/calc.js', './js/csv.js', './js/dom.js', './js/format.js',
  './js/offline.js', './js/outbox.js', './js/setup.js',
  './js/views/budget.js', './js/views/categorias.js', './js/views/gastos.js', './js/views/resumen.js',
  './js/views/respaldo.js',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  // Si falla (p. ej. sin conexión) no impide instalar: los archivos se guardan igual al usarlos.
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).catch(() => {}));
});

self.addEventListener('activate', (event) => event.waitUntil((async () => {
  const names = await caches.keys();
  await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)));
  await self.clients.claim();
})()));

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin) event.respondWith(networkFirst(request));
  else if (url.href.startsWith(CDN_PREFIX)) event.respondWith(cacheFirst(request));
});

// Guarda la respuesta reemplazando otras versiones del mismo archivo (?v=...), para que sin
// internet nunca se sirva una versión vieja mezclada con una nueva.
async function store(cache, request, response) {
  try {
    await cache.delete(request, { ignoreSearch: true });
    await cache.put(request, response);
  } catch { /* sin espacio: se sigue sin copia */ }
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const signal = AbortSignal.timeout(NETWORK_TIMEOUT_MS);
    // no-cache: revalida con el servidor aunque el navegador tenga una copia "fresca".
    // (Una petición de navegación no se puede copiar con opciones: se pide por su URL.)
    const response = request.mode === 'navigate'
      ? await fetch(request.url, { cache: 'no-cache', credentials: 'same-origin', signal })
      : await fetch(new Request(request, { cache: 'no-cache', signal }));
    if (response.ok) await store(cache, request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request) ?? await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const shell = await cache.match(new URL('./', self.location).href, { ignoreSearch: true });
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
  if (response.ok) await store(cache, request, response.clone());
  return response;
}
