"use client";

import { useLive } from "@/lib/sync/useLive";

export interface PollState<T> {
  data: T | undefined;
  /** True while the newest attempt is failing; the last good data stays on screen. */
  delayed: boolean;
  error: string | null;
  /** Device time the data arrived (for freshness, see lib/sync/freshness.ts). */
  receivedAt: number;
  refresh: () => void;
}

/**
 * Older name for `useLive` (lib/sync/useLive.ts), kept so every screen goes through the one
 * shared live-data client: same URL = same request and same answer everywhere.
 */
export function usePoll<T>(
  url: string | null,
  { initial, intervalMs }: { initial?: T; intervalMs: number | ((data: T | undefined) => number) },
): PollState<T> {
  const live = useLive<T>(url, { interval: intervalMs, initial });
  return {
    data: live.data,
    delayed: live.error !== null,
    error: live.error,
    receivedAt: live.receivedAt,
    refresh: live.refresh,
  };
}
