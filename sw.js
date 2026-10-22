/* Mulaqqin service worker: keeps the app working without internet and fast to open.
   The page is fetched fresh when online (so uploads of a new version arrive), with the saved copy
   as the fallback; icons come from the cache; fonts and the Word reader are kept after first use. */
const VERSION = '16350c195f01';
const SHELL = 'mlq-shell-' + VERSION;
const RUNTIME = 'mlq-runtime-v1';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png', './favicon-32.png'];
const CDN = /^(fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net)$/;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.indexOf('mlq-shell-') === 0 && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const wait = (ms) => new Promise((resolve) => setTimeout(() => resolve(null), ms));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL);
      const net = fetch(req).then((res) => {
        if (res && res.ok) cache.put('./index.html', res.clone());
        return res;
      });
      try {
        const res = await Promise.race([net, wait(3500)]);
        if (res) return res;
      } catch (e) { /* offline: use the saved copy */ }
      const saved = (await cache.match('./index.html')) || (await cache.match('./'));
      if (saved) {
        event.waitUntil(net.catch(() => null));
        return saved;
      }
      return net;
    })());
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)));
    return;
  }

  if (CDN.test(url.hostname)) {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME);
      const hit = await cache.match(req);
      const net = fetch(req).then((res) => {
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      if (hit) {
        event.waitUntil(net);
        return hit;
      }
      return (await net) || new Response('', { status: 504, statusText: 'Offline' });
    })());
  }
});
