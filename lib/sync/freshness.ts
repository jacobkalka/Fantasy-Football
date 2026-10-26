/**
 * How fresh is what's on screen? Measured, never assumed (DECISIONS.md, "Live data refresh").
 *
 * The server stamps each answer with `fetchedAt` (when ESPN was actually asked, from the shared
 * cache) and `servedAt` (when it answered us). Their difference is how old the data already was
 * when it left the server; the time since it arrived on this device is added on top. Both are
 * differences of clocks on the same machine, so a phone whose clock is a few minutes off can't
 * make current data look delayed (the old bug compared the server's time to the phone's).
 *
 * "Delayed" needs evidence: games are live and the newest data we have is older than
 * LIVE_STALE_MS. When nothing is live, old data isn't "delayed", it's just the latest there is.
 */

/** While games are live, data older than this is called delayed (ESPN refreshes every few seconds). */
export const LIVE_STALE_MS = 45_000;

export type FreshnessStatus = "live" | "delayed" | "idle" | "loading" | "offline" | "error";

export interface Stamps {
  fetchedAt?: string;
  servedAt?: string;
}

/** How old the data was when the server sent it (ms). 0 when the server didn't say. */
export function serverAgeMs(stamps: Stamps | undefined): number {
  if (!stamps?.fetchedAt || !stamps.servedAt) return 0;
  const age = Date.parse(stamps.servedAt) - Date.parse(stamps.fetchedAt);
  return Number.isFinite(age) && age > 0 ? age : 0;
}

/** How old the data on screen is right now (ms), or null if there is none. */
export function dataAgeMs(stamps: Stamps | undefined, receivedAt: number, now: number): number | null {
  if (!receivedAt || !now) return null;
  return serverAgeMs(stamps) + Math.max(0, now - receivedAt);
}

export function freshness({
  hasData,
  ageMs,
  live,
  error,
  online = true,
}: {
  hasData: boolean;
  ageMs: number | null;
  live: boolean;
  error: string | null;
  online?: boolean;
}): FreshnessStatus {
  if (!hasData) return !online ? "offline" : error ? "error" : "loading";
  if (live && ageMs !== null && ageMs > LIVE_STALE_MS) return online ? "delayed" : "offline";
  if (!online) return "offline";
  return live ? "live" : "idle";
}
