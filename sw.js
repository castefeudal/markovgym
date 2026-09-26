const VERSION = '2026.09-r3-media4';
const PREFIX = 'mmg-gym-';
const SHELL = `${PREFIX}shell-${VERSION}`;
const MEDIA = `${PREFIX}media-${VERSION}`;
const PRECACHE = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './bootstrap.js',
  './gym-tools.js',
  './tools/gym-calculators.mjs',
  './data/content.json',
  './data/exercises-compact.json',
  './manifest.webmanifest',
  './images/gym-mark.svg',
  './images/exercise-placeholder.svg',
];
const MEDIA_LIMIT = 180;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(PREFIX) && key !== SHELL && key !== MEDIA).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function trimMedia(cache) {
  const keys = await cache.keys();
  while (keys.length > MEDIA_LIMIT) await cache.delete(keys.shift());
}

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response.ok) {
      const cache = await caches.open(SHELL);
      await cache.put('./index.html', response.clone());
    }
    return response;
  } catch {
    return caches.match('./index.html');
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (/\/videos\//.test(url.pathname)) {
    // Exercise GIFs are intentionally not intercepted. Let the browser fetch
    // them directly so animation/range responses cannot be altered by Cache API.
    return;
  }

  if (/\/images\//.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(MEDIA);
      const hit = await cache.match(request);
      if (hit) return hit;
      try {
        const response = await fetch(request);
        if (response.ok) {
          try {
            await cache.put(request, response.clone());
            await trimMedia(cache);
          } catch {
            // Cache Storage is an optimisation only. Never replace a valid
            // media response just because quota/private-mode cache writes fail.
          }
        }
        return response;
      } catch {
        return caches.match('./images/exercise-placeholder.svg');
      }
    })());
    return;
  }

  if (PRECACHE.some((path) => url.pathname.endsWith(path.replace('./', '/')))) {
    event.respondWith((async () => {
      try {
        return await fetch(request, { cache: 'no-store' });
      } catch {
        return caches.match(request, { ignoreSearch: true });
      }
    })());
  }
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'GET_VERSION') event.source?.postMessage({ type: 'VERSION', version: VERSION });
});
