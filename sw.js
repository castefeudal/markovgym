const VERSION = '2026.10-r52-portable-backup-export';
const PREFIX = 'mmg-gym-';
const SHELL = `${PREFIX}shell-${VERSION}`;
const MEDIA = `${PREFIX}media-${VERSION}`;
const PRECACHE = [
  './',
  './index.html',
  './styles/tokens.css',
  './styles/reset.css',
  './styles/base.css',
  './styles/components.css',
  './styles/layout.css',
  './styles/features/legacy-product.css',
  './app.css',
  './styles/features/exercise.css',
  './styles/features/program.css',
  './styles/features/workout.css',
  './styles/features/nutrition.css',
  './app.js',
  './src/app/router.mjs',
  './src/features/command-palette/search.mjs',
  './src/data/exercise-repository.mjs',
  './src/features/workout/workout-records.mjs',
  './src/features/workout/progression-adapter.mjs',
  './src/features/exercise/preferences.mjs',
  './src/app/state.mjs',
  './src/app/i18n.mjs',
  './src/app/load-modules.mjs',
  './lab.css',
  './bootstrap.js',
  './gym-tools.js',
  './tools/gym-calculators.mjs',
  './tools/lab-calculators.mjs',
  './tools/progression.mjs',
  './tools/workout-groups.mjs',
  './src/persistence/history-repository.mjs',
  './src/persistence/local-first-store.mjs',
  './src/features/today/decision-engine.mjs',
  './src/features/program/mesocycle.mjs',
  './src/features/program/weekly-review.mjs',
  './src/features/lab/evidence-registry.mjs',
  './src/features/exercise/substitution-engine.mjs',
  './src/features/workout/pr-engine.mjs',
  './src/features/nutrition/nutrition-analytics.mjs',
  './src/features/progress/weight-trend.mjs',
  './data/content.json',
  './data/exercises-compact.json',
  './manifest.webmanifest',
  './images/gym-mark.svg',
  './images/exercise-placeholder.svg',
];
const MEDIA_LIMIT = 180;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(PRECACHE)));
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
