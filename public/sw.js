// Hand-rolled service worker for offline support.
// Strategy:
//   - HTML navigations: NetworkFirst (fall back to cached shell when offline)
//   - Static assets (JS/CSS/img/font): StaleWhileRevalidate
//   - /api/tts audio: CacheFirst (immutable per text+lang)
// Bump CACHE_VERSION to invalidate old caches on deploy.

const CACHE_VERSION = "v1";
const SHELL_CACHE = `shell-${CACHE_VERSION}`;
const ASSET_CACHE = `assets-${CACHE_VERSION}`;
const TTS_CACHE = `tts-${CACHE_VERSION}`;

const SHELL_URLS = ["/", "/study", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      Promise.all(
        SHELL_URLS.map((url) =>
          fetch(url, { cache: "reload" })
            .then((res) => (res.ok ? cache.put(url, res) : null))
            .catch(() => null),
        ),
      ),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => ![SHELL_CACHE, ASSET_CACHE, TTS_CACHE].includes(k))
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

function isHtmlNavigation(request) {
  return (
    request.mode === "navigate" ||
    (request.method === "GET" && request.headers.get("accept")?.includes("text/html"))
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // TTS audio — cache first (immutable per query)
  if (url.pathname === "/api/tts") {
    event.respondWith(
      caches.open(TTS_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        try {
          const res = await fetch(request);
          if (res.ok) cache.put(request, res.clone());
          return res;
        } catch (e) {
          return hit ?? Response.error();
        }
      }),
    );
    return;
  }

  // HTML navigations — network first, fall back to cached shell
  if (isHtmlNavigation(request)) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(request);
          const cache = await caches.open(SHELL_CACHE);
          cache.put(request, res.clone()).catch(() => {});
          return res;
        } catch (e) {
          const cache = await caches.open(SHELL_CACHE);
          return (
            (await cache.match(request)) ??
            (await cache.match("/")) ??
            new Response("Offline", { status: 503 })
          );
        }
      })(),
    );
    return;
  }

  // Static assets — stale-while-revalidate
  event.respondWith(
    caches.open(ASSET_CACHE).then(async (cache) => {
      const hit = await cache.match(request);
      const fetchPromise = fetch(request)
        .then((res) => {
          if (res.ok) cache.put(request, res.clone());
          return res;
        })
        .catch(() => hit);
      return hit ?? fetchPromise;
    }),
  );
});
