/* Under — offline support.
   Network first, so a new version shows up as soon as it's published.
   The cache is only a fallback for when there's no signal.
   Nothing here is allowed to fail in a way that wedges an old version in place. */
var CACHE = "under-v14";
var CORE = ["./", "./index.html", "./config.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      /* one missing file must never fail the whole install — that would leave
         the previous worker in charge, serving an old app for ever */
      return Promise.all(CORE.map(function (u) {
        return c.add(new Request(u, { cache: "reload" })).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); }).catch(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("message", function (e) {
  if (e.data === "reset") {
    caches.keys().then(function (keys) { keys.forEach(function (k) { caches.delete(k); }); });
    self.registration.unregister();
  }
});

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  var url = new URL(e.request.url);
  if (url.origin !== location.origin) return;            // Supabase, fonts: straight to the network
  e.respondWith(
    fetch(e.request.url, { cache: "no-cache", credentials: "same-origin" }).then(function (res) {
      if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, copy); }); }
      return res;
    }).catch(function () {
      return caches.match(e.request).then(function (r) { return r || caches.match("./index.html"); });
    })
  );
});
