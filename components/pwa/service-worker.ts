"use client";

/**
 * Registers public/sw.js (production builds only) and tracks whether a new version is waiting.
 *
 * Every deployment registers /sw.js?v=<build id> (PWA_BUILD_ID, set in next.config.ts), so the
 * browser installs a new worker. It waits until the person taps "Update" (never swapped in under
 * a page that's being used), then takes over and the page reloads once.
 */

export interface PwaUpdateState {
  /** A new version is installed and waiting for the go-ahead. */
  updateReady: boolean;
  /** "Update" was tapped; the page reloads in a moment. */
  updating: boolean;
}

const SCRIPT_PATH = "/sw.js";
const UPDATE_CHECK_EVERY_MS = 30 * 60 * 1000;

const SERVER_STATE: PwaUpdateState = { updateReady: false, updating: false };
let state: PwaUpdateState = SERVER_STATE;
const listeners = new Set<() => void>();
let registration: ServiceWorkerRegistration | null = null;
let started = false;
let reloadRequested = false;
let reloaded = false;

function setState(next: PwaUpdateState) {
  if (next.updateReady === state.updateReady && next.updating === state.updating) return;
  state = next;
  for (const listener of listeners) listener();
}

export function subscribePwaUpdate(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getPwaUpdateState() {
  return state;
}

export function getServerPwaUpdateState() {
  return SERVER_STATE;
}

/** The build id a worker script URL was registered with (a number), or null. */
function versionOf(scriptURL: string): number | null {
  const value = Number(new URL(scriptURL).searchParams.get("v"));
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Starts registration once per page load. Safe to call from every component that needs it. */
export function startServiceWorker() {
  if (started || typeof window === "undefined") return;
  started = true;
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return;

  if (process.env.NODE_ENV !== "production") {
    // `next dev`: never cache. Remove a worker left over from a production build on this address.
    void removeWorkers();
    return;
  }

  // Register after the page has finished loading so the worker's downloads don't compete with it.
  if (document.readyState === "complete") void register();
  else window.addEventListener("load", () => void register(), { once: true });
}

async function register() {
  const build = process.env.PWA_BUILD_ID ?? "0";
  try {
    let current = (await navigator.serviceWorker.getRegistration("/")) ?? null;
    const newest = current && (current.installing ?? current.waiting ?? current.active);
    const installed = newest ? versionOf(newest.scriptURL) : null;
    // A page from an older build (e.g. a saved copy shown offline) must not downgrade the worker.
    if (!current || installed === null || Number(build) >= installed) {
      current = await navigator.serviceWorker.register(`${SCRIPT_PATH}?v=${encodeURIComponent(build)}`, {
        scope: "/",
        updateViaCache: "none",
      });
    }
    watch(current);
  } catch (error) {
    console.warn("Offline support couldn't start:", error);
  }
}

function watch(reg: ServiceWorkerRegistration) {
  registration = reg;
  const check = () =>
    setState({ updateReady: Boolean(reg.waiting && reg.active), updating: state.updating && !reloaded });

  check();
  reg.addEventListener("updatefound", () => {
    const worker = reg.installing;
    worker?.addEventListener("statechange", () => {
      if (worker.state === "installed" || worker.state === "redundant") check();
    });
  });

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // Only the tab where "Update" was tapped reloads; other open tabs keep working as they are.
    if (reloadRequested && !reloaded) {
      reloaded = true;
      window.location.reload();
      return;
    }
    check();
  });

  // Apps left open for days (especially on phones) still notice new versions of the worker.
  let lastCheck = Date.now();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || Date.now() - lastCheck < UPDATE_CHECK_EVERY_MS) return;
    lastCheck = Date.now();
    reg.update().catch(() => {});
  });
}

/** Activates the waiting version and reloads this page once it has taken over. */
export function applyPwaUpdate() {
  const waiting = registration?.waiting;
  if (!waiting) return;
  reloadRequested = true;
  setState({ updateReady: true, updating: true });
  waiting.postMessage({ type: "SKIP_WAITING" });
  // Fallback in case the takeover event never arrives (e.g. this page wasn't controlled).
  window.setTimeout(() => {
    if (!reloaded) {
      reloaded = true;
      window.location.reload();
    }
  }, 4000);
}

async function removeWorkers() {
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    registrations
      .filter((reg) => {
        const worker = reg.active ?? reg.waiting ?? reg.installing;
        return worker && new URL(worker.scriptURL).pathname === SCRIPT_PATH;
      })
      .map((reg) => reg.unregister()),
  );
  if ("caches" in window) {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith("fantasylab-")).map((name) => caches.delete(name)));
  }
}
