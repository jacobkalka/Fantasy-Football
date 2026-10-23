"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  applyPwaUpdate,
  getPwaUpdateState,
  getServerPwaUpdateState,
  startServiceWorker,
  subscribePwaUpdate,
} from "./service-worker";

/**
 * Whether a new version of the app is waiting, and the action that switches to it.
 * Using this hook also starts the service worker (production builds only).
 */
export function usePwaUpdate() {
  useEffect(() => {
    startServiceWorker();
  }, []);
  const state = useSyncExternalStore(subscribePwaUpdate, getPwaUpdateState, getServerPwaUpdateState);
  return { ...state, applyUpdate: applyPwaUpdate };
}

function subscribeConnection(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/**
 * True while the device has no network connection (the browser's online/offline events).
 * False on the server and during hydration, so server and first client render match.
 *
 * Next.js's experimental `useOffline` (next/offline) isn't used: it only works with
 * `experimental.useOffline`, which makes in-app navigation wait for the connection instead of
 * falling back to the service worker's saved pages and offline screen.
 */
export function useIsOffline() {
  return useSyncExternalStore(
    subscribeConnection,
    () => !navigator.onLine,
    () => false,
  );
}
