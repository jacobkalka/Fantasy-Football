/**
 * Keeps the team on this device and the team in your account in step.
 *
 * - On sign-in it compares the two copies and keeps the right one
 *   (rules in lib/roster/sync.ts), then tells you which won.
 * - After that, every edit is saved to your account about a second after you
 *   stop tapping (one save instead of one per tap).
 * - If you're offline or the save fails, the device copy is untouched; it keeps
 *   retrying (sooner when the connection comes back).
 *
 * Driven by <RosterSync /> (mounted once, in the header). Screens read the
 * status with useRosterSync().
 */
import { useSyncExternalStore } from "react";
import type { Player } from "@/lib/providers/types";
import type { Roster } from "@/lib/roster/lineup";
import { primaryRoster } from "@/lib/roster/store";
import {
  decideSync,
  fromAccountRoster,
  retryDelay,
  rosterSignature,
  syncNotice,
  type PlayerInfo,
  type SyncMemory,
} from "@/lib/roster/sync";
import { requireSupabase } from "./client";
import { friendlyDbError, isNetworkError } from "./db-errors";
import { createAccountRoster, fetchAccountRoster, RosterGoneError, saveAccountRoster } from "./rosters";

const MEMORY_KEY = "fantasylab:roster-sync:v1";
/** Where this was saved before the app was renamed; read once if the new key is empty. */
const LEGACY_MEMORY_KEY = "the-feed:roster-sync:v1";
/** Wait this long after the last edit before saving. */
const DEBOUNCE_MS = 1_200;

export type SyncPhase =
  | "off" // signed out (or accounts not set up)
  | "checking" // comparing device and account after sign-in
  | "waiting" // edits made, about to save
  | "saving"
  | "synced"
  | "offline" // no connection; will retry
  | "error"; // the save failed; will retry

export interface RosterSyncState {
  phase: SyncPhase;
  lastSyncedAt: string | null;
  /** A one-off message ("Loaded your saved team"), shown briefly. */
  notice: { id: number; text: string } | null;
  /** What went wrong, in plain English, while phase is offline/error. */
  problem: string | null;
}

let state: RosterSyncState = { phase: "off", lastSyncedAt: null, notice: null, problem: null };
const listeners = new Set<() => void>();

function setState(patch: Partial<RosterSyncState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

// ── What this device remembers about its last sync ────────────────────────────

function readMemory(): SyncMemory | null {
  try {
    const raw = window.localStorage.getItem(MEMORY_KEY) ?? window.localStorage.getItem(LEGACY_MEMORY_KEY);
    const parsed = raw ? (JSON.parse(raw) as SyncMemory) : null;
    return parsed && typeof parsed.userId === "string" && typeof parsed.signature === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function writeMemory(next: SyncMemory | null) {
  memory = next;
  try {
    if (next) window.localStorage.setItem(MEMORY_KEY, JSON.stringify(next));
    else window.localStorage.removeItem(MEMORY_KEY);
  } catch {
    // Storage blocked: sync still works for this visit.
  }
}

// ── Engine state ──────────────────────────────────────────────────────────────

let memory: SyncMemory | null = null;
let userId: string | null = null;
/** Bumped on every start/stop so answers from an older session are ignored. */
let generation = 0;
let latest: Roster | null = null;
let ready = false; // the first comparison after sign-in is done
let rosterId: string | undefined;
let failures = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let saving: Promise<void> | null = null;
let noticeCount = 0;

function inSync(): boolean {
  return Boolean(latest && memory && userId && memory.userId === userId && memory.signature === rosterSignature(latest));
}

function fail(gen: number, error: unknown, retry: () => void) {
  if (gen !== generation) return;
  failures += 1;
  const offline = isNetworkError(error);
  if (!offline) console.error("roster sync failed", error);
  setState({
    phase: offline ? "offline" : "error",
    problem: offline
      ? "You're offline. Your team is safe on this device and will be saved to your account when you're back online."
      : `${friendlyDbError(error, "save")} Your team is safe on this device.`,
  });
  clearTimeout(timer);
  timer = setTimeout(retry, retryDelay(failures));
}

/** Names and photos for players loaded from the account (the database only stores ids). */
async function loadPlayerInfo(): Promise<Map<string, PlayerInfo>> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch("/api/players");
      if (response.ok) {
        const body = (await response.json()) as { players?: Player[] };
        return new Map(
          (body.players ?? []).map((p) => [
            p.id,
            { name: p.name, position: p.position, teamId: p.teamId, headshot: p.headshot },
          ]),
        );
      }
    } catch {
      // Try again below.
    }
    await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
  }
  return new Map();
}

/** First comparison after sign-in: decide which copy wins and apply it. */
async function initialSync(gen: number) {
  const uid = userId;
  if (gen !== generation || !uid || !latest) return;
  setState({ phase: "checking" });
  try {
    const supabase = await requireSupabase();
    const account = await fetchAccountRoster(supabase, uid);
    if (gen !== generation || !latest) return;
    const decision = decideSync({ local: latest, account, memory, userId: uid });
    rosterId = account?.id;

    if (decision.action === "pull" && account) {
      const info = await loadPlayerInfo();
      if (gen !== generation) return;
      const pulled = fromAccountRoster(account, (id) => info.get(id));
      writeMemory({ userId: uid, signature: rosterSignature(account), rosterId: account.id, syncedAt: new Date().toISOString() });
      // The device copy now matches the account, so this doesn't trigger a save.
      latest = pulled;
      primaryRoster.actions.replace(pulled);
    } else if (decision.action === "push") {
      await pushOnce(gen);
      if (gen !== generation) return;
    } else {
      writeMemory({ userId: uid, signature: rosterSignature(latest), rosterId, syncedAt: new Date().toISOString() });
    }

    ready = true;
    failures = 0;
    const text = syncNotice(decision);
    setState({
      phase: "synced",
      lastSyncedAt: new Date().toISOString(),
      problem: null,
      notice: text ? { id: ++noticeCount, text } : state.notice,
    });
    // Edits made while we were checking still need saving.
    if (!inSync()) schedulePush(0);
  } catch (error) {
    fail(gen, error, () => void initialSync(gen));
  }
}

/** Saves the current device roster to the account once. Throws on failure. */
async function pushOnce(gen: number) {
  const uid = userId;
  const roster = latest;
  if (!uid || !roster) return;
  const signature = rosterSignature(roster);
  const supabase = await requireSupabase();
  const knownId = rosterId ?? (memory?.userId === uid ? memory.rosterId : undefined);
  let id = knownId ?? (await createAccountRoster(supabase, roster));
  rosterId = id;
  try {
    await saveAccountRoster(supabase, id, roster);
  } catch (error) {
    if (!(error instanceof RosterGoneError)) throw error;
    // Deleted elsewhere: start a fresh one.
    id = await createAccountRoster(supabase, roster);
    rosterId = id;
    await saveAccountRoster(supabase, id, roster);
  }
  if (gen !== generation) return;
  writeMemory({ userId: uid, signature, rosterId: id, syncedAt: new Date().toISOString() });
}

/** Saves until the account matches the device (edits can land mid-save). */
async function pushLoop(gen: number) {
  try {
    while (gen === generation && !inSync()) {
      setState({ phase: "saving" });
      await pushOnce(gen);
    }
    if (gen !== generation) return;
    failures = 0;
    setState({ phase: "synced", lastSyncedAt: new Date().toISOString(), problem: null });
  } catch (error) {
    fail(gen, error, () => schedulePush(0));
  }
}

function schedulePush(delay: number) {
  clearTimeout(timer);
  const gen = generation;
  timer = setTimeout(() => {
    if (gen !== generation || !ready) return;
    if (saving) {
      // A save is running; check again when it finishes.
      void saving.then(() => schedulePush(0));
      return;
    }
    saving = pushLoop(gen).finally(() => {
      saving = null;
    });
  }, delay);
}

function onOnline() {
  if (!userId) return;
  if (state.phase === "offline" || state.phase === "error") {
    failures = 0;
    if (ready) schedulePush(0);
    else void initialSync(generation);
  }
}

function stop() {
  generation += 1;
  clearTimeout(timer);
  if (typeof window !== "undefined") window.removeEventListener("online", onOnline);
  userId = null;
  ready = false;
  rosterId = undefined;
  failures = 0;
  if (state.phase !== "off") setState({ phase: "off", problem: null });
}

// ── Public controls ───────────────────────────────────────────────────────────

export const rosterSync = {
  /** Start syncing for this account (safe to call repeatedly). */
  start(uid: string, roster: Roster) {
    latest = roster;
    if (userId === uid) return;
    stop();
    memory = readMemory();
    userId = uid;
    generation += 1;
    window.addEventListener("online", onOnline);
    void initialSync(generation);
  },

  /** Stop syncing (signed out). The device copy and memory are left alone. */
  stop,

  /** Tell the engine the device roster changed. */
  localChanged(roster: Roster) {
    latest = roster;
    if (!userId || !ready) return;
    if (inSync()) {
      if (state.phase === "waiting") setState({ phase: "synced" });
      return;
    }
    if (state.phase !== "offline" && state.phase !== "error") setState({ phase: "waiting" });
    schedulePush(DEBOUNCE_MS);
  },

  /** Save right now if needed. True when the account copy matches the device afterwards. */
  async flush(): Promise<boolean> {
    if (!userId || !ready) return false;
    clearTimeout(timer);
    if (saving) await saving;
    if (inSync()) return true;
    const gen = generation;
    try {
      await pushOnce(gen);
      return inSync();
    } catch {
      return false;
    }
  },

  /** Retry now (the "Try again" button). */
  retry() {
    onOnline();
  },

  /** True when the device copy is already saved in the account. */
  isInSync: inSync,

  /** True when the device roster has any players. */
  hasLocalPlayers: () => Boolean(latest && latest.players.length > 0),

  /** Forget the last sync (after signing out and clearing the device copy). */
  forget() {
    writeMemory(null);
    setState({ lastSyncedAt: null });
  },

  /** Show a short message in the header notice (e.g. after signing out). */
  announce(text: string) {
    setState({ notice: { id: ++noticeCount, text } });
  },

  dismissNotice() {
    if (state.notice) setState({ notice: null });
  },
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const OFF: RosterSyncState = { phase: "off", lastSyncedAt: null, notice: null, problem: null };

/** The sync status, for the account page and the header. */
export function useRosterSync(): RosterSyncState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => OFF,
  );
}
