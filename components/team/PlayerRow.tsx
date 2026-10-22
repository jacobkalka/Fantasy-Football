"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { TiltCard } from "@/components/motion/TiltCard";
import { InjuryBadge } from "@/components/player/InjuryBadge";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { Sparkline } from "@/components/ui/Sparkline";
import type { PlayerLive, TeamLite } from "@/lib/live/types";
import type { Slot } from "@/lib/roster/lineup";
import { formatPoints } from "@/lib/scoring";
import { GameStatus } from "./GameStatus";
import { visibleTeamColor } from "@/lib/color";

/** Remembers the last points value and reports each increase/decrease once. */
function usePointsChange(points: number) {
  const previous = useRef(points);
  const [change, setChange] = useState<{ id: number; amount: number } | null>(null);
  useEffect(() => {
    const amount = points - previous.current;
    previous.current = points;
    if (Math.abs(amount) < 0.05) return;
    setChange({ id: Date.now(), amount });
    const timer = window.setTimeout(() => setChange(null), 2400);
    return () => window.clearTimeout(timer);
  }, [points]);
  return change;
}

export function PlayerRow({
  slot,
  name,
  headshot,
  live,
  momentum,
  teams,
  onOpen,
}: {
  slot: Slot;
  name: string;
  headshot: string | null;
  live?: PlayerLive;
  momentum: number[];
  teams: Record<string, TeamLite>;
  onOpen: () => void;
}) {
  const team = live?.teamId ? teams[live.teamId] : undefined;
  const points = live?.points ?? 0;
  const change = usePointsChange(points);
  const playing = live?.game?.state === "in";
  // While playing: the running estimate. Before and after: ESPN's pregame projection (did they beat it?).
  const projection = playing ? live?.liveProjection : live?.projection;
  const isDst = live?.position === "DST";

  return (
    <TiltCard
      max={5}
      className="glass"
      style={{ "--glow": playing ? `${visibleTeamColor(team, "#c8ff2e")}aa` : "transparent" } as React.CSSProperties}
    >
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 p-3 text-left">
        <span className="w-9 shrink-0 font-mono text-[10px] tracking-[0.06em] text-muted uppercase">
          {slot === "DST" ? "D/ST" : slot === "BENCH" ? "BN" : slot}
        </span>
        <span style={{ transform: "translateZ(24px)" }}>
          <PlayerAvatar name={name} headshot={isDst ? team?.logo : headshot} teamColor={visibleTeamColor(team)} size={46} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[15px] font-semibold text-ink-strong">{name}</span>
            <InjuryBadge status={live?.injuryStatus} />
          </span>
          <span className="truncate font-mono text-[11px]">
            {live ? <GameStatus game={live.game} onBye={live.onBye} teams={teams} /> : <span className="text-muted">Loading…</span>}
          </span>
          {live && live.game && live.game.state !== "pre" && momentum.length > 1 && (
            <Sparkline values={momentum} className="mt-0.5" />
          )}
        </span>
        <span className="relative flex flex-col items-end" style={{ transform: "translateZ(30px)" }}>
          <AnimatePresence>
            {change && (
              <motion.span
                key={change.id}
                initial={{ opacity: 0, y: 6, scale: 0.8 }}
                animate={{ opacity: 1, y: -18, scale: 1 }}
                exit={{ opacity: 0, y: -30 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className={`absolute -top-1 right-0 font-display text-sm font-bold ${change.amount > 0 ? "text-gain" : "text-loss"}`}
              >
                {formatPoints(change.amount)}
              </motion.span>
            )}
          </AnimatePresence>
          {live && !live.scoringSupported ? (
            <span className="font-mono text-[10px] text-muted">pts soon</span>
          ) : (
            <motion.span
              animate={change ? { scale: [1, 1.18, 1] } : { scale: 1 }}
              transition={{ duration: 0.5 }}
              className={`font-display text-[32px] leading-none font-bold ${
                points > 0 ? "text-ink-strong" : points < 0 ? "text-loss" : "text-muted"
              } ${change && change.amount > 0 ? "[text-shadow:0_0_18px_rgb(200_255_46/0.7)]" : ""}`}
            >
              <AnimatedNumber value={points} />
            </motion.span>
          )}
          {projection != null && live?.scoringSupported && live.game && (
            <span className="font-mono text-[10px] text-muted">
              {live?.game?.state === "in" ? "est" : "proj"} {projection.toFixed(1)}
            </span>
          )}
        </span>
      </button>
    </TiltCard>
  );
}
