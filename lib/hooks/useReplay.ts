"use client";

import { useCallback, useEffect, useState } from "react";

export const REPLAY_SPEEDS = [
  { value: "30", label: "30×" },
  { value: "60", label: "60×" },
  { value: "180", label: "180×" },
] as const;
export type ReplaySpeed = (typeof REPLAY_SPEEDS)[number]["value"];

/**
 * Replays a finished game: reveals its real plays one at a time, spaced by the real
 * time between them (sped up), so a final game looks and moves like a live one.
 * `times` are the plays' real-world timestamps in ms (or NaN when unknown).
 */
export function useReplay(times: number[], { maxWaitMs = 2500 }: { maxWaitMs?: number } = {}) {
  const [active, setActive] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [shown, setShown] = useState(0);
  const [speed, setSpeed] = useState<ReplaySpeed>("60");
  const total = times.length;

  useEffect(() => {
    if (!active || !playing || shown >= total) return;
    const gap = shown === 0 ? 0 : times[shown] - times[shown - 1];
    const real = Number.isFinite(gap) && gap > 0 ? gap : 20_000;
    // Never faster than a quarter second or slower than `maxWaitMs` per play, so it stays watchable.
    const wait = Math.min(maxWaitMs, Math.max(250, real / Number(speed)));
    const timer = window.setTimeout(() => setShown((n) => n + 1), wait);
    return () => window.clearTimeout(timer);
  }, [active, playing, shown, total, times, speed, maxWaitMs]);

  const start = useCallback(() => {
    setShown(0);
    setActive(true);
    setPlaying(true);
  }, []);
  const stop = useCallback(() => {
    setActive(false);
    setPlaying(false);
  }, []);

  return {
    active,
    playing: playing && shown < total,
    done: active && shown >= total,
    shown: active ? shown : total,
    speed,
    setSpeed,
    start,
    stop,
    toggle: () => setPlaying((p) => !p),
    skipToEnd: () => setShown(total),
  };
}
