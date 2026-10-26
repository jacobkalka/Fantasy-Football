"use client";

/**
 * React binding for the shared live-data client (lib/sync/store.ts).
 *
 *   const { data, status } = useLive<TeamLiveResponse>(url, { interval: (d) => (d?.anyLive ? 8000 : 60000) });
 *
 * Every component asking for the same URL shares one entry: one request, one answer, and they
 * all re-render together when it changes. That's what keeps Home, Team, Live and the tracker
 * showing the same points.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { SyncStore, WATCHDOG_MS, type EntryState, type Interval } from "./store";

let store: SyncStore | null = null;

/** The one store for this browser tab, wired to the page lifecycle once. */
export function syncStore(): SyncStore {
  if (store) return store;
  const isBrowser = typeof window !== "undefined";
  const created = new SyncStore({
    fetch: (...args) => fetch(...args),
    now: () => Date.now(),
    isVisible: () => !isBrowser || document.visibilityState === "visible",
    setTimeout: ((fn: () => void, ms?: number) => setTimeout(fn, ms)) as typeof setTimeout,
    clearTimeout: ((id?: ReturnType<typeof setTimeout>) => clearTimeout(id)) as typeof clearTimeout,
  });
  // On the server every render gets its own throwaway store: nothing is shared between visitors.
  if (!isBrowser) return created;
  store = created;
  {
    const s = store;
    const resume = () => s.resume();
    document.addEventListener("visibilitychange", resume);
    // Desktop windows and installed apps can stay "visible" while unfocused; focus is the signal there.
    window.addEventListener("focus", resume);
    // Restored from the back/forward cache: the page's timers were frozen the whole time.
    window.addEventListener("pageshow", (event) => {
      if (event.persisted) s.resume();
    });
    window.addEventListener("online", () => s.resume({ resetBackoff: true }));
    setInterval(() => s.watchdog(), WATCHDOG_MS);
  }
  return store;
}

const EMPTY_SUBSCRIBE = () => () => {};

export interface LiveState<T> extends EntryState<T> {
  /** Ask again now (pull to refresh, Retry buttons). */
  refresh: () => void;
}

export function useLive<T>(
  url: string | null,
  { interval, initial }: { interval: Interval<T>; initial?: T },
): LiveState<T> {
  const s = syncStore();
  // Server-rendered data goes in once, before the first read (ignored if newer data exists).
  useState(() => {
    if (url && initial !== undefined) s.seed(url, initial);
    return null;
  });
  // The latest interval function, without resubscribing on every render.
  const intervalRef = useRef(interval);
  useEffect(() => {
    intervalRef.current = interval;
  });

  const subscribe = useCallback(
    (listener: () => void) =>
      url ? s.subscribe<T>(url, (data) => resolve(intervalRef.current, data), listener) : EMPTY_SUBSCRIBE(),
    [s, url],
  );
  // Server render (and hydration): the seeded data, or empty. Must return the same object every call.
  const serverSnapshot = useRef<EntryState<T> | null>(null);
  const state = useSyncExternalStore(
    subscribe,
    () => s.snapshot<T>(url),
    () => (serverSnapshot.current ??= s.snapshot<T>(url)),
  );
  const refresh = useCallback(() => {
    if (url) void s.fetchNow(url);
  }, [s, url]);
  return { ...state, refresh };
}

function resolve<T>(interval: Interval<T>, data: T | undefined) {
  return typeof interval === "function" ? interval(data) : interval;
}
