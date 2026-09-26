const CACHE_NAME = "piki-partner-v0.2.2";
const OWN_CACHE_PREFIXES = ["piki-partner-"];

function isOwnCache(name) {
  return OWN_CACHE_PREFIXES.some((prefix) => name.startsWith(prefix));
}

function mustBypassCache(request) {
  const url = new URL(request.url);
  return url.origin !== self.location.origin
    || url.pathname === "/release.json"
    || url.pathname.startsWith("/api/")
    || url.pathname.startsWith("/auth/");
}

async function cacheSuccessfulResponse(request, response) {
  if (response.ok && response.type === "basic") {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request) {
  try {
    return await cacheSuccessfulResponse(request, await fetch(request));
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === "navigate") return (await caches.match("/")) || Response.error();
    return Response.error();
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter((name) => isOwnCache(name) && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || mustBypassCache(request)) return;

  // HTML is deliberately network-first so installed clients receive the current shell.
  event.respondWith(networkFirst(request));
});
