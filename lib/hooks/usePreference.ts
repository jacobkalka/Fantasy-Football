"use client";

import { useCallback, useSyncExternalStore } from "react";
import { STORAGE_PREFIX } from "@/lib/storage/persisted";

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * A small setting remembered on this device (e.g. Field vs List view). Falls back
 * gracefully, and picks up the value saved under the app's old name ("the-feed:pref:").
 */
export function usePreference<T extends string>(key: string, fallback: T): [T, (value: T) => void] {
  const storageKey = `${STORAGE_PREFIX}pref:${key}`;
  const read = useCallback(() => {
    try {
      return (
        (window.localStorage.getItem(storageKey) as T | null) ??
        (window.localStorage.getItem(`the-feed:pref:${key}`) as T | null) ??
        fallback
      );
    } catch {
      return fallback;
    }
  }, [storageKey, key, fallback]);
  const value = useSyncExternalStore(subscribe, read, () => fallback);
  const set = useCallback(
    (next: T) => {
      try {
        window.localStorage.setItem(storageKey, next);
      } catch {
        // Storage blocked (private mode): the choice lasts until the page closes.
      }
      listeners.forEach((l) => l());
    },
    [storageKey],
  );
  return [value, set];
}
