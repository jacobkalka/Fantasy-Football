"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface PollState<T> {
  data: T | undefined;
  /** True while the newest attempt is failing; the last good data stays on screen. */
  delayed: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Re-fetches a JSON URL on a timer and keeps the last good answer.
 * Pauses while the tab is hidden and catches up the moment it's visible again.
 * `intervalMs` can be a function of the latest data (poll fast while games are live).
 */
export function usePoll<T>(
  url: string | null,
  {
    initial,
    intervalMs,
  }: {
    initial?: T;
    intervalMs: number | ((data: T | undefined) => number);
  },
): PollState<T> {
  const [data, setData] = useState<T | undefined>(initial);
  const [error, setError] = useState<string | null>(null);
  const failures = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef<T | undefined>(initial);
  // Which URL the current data came from; a new URL is fetched right away.
  const latestUrl = useRef<string | null>(initial !== undefined ? url : null);
  const intervalRef = useRef(intervalMs);
  useEffect(() => {
    intervalRef.current = intervalMs;
  });

  const run = useCallback(
    async (signal?: AbortSignal) => {
      if (!url) return;
      try {
        const response = await fetch(url, { signal, cache: "no-store" });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error ?? `Request failed (${response.status})`);
        }
        const json = (await response.json()) as T;
        latest.current = json;
        latestUrl.current = url;
        failures.current = 0;
        setData(json);
        setError(null);
      } catch (err) {
        if (signal?.aborted) return;
        failures.current += 1;
        setError(err instanceof Error ? err.message : "Couldn't reach the data source");
      }
    },
    [url],
  );

  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    let stopped = false;

    const schedule = () => {
      if (stopped) return;
      const base =
        typeof intervalRef.current === "function"
          ? intervalRef.current(latest.current)
          : intervalRef.current;
      // Back off while the source is failing: 1×, 2×, 4× ... up to 1 minute.
      const wait = Math.min(base * 2 ** Math.min(failures.current, 4), 60_000);
      timer.current = setTimeout(tick, wait);
    };
    const tick = async () => {
      if (document.visibilityState === "visible") await run(controller.signal);
      schedule();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timer.current);
        void tick();
      }
    };
    // Back online: fetch now instead of waiting out the error back-off.
    const onOnline = () => {
      failures.current = 0;
      onVisible();
    };

    // Fetch right away unless the server already handed us data for this exact URL.
    if (latestUrl.current !== url) void tick();
    else schedule();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      stopped = true;
      controller.abort();
      clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [url, run]);

  const refresh = useCallback(() => void run(), [run]);
  return { data, delayed: error !== null, error, refresh };
}
