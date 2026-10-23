"use client";

/**
 * Saved-on-this-device data, done carefully (DECISIONS.md, "Saved data").
 *
 * - Versioned: each value carries `version`; older versions are migrated forward, never dropped.
 * - Renamed keys: values saved under an old key (the app used to be "The Feed") are read once
 *   and copied to the new key; the old copy is left in place as a backup.
 * - Never silently wiped: anything unreadable is copied to `<key>:unreadable:<time>` before the
 *   app falls back to defaults, so a bug can't destroy someone's team.
 * - Every screen and every open tab sees the same value (one store, `storage` events).
 * - Private mode / storage full: the value still works for this visit.
 */
import { useSyncExternalStore } from "react";

export const STORAGE_PREFIX = "fantasylab:";

export interface PersistedStore<T> {
  get(): T;
  set(next: T | ((current: T) => T)): void;
  subscribe(listener: () => void): () => void;
  /** React hook: the value, plus whether it has been read from this device yet. */
  use(): { value: T; ready: boolean };
  /** For tests and "reset" buttons. */
  reset(): void;
}

export function createPersistedStore<T extends { version: number }>(options: {
  key: string;
  /** Keys this value used to live under, newest first. */
  legacyKeys?: string[];
  defaults: () => T;
  /**
   * Turn whatever was stored into the current shape, or return null if it can't be used.
   * Receives the parsed JSON of any version.
   */
  migrate: (raw: unknown) => T | null;
}): PersistedStore<T> {
  const { key, legacyKeys = [], defaults, migrate } = options;
  const fullKey = key.startsWith(STORAGE_PREFIX) ? key : STORAGE_PREFIX + key;
  const fallback = defaults();
  let current: T | null = null;
  const listeners = new Set<() => void>();

  const backup = (raw: string) => {
    try {
      window.localStorage.setItem(`${fullKey}:unreadable:${Date.now()}`, raw);
    } catch {
      // Nowhere to put it; the original stays where it was because we never overwrite on read.
    }
  };

  const readKey = (storageKey: string): { found: boolean; value: T | null } => {
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(storageKey);
    } catch {
      return { found: false, value: null };
    }
    if (raw == null) return { found: false, value: null };
    try {
      const value = migrate(JSON.parse(raw));
      if (value == null) backup(raw);
      return { found: true, value };
    } catch {
      backup(raw);
      return { found: true, value: null };
    }
  };

  const read = (): T => {
    if (current) return current;
    if (typeof window === "undefined") return fallback;
    const own = readKey(fullKey);
    if (own.value) {
      current = own.value;
      return current;
    }
    if (!own.found) {
      for (const legacy of legacyKeys) {
        const old = readKey(legacy);
        if (old.value) {
          current = old.value;
          persist(current);
          return current;
        }
      }
    }
    current = fallback;
    return current;
  };

  const persist = (value: T) => {
    try {
      window.localStorage.setItem(fullKey, JSON.stringify(value));
    } catch {
      // Private browsing or storage full: the value still works until the tab closes.
    }
  };

  const store: PersistedStore<T> = {
    get: read,
    set(next) {
      const value = typeof next === "function" ? (next as (c: T) => T)(read()) : next;
      current = value;
      persist(value);
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      const onStorage = (event: StorageEvent) => {
        if (event.key === fullKey) {
          current = null;
          listener();
        }
      };
      window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", onStorage);
      };
    },
    use() {
      const value = useSyncExternalStore(store.subscribe, read, () => fallback);
      const ready = useSyncExternalStore(
        store.subscribe,
        () => true,
        () => false,
      );
      return { value, ready };
    },
    reset() {
      current = null;
      try {
        window.localStorage.removeItem(fullKey);
      } catch {
        // ignore
      }
      listeners.forEach((listener) => listener());
    },
  };
  return store;
}

/** Ask the browser to keep this site's saved data even when the device is low on space. */
export async function requestDurableStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return navigator.storage?.persist ? await navigator.storage.persist() : false;
  } catch {
    return false;
  }
}
