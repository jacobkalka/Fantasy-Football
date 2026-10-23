"use client";

import { useRef } from "react";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { LiveDot } from "@/components/ui/bits";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { visibleTeamColor } from "@/lib/color";
import type { PlayerLive, TeamLite } from "@/lib/live/types";
import { gsap, MOTION, prefersReducedMotion, useGSAP } from "@/lib/motion/gsap";
import type { RosterPlayer, Slot } from "@/lib/roster/lineup";

/** Where each lineup slot stands on the field, in % of the field box (top = downfield). */
const SPOTS: Record<Exclude<Slot, "BENCH">, { x: number; y: number }[]> = {
  WR: [
    { x: 12, y: 30 },
    { x: 88, y: 30 },
  ],
  TE: [{ x: 70, y: 40 }],
  FLEX: [{ x: 30, y: 40 }],
  QB: [{ x: 50, y: 53 }],
  RB: [
    { x: 35, y: 71 },
    { x: 65, y: 71 },
  ],
  K: [{ x: 15, y: 89 }],
  DST: [{ x: 85, y: 89 }],
};

function lastName(name: string) {
  const parts = name.replace(/\b(Jr|Sr|II|III|IV)\.?$/i, "").trim().split(" ");
  return parts.length > 1 ? parts.slice(1).join(" ") : name;
}

function Token({
  player,
  live,
  team,
  onOpen,
}: {
  player: RosterPlayer;
  live?: PlayerLive;
  team?: TeamLite;
  onOpen: () => void;
}) {
  const playing = live?.game?.state === "in";
  const small = player.slot === "K" || player.slot === "DST";
  return (
    <button
      type="button"
      data-token=""
      onClick={onOpen}
      className="pressable flex flex-col items-center gap-1 rounded-xl p-1"
      aria-label={`${player.name}, ${live?.points.toFixed(1) ?? "0.0"} points${playing ? ", playing now" : ""}`}
    >
      <PlayerAvatar
        name={player.name}
        headshot={player.position === "DST" ? team?.logo : player.headshot}
        teamColor={visibleTeamColor(team)}
        size={small ? 36 : 46}
      />
      <span className="flex flex-col items-center leading-tight">
        <span className="max-w-[84px] truncate text-[12px] font-medium">
          {player.position === "DST" ? `${team?.abbr ?? ""} D/ST` : lastName(player.name)}
        </span>
        <span className="flex items-center gap-1 text-[15px] font-semibold">
          {playing && <LiveDot className="size-1.5 text-positive" />}
          {live && !live.scoringSupported ? (
            <span className="text-[11px] text-faint">soon</span>
          ) : (
            <AnimatedNumber value={live?.points ?? 0} />
          )}
        </span>
      </span>
    </button>
  );
}

/**
 * Your starters lined up in formation on a top-down field: receivers wide, the
 * quarterback in the middle, backs behind, kicker and defense at the back. Tap a player
 * for their card.
 */
export function LineupField({
  starters,
  live,
  teams,
  onOpen,
}: {
  starters: RosterPlayer[];
  live: Map<string, PlayerLive>;
  teams: Record<string, TeamLite>;
  onOpen: (player: RosterPlayer) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const used: Partial<Record<Slot, number>> = {};
  const placed = starters.map((player) => {
    const slot = player.slot as Exclude<Slot, "BENCH">;
    const n = used[slot] ?? 0;
    used[slot] = n + 1;
    const spot = SPOTS[slot]?.[n] ?? { x: 50, y: 50 };
    return { player, spot };
  });

  // The players take the field one after another when the view opens (not on first page load).
  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.from("[data-token]", {
        autoAlpha: 0,
        y: 10,
        scale: 0.92,
        duration: MOTION.base,
        stagger: 0.03,
        clearProps: "all",
      });
    },
    { scope: root },
  );

  return (
    <div ref={root} className="card relative overflow-hidden" style={{ height: 440 }}>
      {/* Yard lines every 10%, the line of scrimmage between the receivers and the backs. */}
      <div className="absolute inset-0" aria-hidden="true">
        {[10, 20, 30, 40, 60, 70, 80, 90].map((y) => (
          <div key={y} className="absolute inset-x-0 h-px bg-raised" style={{ top: `${y}%` }} />
        ))}
        <div className="absolute inset-x-0 h-px bg-well" style={{ top: "47%" }} />
        <div className="absolute inset-y-0 left-1/2 w-px bg-rule" />
      </div>

      {placed.map(({ player, spot }) => (
        <div
          key={player.playerId}
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
        >
          <Token
            player={player}
            live={live.get(player.playerId)}
            team={player.teamId ? teams[player.teamId] : undefined}
            onOpen={() => onOpen(player)}
          />
        </div>
      ))}
    </div>
  );
}
