const CACHE_VERSION = "bardeur-pwa-v3";
const APP_SHELL = [
  "/",
  "/offline.html",
  "/manifest.webmanifest",
  "/favicon.png",
  "/app-icon-512.png"
];

const SENSITIVE_PATHS = [
  "/auth/",
  "/rest/v1/",
  "/storage/v1/object/",
  "/functions/v1/",
  "/realtime/v1/",
  "/chat/",
  "/admin"
];

const SECURITY_HEADERS = {
  "X-Bardeur-Cache": "pwa-v3",
  "X-Bardeur-Offline": "safe-shell"
};

const shouldBypassCache = (url, request) => {
  if (request.headers.get("authorization")) return true;
  if (request.cache === "no-store") return true;
  if (url.searchParams.has("token") || url.searchParams.has("access_token")) return true;
  return SENSITIVE_PATHS.some((path) => url.pathname.includes(path));
};

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (shouldBypassCache(url, request)) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put("/", copy));
          return new Response(response.body, { status: response.status, statusText: response.statusText, headers: new Headers([...response.headers, ...Object.entries(SECURITY_HEADERS)]) });
        })
        .catch(async () => (await caches.match("/")) || caches.match("/offline.html"))
    );
    return;
  }

  if (url.pathname.match(/\.(?:js|css|png|jpg|jpeg|svg|ico|webmanifest|woff2?)$/)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (response.ok) caches.open(CACHE_VERSION).then((cache) => cache.put(request, response.clone()));
            return response;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || "/inbox";
  const url = new URL(targetUrl, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate?.(url);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
      return undefined;
    })
  );
});
