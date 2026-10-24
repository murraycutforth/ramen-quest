// App-shell cache. App files: stale-while-revalidate. Data + GitHub API: network only
// (the app keeps its own data cache in localStorage). Bump VERSION when shipping.
const VERSION = 'rq-v1';
const SHELL = [
  './',
  './index.html',
  './css/styles.css',
  './manifest.webmanifest',
  './js/main.js', './js/config.js', './js/store.js', './js/github.js', './js/ops.js',
  './js/scoring.js', './js/ui.js', './js/sheet.js', './js/router.js', './js/geo.js',
  './js/views/list.js', './js/views/map.js', './js/views/stats.js',
  './js/views/detail.js', './js/views/rate.js', './js/views/settings.js',
  './assets/icons/naruto.svg', './assets/icons/icon-192.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname === 'api.github.com' || url.pathname.includes('/data/')) return; // network only
  if (url.hostname.endsWith('tile.openstreetmap.org')) return; // let the browser cache tiles

  const cacheable = url.origin === self.location.origin
    || url.hostname === 'unpkg.com'
    || url.hostname === 'fonts.googleapis.com'
    || url.hostname === 'fonts.gstatic.com';
  if (!cacheable) return;

  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(e.request, { ignoreSearch: url.origin === self.location.origin });
      const network = fetch(e.request)
        .then((res) => {
          if (res.ok || res.type === 'opaque') cache.put(e.request, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
