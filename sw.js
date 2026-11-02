/* PedalLedger service worker.
   Strategy: network-first with a 3-second timeout. Online, you get fresh files; on a
   weak signal (Pamir 2G) the cached app opens after 3s instead of hanging, and the
   network response still refreshes the cache in the background. Offline: cache only.
   Bump CACHE whenever any file changes so installed phones pick it up. */
const CACHE = "pedalledger-v3";
const ASSETS = [
  "./", "./index.html", "./manifest.webmanifest", "./css/app.css",
  "./js/app.js", "./js/backup.js", "./js/charts.js", "./js/csv.js", "./js/dom.js",
  "./js/format.js", "./js/parse.js", "./js/router.js", "./js/state.js", "./js/stats.js",
  "./js/time.js",
  "./js/views/history.js", "./js/views/log.js", "./js/views/picker.js",
  "./js/views/settings.js", "./js/views/stats.js",
];
const NETWORK_TIMEOUT_MS = 3000;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;

  const network = fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  });
  e.waitUntil(network.catch(() => {}));   // let the background refresh finish

  e.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (!cached) {
      return network.catch(() => caches.match("./index.html"));
    }
    const timeout = new Promise((resolve) => setTimeout(() => resolve(cached), NETWORK_TIMEOUT_MS));
    return Promise.race([network.catch(() => cached), timeout]);
  })());
});
