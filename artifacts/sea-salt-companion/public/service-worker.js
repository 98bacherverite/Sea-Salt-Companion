const CACHE_PREFIX = "sea-salt-companion-";
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const APP_SHELL = new URL("./", self.registration.scope).toString();

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(async (cache) => {
        const shell = await fetch(APP_SHELL);
        if (!shell.ok) throw new Error("Application shell could not be cached");
        await cache.put(APP_SHELL, shell.clone());
        const html = await shell.text();
        const assets = Array.from(
          html.matchAll(/(?:src|href)=["']([^"']*\/assets\/[^"']+)["']/g),
          (match) => new URL(match[1], APP_SHELL).toString(),
        );
        await cache.addAll([`${APP_SHELL}manifest.webmanifest`, ...assets]);
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE_NAME).then((cache) => cache.put(APP_SHELL, copy));
          }
          return response;
        })
        .catch(async () => (await caches.match(APP_SHELL)) || Response.error()),
    );
    return;
  }

  if (
    request.destination === "script" ||
    request.destination === "style" ||
    request.destination === "image" ||
    request.destination === "font" ||
    url.pathname.endsWith(".webmanifest")
  ) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      } catch {
        return (await caches.match(request)) || Response.error();
      }
    })());
  }
});
