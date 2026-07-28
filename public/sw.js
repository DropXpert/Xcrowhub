const CACHE = "xcrowhub-v5";
const PRECACHE = ["/", "/index.html"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("message", (e) => {
  if (e.data?.type === "SKIP_WAITING") self.skipWaiting();
});

// Network-first for API/Supabase, cache-first for assets
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // Skip non-GET and cross-origin API calls
  if (e.request.method !== "GET") return;
  if (url.origin !== location.origin && url.hostname.includes("supabase")) return;

  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request, { cache: "no-store" }).catch(() => caches.match("/index.html"))
    );
    return;
  }

  // Cache-first for hashed static assets
  if (url.pathname.match(/\.(js|css|png|svg|ico|woff2?)$/)) {
    e.respondWith(
      caches.match(e.request).then((cached) =>
        cached || fetch(e.request).then((res) => {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
          return res;
        })
      )
    );
    return;
  }

  // Network-first for HTML navigation
  e.respondWith(
    fetch(e.request).catch(() => caches.match("/index.html"))
  );
});

// Push notifications
self.addEventListener("push", (e) => {
  const data = e.data?.json() ?? {};
  e.waitUntil(
    self.registration.showNotification(data.title ?? "ProofHold", {
      body: data.body ?? "You have a new message.",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag ?? "xcrowhub",
      data: { url: data.url ?? "/" },
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: "window" }).then((list) => {
      const target = e.notification.data?.url ?? "/";
      for (const client of list) {
        if ("focus" in client) { client.focus(); client.navigate(target); return; }
      }
      clients.openWindow(target);
    })
  );
});
