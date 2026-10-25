// Service worker : met l'app en cache pour qu'elle fonctionne hors ligne.
// À chaque publication, changer VERSION (et APP_VERSION dans src/version.js) :
// le téléphone télécharge alors la nouvelle version et propose de l'activer.
const VERSION = "1.0.4";
const CACHE = `journal-${VERSION}`;

// Liste complète des fichiers de l'app (vérifiée par les tests).
const FILES = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/app.css",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "src/analysis.js",
  "src/backup.js",
  "src/config.js",
  "src/dates.js",
  "src/model.js",
  "src/version.js",
  "src/storage/indexeddb.js",
  "src/storage/storage.js",
  "src/ui/analysis-view.js",
  "src/ui/app.js",
  "src/ui/backup-view.js",
  "src/ui/dom.js",
  "src/ui/entry.js",
  "src/ui/history.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: "reload" })))));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") self.skipWaiting();
});

// Cache d'abord : l'app s'ouvre instantanément, avec ou sans réseau.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === "navigate") return (await cache.match("index.html")) ?? fetch(req);
    return fetch(req);
  })());
});
