#!/usr/bin/env node
/**
 * End-to-end checks for the installable app / offline support (public/sw.js, components/pwa,
 * app/manifest.ts, app/offline) against a real production build in headless Chromium.
 *
 *   node scripts/test-pwa.mjs
 *
 * It runs `next build` twice in THIS folder (the second build plays "a new deployment"),
 * so run it in a checkout where nothing else is building. Takes a few minutes.
 * It expects <PwaRoot /> mounted and pwaMetadata spread in app/layout.tsx.
 *
 * Options:
 *   --port 3630           where the browser connects (next start runs on port+1, behind a
 *                         small switchable proxy used to simulate "offline" and "slow network")
 *   --skip-first-build    reuse the existing .next build for the first round
 *   --skip-update         skip the second build (new deployment / update prompt checks)
 *   --skip-dev            skip the `next dev` check (worker must not register in development)
 *
 * Needs playwright-core and Chromium. If they aren't installed in this project:
 *   PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core CHROME_PATH=/path/to/chrome node scripts/test-pwa.mjs
 * In Claude's sandbox also set NODE_USE_ENV_PROXY=1 (server-side ESPN calls); HTTPS_PROXY, if
 * set, is passed to Chromium so ESPN images load.
 */
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const PORT = Number(option("--port", "3630"));
const NEXT_PORT = PORT + 1;
const DEV_PORT = PORT + 2;
const BASE = `http://localhost:${PORT}`;

// ── Results ──────────────────────────────────────────────────────────────────

const results = [];
function check(name, ok, evidence = "") {
  results.push({ name, ok: Boolean(ok), evidence });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${evidence ? `\n      ${evidence}` : ""}`);
  return Boolean(ok);
}
function note(text) {
  console.log(`      ${text}`);
}
function section(title) {
  console.log(`\n── ${title} ${"─".repeat(Math.max(0, 70 - title.length))}`);
}

// ── Processes ────────────────────────────────────────────────────────────────

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  for (const id of [process.env.PLAYWRIGHT_CORE, "playwright-core", "playwright"].filter(Boolean)) {
    try {
      return require(id);
    } catch {
      // next
    }
  }
  throw new Error("playwright-core not found. Install it or set PLAYWRIGHT_CORE=/path/to/playwright-core.");
}

function run(command, commandArgs, label) {
  return new Promise((resolve, reject) => {
    console.log(`      $ ${command} ${commandArgs.join(" ")}`);
    const child = spawn(command, commandArgs, { cwd: root, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    child.on("exit", (code) =>
      code === 0 ? resolve(output) : reject(new Error(`${label} failed (exit ${code}):\n${output.slice(-3000)}`)),
    );
  });
}

async function waitForHttp(url, timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`${url} didn't come up`);
}

/** Starts a long-running command in its own process group; returns a stop() that ends that group. */
async function startServer(commandArgs, port, readyPath) {
  const child = spawn("npx", commandArgs, { cwd: root, env: process.env, stdio: "ignore", detached: true });
  await waitForHttp(`http://localhost:${port}${readyPath}`, 120_000);
  return {
    stop: () =>
      new Promise((resolve) => {
        child.once("exit", () => resolve());
        try {
          process.kill(-child.pid, "SIGTERM");
        } catch {
          resolve();
        }
        setTimeout(resolve, 5000);
      }),
  };
}

/** A tiny proxy in front of next start: "up", "down" (connections dropped, like no network) or "slow-html". */
function startProxy() {
  const state = { mode: "up" };
  const server = http.createServer((req, res) => {
    if (state.mode === "down") {
      req.socket.destroy();
      return;
    }
    const forward = () => {
      const upstream = http.request(
        { host: "127.0.0.1", port: NEXT_PORT, method: req.method, path: req.url, headers: req.headers },
        (reply) => {
          res.writeHead(reply.statusCode ?? 502, reply.statusMessage, reply.headers);
          reply.pipe(res);
        },
      );
      upstream.on("error", () => res.destroy());
      req.pipe(upstream);
    };
    const isDocument = (req.headers.accept || "").includes("text/html") && !req.headers.rsc;
    if (state.mode === "slow-html" && isDocument) setTimeout(forward, 6000);
    else forward();
  });
  return new Promise((resolve) => server.listen(PORT, () => resolve({ state, close: () => server.close() })));
}

// ── Page helpers ─────────────────────────────────────────────────────────────

const dumpCaches = (page) =>
  page.evaluate(async () => {
    const out = {};
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      out[name] = (await cache.keys()).map((r) => r.url);
    }
    return out;
  });

const controllerUrl = (page) => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? null);
const versionOf = (scriptUrl) => (scriptUrl ? new URL(scriptUrl).searchParams.get("v") : null);
const heading = (page) => page.evaluate(() => document.querySelector("h1")?.textContent?.trim() ?? null);

async function staticAssetsOf(pagePath) {
  const html = await (await fetch(`http://localhost:${NEXT_PORT}${pagePath}`)).text();
  return new Set(html.match(/\/_next\/static\/[^"'\s\\<>)]+/g) ?? []);
}

/** Width and height of a PNG from its header. */
function pngSize(buffer) {
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

// ── Main ─────────────────────────────────────────────────────────────────────

const { chromium } = loadPlaywright();
let nextServer = null;
let proxy = null;
let context = null;
const profile = await mkdtemp(path.join(os.tmpdir(), "pwa-test-profile-"));

try {
  section("Build 1");
  if (!flag("--skip-first-build")) await run("npx", ["next", "build"], "next build");
  else note("(reusing the existing .next build)");
  nextServer = await startServer(["next", "start", "-p", String(NEXT_PORT)], NEXT_PORT, "/offline");
  proxy = await startProxy();
  const assetsBuild1 = await staticAssetsOf("/");

  section("Service worker file");
  const swResponse = await fetch(`${BASE}/sw.js`);
  check(
    "/sw.js is served as JavaScript and never cached",
    swResponse.ok &&
      swResponse.headers.get("content-type")?.startsWith("application/javascript") &&
      /no-cache/.test(swResponse.headers.get("cache-control") ?? "") &&
      /no-store/.test(swResponse.headers.get("cache-control") ?? ""),
    `content-type: ${swResponse.headers.get("content-type")}; cache-control: ${swResponse.headers.get("cache-control")}`,
  );

  context = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.CHROME_PATH || undefined,
    headless: true,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: false,
    proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: "localhost,127.0.0.1" } : undefined,
  });
  const page = context.pages()[0] ?? (await context.newPage());
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(`${new URL(page.url()).pathname}: ${String(error).slice(0, 160)}`));

  // Every response the page sees: which ones the service worker answered.
  const seen = [];
  page.on("response", (response) => {
    const url = new URL(response.url());
    seen.push({ url: response.url(), path: url.pathname, rsc: url.searchParams.has("_rsc"), sw: response.fromServiceWorker() });
  });

  section("Registration");
  await page.goto(`${BASE}/`, { waitUntil: "load" });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 30_000 });
  const firstController = await controllerUrl(page);
  const version1 = versionOf(firstController);
  check("Worker registers and controls the page", /\/sw\.js\?v=\d+$/.test(firstController ?? ""), `controller: ${firstController}`);
  await page.waitForTimeout(500);
  check(
    "No update prompt on first install",
    (await page.locator('[data-pwa="update-prompt"]').count()) === 0,
  );

  section("Manifest and installability");
  const cdp = await context.newCDPSession(page);
  const manifestInfo = await cdp.send("Page.getAppManifest");
  check(
    "Manifest parses without errors",
    manifestInfo.errors.length === 0 && manifestInfo.url.endsWith("/manifest.webmanifest"),
    `url: ${manifestInfo.url}; errors: ${JSON.stringify(manifestInfo.errors)}`,
  );
  const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
  check("Chrome reports the app as installable", installabilityErrors.length === 0, `installability errors: ${JSON.stringify(installabilityErrors)}`);
  const manifest = await (await fetch(`${BASE}/manifest.webmanifest`)).json();
  check(
    "Manifest fields: id, scope, start_url, standalone, black theme, no orientation lock",
    manifest.id === "/" &&
      manifest.scope === "/" &&
      manifest.start_url === "/" &&
      manifest.display === "standalone" &&
      manifest.theme_color === "#000000" &&
      manifest.background_color === "#000000" &&
      !("orientation" in manifest),
    `name: ${manifest.name}; display_override: ${JSON.stringify(manifest.display_override)}`,
  );
  const iconProblems = [];
  for (const icon of manifest.icons) {
    const response = await fetch(`${BASE}${icon.src}`);
    const size = pngSize(Buffer.from(await response.arrayBuffer()));
    if (!response.ok || `${size.width}x${size.height}` !== icon.sizes) iconProblems.push(`${icon.src} ${response.status} ${size.width}x${size.height}`);
  }
  check(
    "Every manifest icon loads at its declared size (any + maskable)",
    iconProblems.length === 0 && manifest.icons.some((i) => i.purpose === "maskable"),
    iconProblems.join("; ") || manifest.icons.map((i) => `${i.src} (${i.purpose})`).join(", "),
  );
  const shotProblems = [];
  for (const shot of manifest.screenshots ?? []) {
    const response = await fetch(`${BASE}${shot.src}`);
    const size = pngSize(Buffer.from(await response.arrayBuffer()));
    const ratio = Math.max(size.width, size.height) / Math.min(size.width, size.height);
    if (!response.ok || `${size.width}x${size.height}` !== shot.sizes || ratio > 2.3 || Math.min(size.width, size.height) < 320) {
      shotProblems.push(`${shot.src} ${response.status} ${size.width}x${size.height}`);
    }
  }
  check(
    "Screenshots for the install dialog load at their declared sizes (phone + wide)",
    shotProblems.length === 0 &&
      manifest.screenshots?.some((s) => s.form_factor === "narrow") &&
      manifest.screenshots?.some((s) => s.form_factor === "wide"),
    shotProblems.join("; ") || `${manifest.screenshots?.length ?? 0} screenshots`,
  );
  check(
    "Shortcuts for the main destinations",
    ["/", "/team", "/start-sit", "/players", "/trades"].every((u) => manifest.shortcuts?.some((s) => s.url === u)),
    manifest.shortcuts?.map((s) => `${s.name} → ${s.url}`).join(", "),
  );

  section("iOS head tags");
  const head = await page.evaluate(() => ({
    capable: document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.getAttribute("content"),
    status: document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.getAttribute("content"),
    title: document.querySelector('meta[name="apple-mobile-web-app-title"]')?.getAttribute("content"),
    theme: document.querySelector('meta[name="theme-color"]')?.getAttribute("content"),
    viewport: document.querySelector('meta[name="viewport"]')?.getAttribute("content"),
    splash: [...document.querySelectorAll('link[rel="apple-touch-startup-image"]')].map((l) => ({
      href: l.getAttribute("href"),
      media: l.getAttribute("media"),
    })),
  }));
  check(
    "Apple home-screen tags (capable, black-translucent, title, theme, viewport-fit=cover)",
    head.capable === "yes" && head.status === "black-translucent" && head.title === manifest.name && head.theme === "#000000" && /viewport-fit=cover/.test(head.viewport ?? ""),
    JSON.stringify({ ...head, splash: `${head.splash.length} links` }),
  );
  const splashProblems = [];
  for (const { href, media } of head.splash) {
    const response = await fetch(`${BASE}${href}`);
    const size = pngSize(Buffer.from(await response.arrayBuffer()));
    const [, w, h] = href.match(/(\d+)x(\d+)\.png$/) ?? [];
    const m = media.match(/device-width: (\d+)px\) and \(device-height: (\d+)px\) and \(-webkit-device-pixel-ratio: (\d)\) and \(orientation: (\w+)\)/);
    const expected = m && (m[4] === "portrait" ? [m[1] * m[3], m[2] * m[3]] : [m[2] * m[3], m[1] * m[3]]);
    if (!response.ok || size.width !== Number(w) || size.height !== Number(h) || !expected || expected[0] !== size.width || expected[1] !== size.height) {
      splashProblems.push(`${href} (${response.status}, ${size.width}x${size.height}, media ${media})`);
    }
  }
  check(
    "Splash images exist at the exact pixel size their media query targets",
    head.splash.length >= 30 && splashProblems.length === 0,
    splashProblems.join("; ") || `${head.splash.length} images, portrait + landscape`,
  );

  section("Install experience");
  await page.goto(`${BASE}/`, { waitUntil: "load" });
  const installCard = page.locator("#install-card-title");
  await installCard.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
  check("In a browser tab, Home offers to install the app", await installCard.isVisible());
  note(
    (await page.evaluate(() => Boolean(window.__fantasylabInstall)))
      ? "Chromium offered its install dialog (captured: Install opens it)"
      : "Chromium didn't offer its install dialog here (the Install button shows the steps instead)",
  );
  await page.goto(`${BASE}/settings`, { waitUntil: "load" });
  // Lower cards fade in as they're scrolled to.
  await page.getByText("Install the app", { exact: true }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  check("Settings has an install row", await page.getByText("Install the app", { exact: true }).isVisible());
  // The installed app, as iPhone reports it (navigator.standalone), in a separate tab.
  const appPage = await context.newPage();
  await appPage.addInitScript(() => Object.defineProperty(Navigator.prototype, "standalone", { get: () => true, configurable: true }));
  await appPage.goto(`${BASE}/`, { waitUntil: "load" });
  check(
    "The installed app is recognised before the first paint (html[data-standalone])",
    await appPage.evaluate(() => document.documentElement.hasAttribute("data-standalone")),
  );
  await appPage.locator("#bring-team-title").waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
  check("The installed app with no team offers to bring it over", await appPage.locator("#bring-team-title").isVisible());
  check("No install card inside the installed app", (await appPage.locator("#install-card-title").count()) === 0);
  await appPage.close();

  section("Online browsing (fills the caches)");
  for (const p of ["/games", "/team", "/feed", "/auth/sign-in", "/"]) {
    await page.goto(`${BASE}${p}`, { waitUntil: "networkidle", timeout: 60_000 });
  }
  await page.goto(`${BASE}/games`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(1500);
  // The app's own polling plus two direct calls, so there's definitely /api traffic to inspect.
  const apiStatuses = await page.evaluate(async () => {
    const a = await fetch("/api/teams", { cache: "no-store" });
    const b = await fetch("/api/scoreboard", { cache: "no-store" });
    return [a.status, b.status];
  });
  const apiSeen = seen.filter((r) => r.path.startsWith("/api/"));
  check(
    "No /api response was answered by the service worker (online)",
    apiSeen.length > 0 && apiSeen.every((r) => !r.sw),
    `${apiSeen.length} /api responses, all straight from the network (statuses of direct calls: ${apiStatuses.join(", ")})`,
  );
  const rscSeen = seen.filter((r) => r.rsc);
  check(
    "No in-app navigation data (RSC) was answered by the service worker",
    rscSeen.every((r) => !r.sw),
    `${rscSeen.length} RSC responses checked`,
  );
  const cached = await dumpCaches(page);
  const allUrls = Object.values(cached).flat();
  const names = Object.keys(cached);
  note(`caches: ${names.map((n) => `${n} (${cached[n].length})`).join(", ")}`);
  check("Cache names carry the build version", names.length > 0 && names.every((n) => n.endsWith(`-${version1}`)), names.join(", "));
  check(
    "Nothing from /api/ or /auth/ is stored in any cache",
    allUrls.every((u) => !/^\/(api|auth)(\/|$)/.test(new URL(u).pathname)),
    `${allUrls.length} cached URLs inspected`,
  );
  const pagesCache = cached[names.find((n) => n.includes("-pages-"))] ?? [];
  check(
    "Visited pages are saved for offline use",
    ["/", "/team", "/feed"].every((p) => pagesCache.some((u) => new URL(u).pathname === p)),
    pagesCache.map((u) => new URL(u).pathname).join(", "),
  );
  check(
    "Game pages (live scores inside the page) are never saved",
    pagesCache.every((u) => !/^\/games(\/|$)/.test(new URL(u).pathname)),
    pagesCache.map((u) => new URL(u).pathname).join(", "),
  );
  const staticCache = cached[names.find((n) => n.includes("-static-"))] ?? [];
  check(
    "Offline page and app files are cached (cache-first)",
    staticCache.some((u) => new URL(u).pathname === "/offline") && staticCache.some((u) => u.includes("/_next/static/")),
    `${staticCache.length} entries, e.g. ${staticCache.filter((u) => u.includes("/_next/static/")).length} under /_next/static`,
  );
  const imagesCache = cached[names.find((n) => n.includes("-images-"))] ?? [];
  if (imagesCache.length > 0) {
    const sample = await page.evaluate(async ([name, url]) => {
      const response = await (await caches.open(name)).match(url);
      return { status: response?.status, type: response?.type, contentType: response?.headers.get("content-type") };
    }, [names.find((n) => n.includes("-images-")), imagesCache[0]]);
    check(
      "ESPN images are cached as readable (non-opaque) responses",
      imagesCache.every((u) => new URL(u).hostname === "a.espncdn.com") && sample.status === 200,
      `${imagesCache.length} images; sample ${JSON.stringify(sample)}`,
    );
  } else {
    note("SKIP  ESPN image cache: no ESPN images loaded (no internet for the browser?)");
  }

  section("Offline (device has no connection)");
  await context.setOffline(true);
  await page.waitForTimeout(300);
  check("Offline indicator appears", await page.locator('[data-pwa="offline-indicator"]').isVisible());
  const offlineApi = await page.evaluate(async () => {
    try {
      const r = await fetch("/api/teams", { cache: "no-store" });
      return `answered ${r.status}`;
    } catch (error) {
      return `failed: ${error.name}`;
    }
  });
  check("Offline, /api requests fail (no saved copy is served)", offlineApi.startsWith("failed"), offlineApi);
  await context.setOffline(false);
  await page.waitForTimeout(300);
  check("Offline indicator hides when back online", (await page.locator('[data-pwa="offline-indicator"]').count()) === 0);

  section("Offline (server unreachable)");
  proxy.state.mode = "down";
  let response = await page.goto(`${BASE}/feed`, { waitUntil: "load" });
  check(
    "Navigating to a visited page shows its saved copy",
    response?.status() === 200 && response.fromServiceWorker() && (await page.title()).startsWith("Plays"),
    `status ${response?.status()}, from service worker: ${response?.fromServiceWorker()}, title "${await page.title()}"`,
  );
  response = await page.reload({ waitUntil: "load" });
  check(
    "Reloading a visited page while offline works",
    response?.fromServiceWorker() && (await page.title()).startsWith("Plays"),
    `title "${await page.title()}"`,
  );
  const offlineApi2 = await page.evaluate(async () => {
    try {
      return `answered ${(await fetch("/api/scoreboard", { cache: "no-store" })).status}`;
    } catch (error) {
      return `failed: ${error.name}`;
    }
  });
  check("Server unreachable, /api requests fail (never served from cache)", offlineApi2.startsWith("failed"), offlineApi2);
  const here = () => new URL(page.url()).pathname + new URL(page.url()).search;
  await page.goto(`${BASE}/games`, { waitUntil: "load" });
  await page.waitForTimeout(800);
  check(
    "A visited game page offline shows the offline page, never old scores",
    (await heading(page)) === "You're offline" && here() === "/offline?from=%2Fgames",
    `h1 "${await heading(page)}", address ${here()}`,
  );
  response = await page.goto(`${BASE}/trades/calculator`, { waitUntil: "load" });
  await page.waitForTimeout(800);
  check(
    "Navigating to a page never visited shows the offline page",
    response?.fromServiceWorker() && (await heading(page)) === "You're offline" && here() === "/offline?from=%2Ftrades%2Fcalculator",
    `h1 "${await heading(page)}", address ${here()}`,
  );
  const savedLinks = await page.locator("[data-saved-screen]").count();
  check("Offline page lists the screens saved on this device", savedLinks > 0, `${savedLinks} saved screens listed`);
  if (savedLinks > 0) {
    const target = await page.locator("[data-saved-screen]").first().getAttribute("href");
    await Promise.all([page.waitForURL((u) => u.pathname + u.search === target), page.locator("[data-saved-screen]").first().click()]);
    await page.waitForLoadState("load");
    check("Tapping a saved screen opens it offline", (await heading(page)) !== "You're offline", `${target} → h1 "${await heading(page)}"`);
  }
  // In-app navigation (tab bar) while offline: Next.js falls back to a full page load, which the
  // worker answers. (With next.config `experimental.useOffline` it would wait for the connection instead.)
  await page.goto(`${BASE}/feed`, { waitUntil: "load" });
  await page.locator('nav[aria-label="Main"] a[href="/players"]:visible').first().click();
  await page.waitForTimeout(3000);
  check(
    "Tab-bar navigation while offline opens a saved copy or the offline page (doesn't hang or error)",
    !page.url().startsWith("chrome-error") && new URL(page.url()).pathname !== "/feed" && (await heading(page)) !== null,
    `now at ${here()}, h1 "${await heading(page)}"`,
  );
  // Back online, "Try again" on the offline page returns to the screen that couldn't load.
  await page.goto(`${BASE}/trades/calculator`, { waitUntil: "load" });
  proxy.state.mode = "up";
  await Promise.all([
    page.waitForURL((u) => u.pathname === "/trades/calculator", { timeout: 15_000 }),
    page.getByRole("button", { name: "Try again" }).click(),
  ]);
  await page.waitForLoadState("load");
  check("Back online, \"Try again\" opens the screen that couldn't load", (await heading(page)) !== "You're offline", `${here()}, h1 "${await heading(page)}"`);

  section("Slow network (no answer within 3 s)");
  await page.goto(`${BASE}/team`, { waitUntil: "load" });
  proxy.state.mode = "slow-html";
  const started = Date.now();
  response = await page.goto(`${BASE}/feed`, { waitUntil: "domcontentloaded" });
  const elapsed = Date.now() - started;
  check(
    "A slow page falls back to its saved copy after about 3 s",
    response?.fromServiceWorker() && elapsed < 5500 && (await page.title()).startsWith("Plays"),
    `shown after ${elapsed} ms (server answers after 6000 ms)`,
  );
  await page.waitForTimeout(4000); // let the slow response finish and refresh the saved copy
  const startedLive = Date.now();
  response = await page.goto(`${BASE}/games`, { waitUntil: "domcontentloaded" });
  const elapsedLive = Date.now() - startedLive;
  check(
    "A slow game page waits for fresh scores (no saved copy to fall back to)",
    elapsedLive >= 5500 && (await page.title()).startsWith("Games"),
    `shown after ${elapsedLive} ms, title "${await page.title()}"`,
  );
  proxy.state.mode = "up";

  section("Dynamic data is never served from the cache (summary)");
  const allApi = seen.filter((r) => r.path.startsWith("/api/"));
  check(
    "Across the whole run, zero /api responses came from the service worker",
    allApi.length > 0 && allApi.every((r) => !r.sw),
    `${allApi.length} /api responses observed`,
  );

  if (!flag("--skip-update")) {
    section("New deployment → update prompt");
    await nextServer.stop();
    nextServer = null;
    await run("npx", ["next", "build"], "second next build");
    nextServer = await startServer(["next", "start", "-p", String(NEXT_PORT)], NEXT_PORT, "/offline");
    const assetsBuild2 = await staticAssetsOf("/");
    const changed = [...assetsBuild2].filter((a) => !assetsBuild1.has(a));
    check("The new build changed at least one app file", changed.length > 0, `${changed.length} new file names, e.g. ${changed[0]}`);

    const before = await dumpCaches(page);
    await page.reload({ waitUntil: "load" });
    await page.evaluate(() => {
      window.__pwaMarker = "still here";
    });
    const prompt = page.locator('[data-pwa="update-prompt"]');
    await prompt.waitFor({ state: "visible", timeout: 60_000 });
    check("The update prompt appears", true, `prompt text: "${(await prompt.innerText()).replace(/\s+/g, " ")}"`);
    await page.waitForTimeout(3000);
    check(
      "Nothing reloads by itself while the prompt waits",
      (await page.evaluate(() => window.__pwaMarker)) === "still here" && versionOf(await controllerUrl(page)) === version1,
      `controller still v=${versionOf(await controllerUrl(page))}`,
    );
    await Promise.all([page.waitForEvent("load", { timeout: 30_000 }), prompt.getByRole("button", { name: "Update" }).click()]);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 30_000 });
    const version2 = versionOf(await controllerUrl(page));
    check("Tapping Update switches to the new worker and reloads once", version2 && version2 !== version1, `v=${version1} → v=${version2}`);
    await page.waitForTimeout(1500);
    const after = await dumpCaches(page);
    check(
      "Old caches are deleted",
      Object.keys(after).every((n) => !n.endsWith(`-${version1}`)) && Object.keys(after).length > 0,
      `before: ${Object.keys(before).join(", ")}\n      after: ${Object.keys(after).join(", ")}`,
    );
    check("Prompt is gone after the update", (await prompt.count()) === 0);
    proxy.state.mode = "down";
    response = await page.reload({ waitUntil: "load" });
    check("After the update, reloading offline still works", response?.fromServiceWorker() && (await heading(page)) !== null, `h1 "${await heading(page)}"`);
    proxy.state.mode = "up";
  }

  check("No uncaught page errors", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
  await context.close();
  context = null;

  if (!flag("--skip-dev")) {
    section("Development server");
    const dev = await startServer(["next", "dev", "-p", String(DEV_PORT)], DEV_PORT, "/offline");
    const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
    const devPage = await browser.newPage();
    await devPage.goto(`http://localhost:${DEV_PORT}/`, { waitUntil: "load", timeout: 120_000 });
    await devPage.waitForTimeout(4000);
    const registrations = await devPage.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length);
    check("`next dev` never registers the worker", registrations === 0, `${registrations} registrations`);
    await browser.close();
    await dev.stop();
  }
} catch (error) {
  check("Run completed", false, String(error?.stack ?? error).slice(0, 2000));
} finally {
  await context?.close().catch(() => {});
  proxy?.close();
  await nextServer?.stop();
  await rm(profile, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
process.exit(failed.length ? 1 : 0);
