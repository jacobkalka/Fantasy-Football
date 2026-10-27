"use client";

/**
 * Your preferences and personal lists, saved on this device:
 * - league size (team ratings and "likely available" depend on it),
 * - visual effects (liquid glass on or off) and the touchdown sound,
 * - a watchlist of players you're keeping an eye on,
 * - players you've marked as already taken in your league (so pickups skip them).
 * The scoring format lives with the roster (it belongs to the team).
 */
import { applyMotionPreference, type MotionPreference } from "@/lib/motion/preference";

export type { MotionPreference };
import { createPersistedStore } from "@/lib/storage/persisted";

export const LEAGUE_SIZES = [8, 10, 12, 14, 16] as const;
export type LeagueSize = (typeof LEAGUE_SIZES)[number];

export interface AppSettings {
  version: 1;
  leagueSize: LeagueSize;
  glass: "auto" | "off";
  /** Animations: follow the device's Reduce Motion setting, or always full / always reduced. */
  motion: MotionPreference;
  /** A short sound when one of your players scores a touchdown (off unless switched on). */
  tdSound: "off" | "on";
  watchlist: string[];
  taken: string[];
}


export function defaultSettings(): AppSettings {
  return { version: 1, leagueSize: 12, glass: "auto", motion: "device", tdSound: "off", watchlist: [], taken: [] };
}

const ids = (value: unknown, max: number) =>
  Array.isArray(value)
    ? [...new Set(value.filter((v): v is string => typeof v === "string" && v.length > 0 && v.length < 24))].slice(0, max)
    : [];

export function migrateSettings(raw: unknown): AppSettings | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const base = defaultSettings();
  return {
    version: 1,
    leagueSize: LEAGUE_SIZES.includes(r.leagueSize as LeagueSize) ? (r.leagueSize as LeagueSize) : base.leagueSize,
    glass: r.glass === "off" ? "off" : "auto",
    motion: r.motion === "full" || r.motion === "reduced" ? r.motion : "device",
    tdSound: r.tdSound === "on" ? "on" : "off",
    watchlist: ids(r.watchlist, 100),
    taken: ids(r.taken, 400),
  };
}

export const settingsStore = createPersistedStore<AppSettings>({
  key: "settings",
  defaults: defaultSettings,
  migrate: migrateSettings,
});

export function useSettings() {
  return settingsStore.use();
}

const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [id, ...list]);

export const settingsActions = {
  setLeagueSize(leagueSize: LeagueSize) {
    settingsStore.set((s) => ({ ...s, leagueSize }));
  },
  setGlass(glass: "auto" | "off") {
    settingsStore.set((s) => ({ ...s, glass }));
  },
  setMotion(motion: MotionPreference) {
    settingsStore.set((s) => ({ ...s, motion }));
    applyMotionPreference(motion);
  },
  setTdSound(tdSound: "off" | "on") {
    settingsStore.set((s) => ({ ...s, tdSound }));
  },
  toggleWatch(playerId: string) {
    settingsStore.set((s) => ({ ...s, watchlist: toggle(s.watchlist, playerId) }));
  },
  toggleTaken(playerId: string) {
    settingsStore.set((s) => ({ ...s, taken: toggle(s.taken, playerId) }));
  },
  clearTaken() {
    settingsStore.set((s) => ({ ...s, taken: [] }));
  },
};
