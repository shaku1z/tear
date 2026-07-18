// TEAR: BLADE — service worker (standalone/PWA build only; never registered
// inside the CrazyGames iframe — see the registration gate in index.html).
//
// Strategy: one versioned cache per build. The version rides in on the
// registration URL (sw.js?v=N — the same ?v the game's scripts use), so the
// existing cache-bust workflow (bump ?v in index.html) rolls the SW cache too.
// Shell = cache-first (instant offline boot); cross-origin (CG SDK, Firebase,
// fonts) = network passthrough, never cached here.
const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE = "tear-blade-" + VERSION;

const SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/branding/favicon.png",
  "/branding/icons/icon-192.png",
  "/branding/icons/icon-512.png",
  "/branding/icons/icon-maskable-512.png",
].concat([
  "config", "stages", "utils", "voidgen", "ui", "audio", "input", "gamepad", "particles", "backdrop",
  "attract", "crazy", "firebase-config", "profile", "achievements", "challenges",
  "upgrades", "meta", "weapons", "affixes", "variants", "blade", "player",
  "projectile", "enemy", "ghost", "cloud", "mirror", "game",
].map((m) => "/js/" + m + ".js?v=" + VERSION));

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("tear-blade-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // same-origin GETs only; everything else (CG SDK, Firebase, analytics) passes through
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  e.respondWith(
    // Network-first for navigation (HTML) so the SW cache version can update
    e.request.mode === "navigate" ? 
      fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(e.request).then(hit => hit || caches.match("/index.html")))
    :
    // Cache-first for all other static assets (JS, CSS, images, etc.)
    caches.match(e.request).then((hit) => {
      if (hit) return hit;
      return fetch(e.request).then((res) => {
        // opportunistically cache same-origin static hits for offline
        if (res.ok && (res.type === "basic" || res.type === "default")) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      }).catch(() => undefined);
    })
  );
});
