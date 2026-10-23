"use client";

import { useEffect, useRef } from "react";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { InjuryBadge } from "@/components/player/InjuryBadge";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { visibleTeamColor } from "@/lib/color";
import type { PlayerLive, TeamLite } from "@/lib/live/types";
import { gsap } from "@/lib/motion/gsap";
import type { Slot } from "@/lib/roster/lineup";
import { formatPoints } from "@/lib/scoring";
import { GameStatus } from "./GameStatus";

const SLOT_LABEL: Partial<Record<Slot, string>> = { DST: "D/ST", BENCH: "BN" };

/**
 * One player in the lineup: slot, photo, name, game, and points (with the projection
 * under them). When a play changes the points, the row tints green or red for a moment
 * and the change floats up beside the number.
 */
export function PlayerRow({
  slot,
  name,
  headshot,
  live,
  teams,
  onOpen,
}: {
  slot: Slot;
  name: string;
  headshot: string | null;
  live?: PlayerLive;
  /** Older prop, no longer drawn. */
  momentum?: number[];
  teams: Record<string, TeamLite>;
  onOpen: () => void;
}) {
  const team = live?.teamId ? teams[live.teamId] : undefined;
  const points = live?.points ?? 0;
  const playing = live?.game?.state === "in";
  // While playing: the running estimate. Before and after: ESPN's pregame projection (did they beat it?).
  const projection = playing ? live?.liveProjection : live?.projection;
  const isDst = live?.position === "DST";

  const row = useRef<HTMLButtonElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  const previous = useRef<number | null>(live ? points : null);

  useEffect(() => {
    if (!live) return;
    const before = previous.current;
    previous.current = points;
    if (before === null || Math.abs(points - before) < 0.05) return;
    const up = points > before;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (bubble.current) {
      bubble.current.textContent = formatPoints(points - before);
      bubble.current.className = `pointer-events-none absolute -top-2 right-0 text-[13px] font-semibold ${up ? "text-positive" : "text-negative"}`;
      gsap.fromTo(
        bubble.current,
        { autoAlpha: 1, y: 0 },
        { autoAlpha: 0, y: reduce ? 0 : -16, duration: 1.6, ease: "power2.out", delay: 0.6 },
      );
    }
    if (row.current) {
      gsap.fromTo(
        row.current,
        { backgroundColor: up ? "rgb(63 192 122 / 0.16)" : "rgb(229 86 111 / 0.16)" },
        { backgroundColor: "rgb(0 0 0 / 0)", duration: 1.4, ease: "power1.out", clearProps: "backgroundColor" },
      );
    }
  }, [points, live]);

  return (
    <button
      ref={row}
      type="button"
      onClick={onOpen}
      className="flex min-h-16 w-full items-center gap-3 rounded-[14px] px-3 py-2 text-left transition-colors hover:bg-raised"
    >
      <span className="w-9 shrink-0 text-[12px] font-medium text-faint">{SLOT_LABEL[slot] ?? slot}</span>
      <PlayerAvatar name={name} headshot={isDst ? team?.logo : headshot} teamColor={visibleTeamColor(team)} size={40} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[15px] leading-5 font-medium">{name}</span>
          <InjuryBadge status={live?.injuryStatus} />
        </span>
        <span className="truncate text-[13px] leading-5">
          {live ? (
            <GameStatus game={live.game} onBye={live.onBye} teams={teams} />
          ) : (
            <span className="skeleton inline-block h-3 w-28 rounded align-middle" aria-label="Loading" />
          )}
        </span>
      </span>
      <span className="relative flex w-16 shrink-0 flex-col items-end">
        <span ref={bubble} aria-hidden="true" className="pointer-events-none absolute -top-2 right-0 opacity-0" />
        {live && !live.scoringSupported ? (
          <span className="text-[12px] text-faint">pts soon</span>
        ) : (
          <span
            className={`text-[20px] leading-6 font-semibold ${
              !live || !live.game ? "text-faint" : points < 0 ? "text-negative" : points > 0 ? "text-ink" : "text-muted"
            }`}
          >
            {live ? <AnimatedNumber value={points} /> : "–"}
          </span>
        )}
        <span className="tabular text-[12px] leading-4 text-faint">
          {projection != null && live?.scoringSupported && live.game
            ? `${playing ? "est" : "proj"} ${projection.toFixed(1)}`
            : " "}
        </span>
      </span>
    </button>
  );
}
