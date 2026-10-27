"use client";

import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Segmented";
import { REPLAY_SPEEDS, type useReplay } from "@/lib/hooks/useReplay";
import { useTweenTo } from "./useTweenTo";

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
  const share = (replay.shown / Math.max(1, total)) * 100;
  const bar = useTweenTo<HTMLDivElement>({ width: `${share}%` }, [share]);
  return (
    <div className="card flex flex-col gap-3 p-3">
      {children}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          icon={replay.playing ? "minus" : "arrowRight"}
          onClick={replay.toggle}
          disabled={replay.done}
          aria-label={replay.playing ? "Pause replay" : "Play replay"}
        >
          {replay.playing ? "Pause" : "Play"}
        </Button>
        <Segmented options={REPLAY_SPEEDS} value={replay.speed} onChange={replay.setSpeed} label="Replay speed" className="flex-1" />
        <Button size="sm" onClick={replay.skipToEnd}>
          Skip
        </Button>
        <Button size="sm" variant="quiet" onClick={replay.stop}>
          Exit
        </Button>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-well" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={replay.shown}>
        <div ref={bar} className="h-full rounded-full bg-accent" />
      </div>
    </div>
  );
}
