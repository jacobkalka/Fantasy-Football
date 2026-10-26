/**
 * The app's one live-data client (DECISIONS.md, "Live data refresh").
 *
 * Every screen that shows server data asks for it by URL through `useLive()` (lib/sync/useLive.ts).
 * This store keeps ONE entry per URL, shared by every screen and component that asks for it:
 *
 * - Deduplication: one request in flight per URL, however many components want it.
 * - Polling: each entry polls at the fastest interval any of its subscribers asks for, and the
 *   interval can depend on the data (every few seconds while games are live, every minute or
 *   more otherwise). Nobody subscribed = no polling.
 * - Foreground: hidden tabs don't poll. Coming back (tab visible, window focused, back from the
 *   browser's back/forward cache, network back online) refreshes everything on screen at once.
 * - Watchdog: desktop browsers and installed apps can freeze timers (sleep, background windows)
 *   without telling the page; a 5-second check refetches anything overdue, so a stalled timer
 *   can't leave old numbers on screen.
 * - Page switches: a screen that mounts gets fresh data if its copy is more than a few seconds old.
 * - Errors: the last good data stays; retries back off (1×, 2×, 4× ... capped at a minute).
 * - Freshness is measured, never assumed: `receivedAt` is when this device got the answer, and the
 *   server's own `ageMs` (how old ESPN's data already was) is added on top (lib/sync/freshness.ts).
 *
 * Framework-free so it can be unit-tested (store.test.ts); the React binding is useLive.ts.
 */

export type Interval<T> = number | ((data: T | undefined) => number);

export interface EntryState<T> {
  data: T | undefined;
  /** Message of the newest failed attempt, null once a request succeeds again. */
  error: string | null;
  /** Device time (ms) the current data arrived. 0 = never. */
  receivedAt: number;
  /** A request is running right now. */
  loading: boolean;
  /** Failed attempts in a row. */
  failures: number;
}

interface Subscriber<T> {
  interval: Interval<T>;
  listener: () => void;
}

interface Entry<T> {
  url: string;
  state: EntryState<T>;
  subscribers: Set<Subscriber<T>>;
  inflight: Promise<void> | null;
  controller: AbortController | null;
  timer: ReturnType<typeof setTimeout> | undefined;
  /** Device time the next poll is due (for the watchdog). */
  dueAt: number;
}

export interface SyncEnvironment {
  fetch: typeof fetch;
  now: () => number;
  isVisible: () => boolean;
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
}

/** A screen that mounts refetches when its copy is older than this. */
export const MOUNT_REFRESH_MS = 3_000;
/** Coming back to the app refetches anything older than this. */
export const RESUME_REFRESH_MS = 2_000;
export const WATCHDOG_MS = 5_000;
const MAX_BACKOFF_MS = 60_000;
/** Entries nobody has looked at for this long are dropped (memory). */
const EVICT_AFTER_MS = 10 * 60_000;

const EMPTY: EntryState<never> = { data: undefined, error: null, receivedAt: 0, loading: false, failures: 0 };

export class SyncStore {
  private entries = new Map<string, Entry<unknown>>();
  private lastUsed = new Map<string, number>();

  constructor(private readonly env: SyncEnvironment) {}

  // ── Reading ────────────────────────────────────────────────────────────────

  snapshot<T>(url: string | null): EntryState<T> {
    if (!url) return EMPTY as EntryState<T>;
    return (this.entries.get(url)?.state as EntryState<T> | undefined) ?? (EMPTY as EntryState<T>);
  }

  /** Put server-rendered data in place so the first paint needs no request. Ignored if newer data exists. */
  seed<T>(url: string, data: T) {
    const entry = this.entry<T>(url);
    if (entry.state.receivedAt > 0) return;
    entry.state = { ...entry.state, data, receivedAt: this.env.now() };
  }

  // ── Subscribing ────────────────────────────────────────────────────────────

  subscribe<T>(url: string, interval: Interval<T>, listener: () => void): () => void {
    const entry = this.entry<T>(url);
    const sub: Subscriber<T> = { interval, listener };
    entry.subscribers.add(sub);
    this.lastUsed.set(url, this.env.now());
    // A screen that just opened wants current numbers, not whatever another screen fetched a while ago.
    const age = this.env.now() - entry.state.receivedAt;
    if (entry.state.receivedAt === 0 || age > MOUNT_REFRESH_MS) void this.fetchNow(url);
    else this.schedule(entry);
    return () => {
      entry.subscribers.delete(sub);
      this.lastUsed.set(url, this.env.now());
      if (entry.subscribers.size === 0) {
        this.env.clearTimeout(entry.timer);
        entry.timer = undefined;
        entry.dueAt = Infinity;
        this.evict();
      }
    };
  }

  // ── Fetching ───────────────────────────────────────────────────────────────

  /** Fetch now (or join the request already running). */
  fetchNow(url: string): Promise<void> {
    const entry = this.entry(url);
    if (entry.inflight) return entry.inflight;
    this.env.clearTimeout(entry.timer);
    const controller = new AbortController();
    entry.controller = controller;
    this.update(entry, { loading: true });
    entry.inflight = (async () => {
      try {
        const response = await this.env.fetch(url, { signal: controller.signal, cache: "no-store" });
        const body = (await response.json().catch(() => ({}))) as unknown;
        if (!response.ok) {
          const message = (body as { error?: string } | null)?.error;
          throw new Error(message ?? `Request failed (${response.status})`);
        }
        this.update(entry, { data: body, error: null, receivedAt: this.env.now(), loading: false, failures: 0 });
      } catch (error) {
        if (controller.signal.aborted) {
          this.update(entry, { loading: false });
          return;
        }
        this.update(entry, {
          error: error instanceof Error ? error.message : "Couldn't reach the data source",
          loading: false,
          failures: entry.state.failures + 1,
        });
      } finally {
        entry.inflight = null;
        entry.controller = null;
        this.schedule(entry);
      }
    })();
    return entry.inflight;
  }

  /** Refetch every URL that starts with `prefix` and is on screen (after a change you made, say). */
  invalidate(prefix: string) {
    for (const [url, entry] of this.entries) {
      if (url.startsWith(prefix) && entry.subscribers.size > 0) void this.fetchNow(url);
    }
  }

  /** The app came back to the foreground or the network came back: refresh what's on screen. */
  resume({ resetBackoff = false }: { resetBackoff?: boolean } = {}) {
    if (!this.env.isVisible()) return;
    const now = this.env.now();
    for (const [url, entry] of this.entries) {
      if (entry.subscribers.size === 0) continue;
      if (resetBackoff) entry.state = { ...entry.state, failures: 0 };
      if (now - entry.state.receivedAt > RESUME_REFRESH_MS) void this.fetchNow(url);
    }
  }

  /** Timers can be frozen without notice (sleep, background windows); catch up anything overdue. */
  watchdog() {
    if (!this.env.isVisible()) return;
    const now = this.env.now();
    for (const [url, entry] of this.entries) {
      if (entry.subscribers.size > 0 && !entry.inflight && now > entry.dueAt + WATCHDOG_MS) void this.fetchNow(url);
    }
  }

  /** The interval an entry polls at right now: its fastest subscriber's, backed off while failing. */
  intervalFor(url: string): number {
    const entry = this.entries.get(url);
    if (!entry || entry.subscribers.size === 0) return Infinity;
    let base = Infinity;
    for (const sub of entry.subscribers) {
      const ms = typeof sub.interval === "function" ? sub.interval(entry.state.data as never) : sub.interval;
      if (Number.isFinite(ms) && ms > 0) base = Math.min(base, ms);
    }
    if (!Number.isFinite(base)) return Infinity;
    return Math.min(base * 2 ** Math.min(entry.state.failures, 4), Math.max(base, MAX_BACKOFF_MS));
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private entry<T>(url: string): Entry<T> {
    let entry = this.entries.get(url) as Entry<T> | undefined;
    if (!entry) {
      entry = {
        url,
        state: { ...(EMPTY as EntryState<T>) },
        subscribers: new Set(),
        inflight: null,
        controller: null,
        timer: undefined,
        dueAt: Infinity,
      };
      this.entries.set(url, entry as Entry<unknown>);
    }
    return entry;
  }

  private update<T>(entry: Entry<T>, patch: Partial<EntryState<T>>) {
    entry.state = { ...entry.state, ...patch };
    for (const sub of entry.subscribers) sub.listener();
  }

  private schedule<T>(entry: Entry<T>) {
    this.env.clearTimeout(entry.timer);
    entry.timer = undefined;
    const wait = this.intervalFor(entry.url);
    if (!Number.isFinite(wait)) {
      entry.dueAt = Infinity;
      return;
    }
    // Wait the full interval from the last answer (or attempt), not from now.
    const since = this.env.now() - (entry.state.receivedAt || 0);
    const delay = entry.state.failures > 0 ? wait : Math.max(0, wait - Math.max(0, since));
    entry.dueAt = this.env.now() + delay;
    entry.timer = this.env.setTimeout(() => {
      entry.timer = undefined;
      // Hidden: skip this round; resume() fetches the moment the app is visible again.
      if (this.env.isVisible()) void this.fetchNow(entry.url);
      else entry.dueAt = Infinity;
    }, delay);
  }

  private evict() {
    const now = this.env.now();
    for (const [url, entry] of this.entries) {
      if (entry.subscribers.size === 0 && !entry.inflight && now - (this.lastUsed.get(url) ?? 0) > EVICT_AFTER_MS) {
        this.entries.delete(url);
        this.lastUsed.delete(url);
      }
    }
  }
}
