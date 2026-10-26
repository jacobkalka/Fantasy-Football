"use client";

import { useEffect, useRef } from "react";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { InjuryBadge } from "@/components/player/InjuryBadge";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { visibleTeamColor } from "@/lib/color";
import { projectPlayer } from "@/lib/fantasy/projection";
import { pts } from "@/lib/format";
import type { PlayerLive, TeamLite } from "@/lib/live/types";
import { gsap, prefersReducedMotion } from "@/lib/motion/gsap";
import { openPlayer } from "@/lib/nav/query";
import type { Slot } from "@/lib/roster/lineup";
import { formatPoints } from "@/lib/scoring";
import { GameStatus } from "./GameStatus";
import { Possession } from "./Possession";

const SLOT_LABEL: Partial<Record<Slot, string>> = { DST: "D/ST", BENCH: "BN" };

/**
 * One player in a lineup: slot, photo, name, game (with live possession), points to the
 * hundredth and the projection under them, and a thin bar showing how much of his projection
 * he's already scored. Tapping opens the one player profile. When a play changes his points the
 * row tints cyan or coral for a moment and the change floats up beside the number.
 */
export function PlayerRow({
  playerId,
  slot,
  name,
  headshot,
  live,
  teams,
  compact = false,
}: {
  playerId: string;
  slot?: Slot | string;
  name: string;
  headshot: string | null;
  live?: PlayerLive;
  teams: Record<string, TeamLite>;
  compact?: boolean;
}) {
  const team = live?.teamId ? teams[live.teamId] : undefined;
  const points = live?.points ?? 0;
  const playing = live?.game?.state === "in";
  const proj = live ? projectPlayer(live) : null;
  const pctOfProjection = live?.projection ? Math.max(0, Math.min(1.25, points / live.projection)) : null;
  const isDst = live?.position === "DST";

  const row = useRef<HTMLButtonElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  const previous = useRef<number | null>(live ? points : null);

  useEffect(() => {
    if (!live) return;
    const before = previous.current;
    previous.current = points;
    if (before === null || Math.abs(points - before) < 0.005) return;
    const up = points > before;
    const reduce = prefersReducedMotion();
    if (bubble.current) {
      bubble.current.textContent = formatPoints(points - before);
      bubble.current.className = `pointer-events-none absolute -top-3 right-0 text-[13px] font-semibold ${up ? "text-positive" : "text-negative"}`;
      gsap.fromTo(bubble.current, { autoAlpha: 1, y: 0 }, { autoAlpha: 0, y: reduce ? 0 : -16, duration: 1.6, ease: "power2.out", delay: 0.6 });
    }
    if (row.current) {
      gsap.fromTo(
        row.current,
        { backgroundColor: up ? "rgb(76 141 255 / 0.16)" : "rgb(229 86 111 / 0.16)" },
        { backgroundColor: "rgb(0 0 0 / 0)", duration: 1.4, ease: "power1.out", clearProps: "backgroundColor" },
      );
    }
  }, [points, live]);

  return (
    <button
      ref={row}
      type="button"
      onClick={() => openPlayer(playerId)}
      className={`group flex w-full items-center gap-3 rounded-[16px] px-3 text-left transition-colors hover:bg-white/[0.04] ${compact ? "min-h-14 py-1.5" : "min-h-[68px] py-2"}`}
    >
      {slot && <span className="w-9 shrink-0 text-[11px] font-semibold tracking-wide text-faint">{SLOT_LABEL[slot as Slot] ?? slot}</span>}
      <PlayerAvatar name={name} headshot={isDst ? team?.logo : headshot} teamColor={visibleTeamColor(team)} size={compact ? 36 : 42} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[15px] leading-5 font-medium group-hover:underline">{name}</span>
          <InjuryBadge status={live?.injuryStatus} />
        </span>
        <span className="truncate text-[12px] leading-4">
          {live ? (
            <GameStatus game={live.game} onBye={live.onBye} teams={teams} />
          ) : (
            <span className="skeleton inline-block h-3 w-28 rounded align-middle" aria-label="Loading" />
          )}
        </span>
        {live && playing && (
          <span className="flex">
            <Possession game={live.game} position={live.position} />
          </span>
        )}
      </span>
      <span className="relative flex w-[76px] shrink-0 flex-col items-end">
        <span ref={bubble} aria-hidden="true" className="pointer-events-none absolute -top-3 right-0 opacity-0" />
        <span
          className={`text-[20px] leading-6 font-semibold tracking-[-0.01em] ${
            !live || !live.game ? "text-faint" : points < 0 ? "text-negative" : points > 0 ? "text-ink" : "text-muted"
          }`}
        >
          {live ? <AnimatedNumber value={points} /> : "–"}
        </span>
        <span className="tabular text-[11px] leading-4 text-faint">
          {live?.game && proj
            ? playing
              ? `est ${pts(proj.projected)}`
              : live.projection != null
                ? `proj ${pts(live.projection)}`
                : " "
            : " "}
        </span>
        {pctOfProjection !== null && live?.game && live.game.state !== "pre" && (
          <span className="mt-1 h-1 w-full overflow-hidden rounded-full bg-well" aria-hidden="true">
            <span
              className={`block h-full rounded-full ${pctOfProjection >= 1 ? "bg-positive" : "bg-accent"}`}
              style={{ width: `${Math.min(100, pctOfProjection * 100)}%` }}
            />
          </span>
        )}
      </span>
    </button>
  );
}
