"use client";

import { motion } from "motion/react";
import { Segmented } from "@/components/ui/Segmented";
import { REPLAY_SPEEDS, type useReplay } from "@/lib/hooks/useReplay";

/** Play/pause, speed, skip and exit for a replay, with a progress bar. */
export function ReplayControls({
  replay,
  total,
  children,
}: {
  replay: ReturnType<typeof useReplay>;
  total: number;
  /** Extra content above the controls (e.g. a running total). */
  children?: React.ReactNode;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="glass flex flex-col gap-3 p-3">
      {children}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={replay.toggle}
          disabled={replay.done}
          className="glass-chip pressable flex size-11 items-center justify-center rounded-xl text-lg text-ink disabled:opacity-40"
          aria-label={replay.playing ? "Pause replay" : "Play replay"}
        >
          {replay.playing ? "❚❚" : "▶"}
        </button>
        <Segmented options={REPLAY_SPEEDS} value={replay.speed} onChange={replay.setSpeed} label="Replay speed" className="flex-1" />
        <button
          type="button"
          onClick={replay.skipToEnd}
          className="glass-chip pressable rounded-xl px-3 py-2.5 font-mono text-[10px] tracking-[0.1em] text-ink uppercase"
        >
          Skip
        </button>
        <button
          type="button"
          onClick={replay.stop}
          className="glass-chip pressable rounded-xl px-3 py-2.5 font-mono text-[10px] tracking-[0.1em] text-muted uppercase"
        >
          Exit
        </button>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-white/5" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={replay.shown}>
        <motion.div
          className="h-full rounded-full bg-gain"
          animate={{ width: `${(replay.shown / Math.max(1, total)) * 100}%` }}
          transition={{ ease: "linear", duration: 0.3 }}
        />
      </div>
    </motion.div>
  );
}
