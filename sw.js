// Offline support: cache the app shell, serve it cache-first, refresh in the background.
const CACHE = 'pool-v2.0.0';
const SHELL = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'src/app.js', 'src/logic.js', 'src/store.js', 'src/i18n.js', 'src/share.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const hit = await cache.match(req, { ignoreSearch: true });
    const net = fetch(req).then(res => {
      if (res.ok && (new URL(req.url).origin === location.origin || req.url.includes('fonts.g'))) cache.put(req, res.clone());
      return res;
    }).catch(() => hit);
    return hit || net;
  }));
});
