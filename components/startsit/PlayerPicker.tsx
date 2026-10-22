"use client";

import { motion } from "motion/react";
import { useEffect, useRef } from "react";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { visibleTeamColor } from "@/lib/color";
import type { TeamLite } from "@/lib/live/types";
import type { RosterPlayer } from "@/lib/roster/lineup";
import { shortName } from "@/lib/startsit/model";
import { MAX_PICK } from "@/lib/startsit/pick";

const LETTERS = ["A", "B", "C"];

/** A scrolling row of your players. Tap to add or remove (up to three). */
export function PlayerPicker({
  players,
  picked,
  teams,
  onToggle,
}: {
  players: RosterPlayer[];
  picked: string[];
  teams: Record<string, TeamLite>;
  onToggle: (playerId: string) => void;
}) {
  const full = picked.length >= MAX_PICK;
  const list = useRef<HTMLUListElement>(null);

  // On arrival, scroll the row so the first picked player is in view (they may be far right).
  useEffect(() => {
    const row = list.current;
    const chip = row?.querySelector<HTMLElement>("[aria-pressed='true']");
    if (row && chip && chip.offsetLeft + chip.offsetWidth > row.clientWidth) row.scrollLeft = chip.offsetLeft - 12;
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <p className="px-1 font-mono text-[11px] tracking-[0.1em] text-muted uppercase">
        Tap players to compare <span className="normal-case">(up to {MAX_PICK})</span>
      </p>
      <ul
        ref={list}
        className="-mx-3 flex snap-x scroll-px-3 gap-2 overflow-x-auto px-3 pt-2 pb-2 [scrollbar-width:none]"
        aria-label="Your players"
      >
        {players.map((p) => {
          const index = picked.indexOf(p.playerId);
          const selected = index !== -1;
          const disabled = !selected && full;
          const team = p.teamId ? teams[p.teamId] : undefined;
          return (
            <li key={p.playerId} className="snap-start">
              <motion.button
                type="button"
                whileTap={{ scale: 0.94 }}
                onClick={() => onToggle(p.playerId)}
                aria-pressed={selected}
                aria-disabled={disabled}
                title={disabled ? `You can compare up to ${MAX_PICK} players` : undefined}
                className={`relative flex min-h-11 items-center gap-2 rounded-2xl py-1.5 pr-3 pl-1.5 transition-[opacity,box-shadow] ${
                  selected ? "glass-gain" : "glass-chip"
                } ${disabled ? "opacity-40" : ""}`}
              >
                <PlayerAvatar name={p.name} headshot={p.headshot} teamColor={visibleTeamColor(team)} size={32} />
                <span className="flex flex-col items-start leading-tight">
                  <span className={`text-[13px] font-semibold whitespace-nowrap ${selected ? "text-ink-strong" : "text-ink"}`}>
                    {shortName(p.name)}
                  </span>
                  <span className="font-mono text-[10px] whitespace-nowrap text-muted">
                    {p.position} · {p.slot === "BENCH" ? "Bench" : "Starter"}
                  </span>
                </span>
                {selected && (
                  <motion.span
                    layoutId={`pick-letter-${p.playerId}`}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-1.5 -right-1 grid size-5 place-items-center rounded-full bg-gain font-mono text-[10px] font-bold text-gain-ink"
                    aria-hidden="true"
                  >
                    {LETTERS[index]}
                  </motion.span>
                )}
              </motion.button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
