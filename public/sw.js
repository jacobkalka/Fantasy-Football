/*
  FantasyLab service worker (hand-written, no libraries).

  What it does, in plain words:
  - Keeps copies of the app's own files (code, styles, fonts, icons) so screens open fast and
    work without a connection.
  - Pages: always asks the server first. If the server doesn't answer within 3 seconds, or the
    phone is offline, it shows the last good copy of that page, or the offline page.
  - NEVER stores live fantasy data: everything under /api/ (scores, projections, rankings, news,
    injuries, start/sit, players...), sign-in routes, Supabase and any request carrying a login
    goes straight to the network, untouched. Offline, those requests simply fail and the screen
    shows its own "offline / data delayed" state.
  - ESPN player photos and team logos are kept (up to 200) because they rarely change.

  Versions: the page registers /sw.js?v=<build id>, so every deployment installs a new worker.
  The new worker waits until the person taps "Update" (components/pwa), then deletes the old
  caches. Bump REVISION when the caching rules in this file change.

  Registered only in production builds (components/pwa/service-worker.ts).
*/

const REVISION = 1;
const BUILD = new URL(self.location.href).searchParams.get("v") || "0";

const PREFIX = "fantasylab-";
const CACHE = {
  static: `${PREFIX}static-r${REVISION}-${BUILD}`,
  pages: `${PREFIX}pages-r${REVISION}-${BUILD}`,
  images: `${PREFIX}images-r${REVISION}-${BUILD}`,
};

const OFFLINE_URL = "/offline";
const NAVIGATION_TIMEOUT_MS = 3000;
const MAX_PAGES = 40;
const MAX_IMAGES = 200;
const IMAGE_FRESH_MS = 24 * 60 * 60 * 1000; // ESPN's own CDN lifetime for these images.
const ESPN_IMAGE_HOST = "a.espncdn.com";
const SAVED_AT_HEADER = "x-fantasylab-saved-at";

/** Same-origin paths the worker never touches: the browser talks to the network directly. */
const NETWORK_ONLY_PREFIXES = ["/api/", "/auth/"];
/** Pages that are never stored (sign-in and account screens). They still get the offline page. */
const PRIVATE_PAGE_PREFIXES = ["/api", "/auth", "/account"];

const TIMED_OUT = Symbol("timed out");

// ── Lifecycle ───────────────────────────────────────────────────────────────

self.addEventListener("install", (event) => {
  // Waits (doesn't take over) until the app asks: see the "message" listener.
  event.waitUntil(precacheOfflinePage());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set(Object.values(CACHE));
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name.startsWith(PREFIX) && !keep.has(name)).map((name) => caches.delete(name)),
      );
      // Starts the page request while the worker boots (faster navigations where supported).
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable().catch(() => {});
      }
      // Control open pages right away (on first install there's nothing to replace).
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

// ── Routing ─────────────────────────────────────────────────────────────────

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // Server Actions, connectivity checks: network.
  if (request.headers.has("range") || request.headers.has("authorization")) return;

  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(event, url));
    return;
  }

  if (url.origin === self.location.origin) {
    if (isNetworkOnly(url, request)) return;
    if (isStaticAsset(url)) event.respondWith(cacheFirst(event, request));
    return;
  }

  if (url.hostname === ESPN_IMAGE_HOST && request.destination === "image") {
    event.respondWith(espnImage(event, request));
  }
  // Anything else cross-origin (Supabase, ESPN data, etc.): not touched.
});

function startsWithAny(pathname, prefixes) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`));
}

function isNetworkOnly(url, request) {
  return (
    startsWithAny(url.pathname, NETWORK_ONLY_PREFIXES) ||
    // Next.js page data for in-app navigation and prefetching: always live.
    request.headers.has("rsc") ||
    url.searchParams.has("_rsc")
  );
}

/** Files that never change at the same address (or only change with a deployment). */
function isStaticAsset(url) {
  const { pathname } = url;
  return (
    pathname.startsWith("/_next/static/") ||
    pathname.startsWith("/brand/") ||
    pathname.startsWith("/splash/") ||
    /^\/(icon|apple-icon|favicon)[^/]*\.(png|svg|ico)$/.test(pathname) ||
    /\.(woff2?|ttf|otf)$/.test(pathname)
  );
}

// ── Pages: network first, then the last good copy, then the offline page ────

async function handleNavigation(event, url) {
  const storable = !startsWithAny(url.pathname, PRIVATE_PAGE_PREFIXES) && url.pathname !== OFFLINE_URL;
  const key = url.href;

  let stored = Promise.resolve();
  const network = fromNetwork(event).then((response) => {
    if (storable && isGoodPage(response)) stored = saveCopy(CACHE.pages, key, response, MAX_PAGES);
    return response;
  });
  // Keep the worker alive until the page is fully downloaded and saved, even if a saved copy
  // was shown first because the network was slow.
  event.waitUntil(network.then(() => stored).catch(() => {}));

  try {
    const response = await withTimeout(network, NAVIGATION_TIMEOUT_MS);
    if (response.status >= 500) {
      // The server is having trouble: a saved copy beats an error page.
      const saved = storable ? await savedPage(key) : undefined;
      if (saved) return saved;
    }
    return response;
  } catch (error) {
    const saved = storable ? await savedPage(key) : undefined;
    if (saved) return saved;
    if (error === TIMED_OUT) {
      // Slow but not offline, and nothing saved: keep waiting for the real page.
      try {
        return await network;
      } catch {
        // fall through to the offline page
      }
    }
    return offlinePage(url);
  }
}

/** The navigation preload response if the browser started one, otherwise a normal fetch. */
async function fromNetwork(event) {
  const preloaded = await event.preloadResponse;
  return preloaded || fetch(event.request);
}

function isGoodPage(response) {
  return (
    response.status === 200 &&
    response.type === "basic" &&
    !response.redirected &&
    (response.headers.get("content-type") || "").includes("text/html")
  );
}

function savedPage(key) {
  return caches.match(key, { cacheName: CACHE.pages, ignoreVary: true });
}

/**
 * Sends the person to /offline?from=<page>. A redirect rather than the offline page shown at the
 * original address: the page is prerendered for /offline, so showing it at another address makes
 * React throw away the server HTML (hydration mismatch). "Try again" goes back to `from`.
 */
async function offlinePage(url) {
  const cached = await caches.match(OFFLINE_URL, { cacheName: CACHE.static, ignoreVary: true });
  if (cached && url.pathname !== OFFLINE_URL) {
    const target = new URL(OFFLINE_URL, self.location.origin);
    target.searchParams.set("from", url.pathname + url.search);
    return Response.redirect(target.href, 302);
  }
  if (cached) return cached;
  return new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      "<title>Offline</title><body style=\"margin:0;min-height:100vh;display:grid;place-items:center;" +
      'background:#000;color:#fff;font:16px system-ui,sans-serif;text-align:center;padding:24px">' +
      "<div><h1>You're offline</h1><p>Check your connection and try again.</p></div>",
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(TIMED_OUT), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

// ── App files: cache first ──────────────────────────────────────────────────

async function cacheFirst(event, request) {
  const cache = await caches.open(CACHE.static);
  const hit = await cache.match(request, { ignoreVary: true });
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    event.waitUntil(cache.put(request, response.clone()).catch(() => {}));
  }
  return response;
}

/** The offline page and every file it needs (styles, scripts, fonts), stored at install. */
async function precacheOfflinePage() {
  const cache = await caches.open(CACHE.static);
  const response = await fetch(OFFLINE_URL, { cache: "reload" });
  if (!response.ok) throw new Error(`Offline page answered ${response.status}`);
  const html = await response.clone().text();
  await cache.put(OFFLINE_URL, response);
  const assets = new Set(html.match(/\/_next\/static\/[^"'\s\\<>)]+/g) || []);
  await Promise.allSettled(
    [...assets].map(async (path) => {
      if (await cache.match(path)) return;
      const asset = await fetch(path);
      if (asset.ok) await cache.put(path, asset);
    }),
  );
}

// ── ESPN photos and logos: stale-while-revalidate, at most 200 ──────────────

async function espnImage(event, request) {
  const key = request.url;
  const cache = await caches.open(CACHE.images);
  const saved = await cache.match(key);
  const age = saved ? Date.now() - Number(saved.headers.get(SAVED_AT_HEADER)) : Infinity;
  if (saved && age < IMAGE_FRESH_MS) return saved;

  // ESPN's CDN allows CORS, so the copy is a normal (not opaque) response: its size and status
  // are known, and it doesn't count as megabytes of padding against the phone's storage quota.
  let stored = Promise.resolve();
  const refresh = fetch(key, { mode: "cors", credentials: "omit" }).then((response) => {
    if (response.ok) stored = saveCopy(CACHE.images, key, response, MAX_IMAGES);
    return response;
  });
  event.waitUntil(refresh.then(() => stored).catch(() => {}));

  if (saved) return saved; // Show the old picture now; the new one is ready next time.
  try {
    return await refresh;
  } catch {
    return fetch(request); // CORS refused: load it the browser's normal way, uncached.
  }
}

// ── Storage helpers ─────────────────────────────────────────────────────────

/** Stores a copy stamped with the time it was saved, then trims the oldest entries. */
async function saveCopy(cacheName, key, response, maxEntries) {
  const headers = new Headers(response.headers);
  headers.set(SAVED_AT_HEADER, String(Date.now()));
  const copy = new Response(response.clone().body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
  const cache = await caches.open(cacheName);
  await cache.put(key, copy); // Re-saving moves an entry to the newest position.
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - maxEntries; i += 1) await cache.delete(keys[i]);
}
