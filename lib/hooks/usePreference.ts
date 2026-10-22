"use client";

import { useCallback, useSyncExternalStore } from "react";

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** A small setting remembered on this device (e.g. Field vs List view). Falls back gracefully. */
export function usePreference<T extends string>(key: string, fallback: T): [T, (value: T) => void] {
  const read = useCallback(() => {
    try {
      return (window.localStorage.getItem(`the-feed:pref:${key}`) as T | null) ?? fallback;
    } catch {
      return fallback;
    }
  }, [key, fallback]);
  const value = useSyncExternalStore(subscribe, read, () => fallback);
  const set = useCallback(
    (next: T) => {
      try {
        window.localStorage.setItem(`the-feed:pref:${key}`, next);
      } catch {
        // Storage blocked (private mode): the choice lasts until the page closes.
      }
      listeners.forEach((l) => l());
    },
    [key],
  );
  return [value, set];
}
