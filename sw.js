const CACHE_NAME = 'lumon-terminal-v13';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './avatar.js',
  './ambient.js',
  './engine.js',
  './audio.js',
  './sync.js',
  './fonts/fonts.css',
  './fonts/ibm-plex-mono-400.woff2',
  './fonts/ibm-plex-mono-600.woff2',
  './fonts/ibm-plex-mono-700.woff2',
  './fonts/silkscreen-400.woff2',
  './fonts/silkscreen-700.woff2',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.pathname.includes('/api/sync') || url.pathname.includes('/sync/')) {
    return;
  }

  if (event.request.method !== 'GET') return;

  const isFont =
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com' ||
    event.request.destination === 'font' ||
    url.pathname.includes('/fonts/');

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200) return response;
        if (response.type !== 'basic' && !isFont) return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      }).catch(() => cached);
    })
  );
});
