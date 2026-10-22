"use client";

import { motion } from "motion/react";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { LiveDot } from "@/components/ui/bits";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { visibleTeamColor } from "@/lib/color";
import type { PlayerLive, TeamLite } from "@/lib/live/types";
import type { RosterPlayer, Slot } from "@/lib/roster/lineup";

/** Where each lineup slot stands on the field, in % of the field box (top = downfield). */
const SPOTS: Record<Exclude<Slot, "BENCH">, { x: number; y: number }[]> = {
  WR: [
    { x: 11, y: 30 },
    { x: 89, y: 30 },
  ],
  TE: [{ x: 70, y: 38 }],
  FLEX: [{ x: 30, y: 38 }],
  QB: [{ x: 50, y: 52 }],
  RB: [
    { x: 36, y: 70 },
    { x: 64, y: 70 },
  ],
  K: [{ x: 14, y: 90 }],
  DST: [{ x: 86, y: 90 }],
};

function lastName(name: string) {
  const parts = name.replace(/\b(Jr|Sr|II|III|IV)\.?$/i, "").trim().split(" ");
  return parts.length > 1 ? parts.slice(1).join(" ") : name;
}

function Token({
  player,
  live,
  team,
  index,
  onOpen,
}: {
  player: RosterPlayer;
  live?: PlayerLive;
  team?: TeamLite;
  index: number;
  onOpen: () => void;
}) {
  const playing = live?.game?.state === "in";
  const small = player.slot === "K" || player.slot === "DST";
  const color = visibleTeamColor(team);
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      className="flex flex-col items-center gap-1"
      initial={{ opacity: 0, y: -40, scale: 0.6 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.05 * index }}
      whileHover={{ y: -4, scale: 1.06 }}
      whileTap={{ scale: 0.94 }}
      aria-label={`${player.name}, ${live?.points.toFixed(1) ?? "0.0"} points`}
    >
      <span className="relative">
        {playing && (
          <motion.span
            className="absolute -inset-1.5 rounded-full"
            style={{ boxShadow: `0 0 18px 2px ${live?.game?.isRedZone ? "#ff4d5e" : color}` }}
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.6, repeat: Infinity }}
            aria-hidden="true"
          />
        )}
        <PlayerAvatar
          name={player.name}
          headshot={player.position === "DST" ? team?.logo : player.headshot}
          teamColor={color}
          size={small ? 38 : 48}
        />
      </span>
      <span className="glass-chip flex min-w-[64px] flex-col items-center rounded-lg px-1.5 py-0.5 leading-tight">
        <span className="max-w-[78px] truncate text-[10px] font-semibold text-ink-strong">
          {player.position === "DST" ? `${team?.abbr ?? ""} D/ST` : lastName(player.name)}
        </span>
        <span className="flex items-center gap-1 font-display text-[17px] font-bold text-ink-strong">
          {playing && <LiveDot className="size-1.5 text-gain" />}
          {live && !live.scoringSupported ? <span className="font-mono text-[9px] text-muted">soon</span> : <AnimatedNumber value={live?.points ?? 0} />}
        </span>
      </span>
    </motion.button>
  );
}

/**
 * Your starters lined up in formation on a 3D field. The field tilts away from you;
 * the players stand upright on it. Tap a player for their card.
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
  const used: Partial<Record<Slot, number>> = {};
  const placed = starters.map((player) => {
    const slot = player.slot as Exclude<Slot, "BENCH">;
    const n = used[slot] ?? 0;
    used[slot] = n + 1;
    const spot = SPOTS[slot]?.[n] ?? { x: 50, y: 50 };
    return { player, spot };
  });

  return (
    <div className="glass relative overflow-hidden p-0" style={{ height: 460 }}>
      {/* The field itself: a tilted plane with yard lines, the end zone far away at the top. */}
      <div className="absolute inset-0" style={{ perspective: 700, perspectiveOrigin: "50% 0%" }} aria-hidden="true">
        <div
          className="absolute inset-x-[-30%] top-[-38%] bottom-[-6%]"
          style={{
            transform: "rotateX(40deg)",
            transformOrigin: "50% 100%",
            background:
              "repeating-linear-gradient(180deg, rgb(200 255 46 / 0.16) 0 2px, transparent 2px 11%), linear-gradient(180deg, #0f2a17 0%, #0b2013 60%, #081a10 100%)",
            boxShadow: "inset 0 0 80px rgb(0 0 0 / 0.7)",
          }}
        >
          <div className="absolute inset-x-0 top-0 h-[12%] bg-gain/10" />
          <div className="absolute inset-y-0 left-1/2 w-px bg-white/10" />
          {[20, 40, 60, 80].map((y) => (
            <div key={y} className="absolute inset-x-[30%] h-px bg-white/10" style={{ top: `${y}%` }} />
          ))}
        </div>
        {/* Light from the stadium. */}
        <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-white/[0.06] to-transparent" />
      </div>

      {placed.map(({ player, spot }, index) => (
        <div
          key={player.playerId}
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
        >
          <Token
            player={player}
            live={live.get(player.playerId)}
            team={player.teamId ? teams[player.teamId] : undefined}
            index={index}
            onOpen={() => onOpen(player)}
          />
        </div>
      ))}
    </div>
  );
}
