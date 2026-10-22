"use client";

import { AnimatePresence, motion } from "motion/react";
import { SectionLabel } from "@/components/ui/bits";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { Segmented } from "@/components/ui/Segmented";
import { useTeams } from "@/lib/hooks/useTeams";
import { canFill, MAX_ROSTER, sortLineup, type Slot } from "@/lib/roster/lineup";
import { rosterActions, useRoster } from "@/lib/roster/store";
import type { ScoringFormat } from "@/lib/scoring";
import { visibleTeamColor } from "@/lib/color";

const FORMATS = [
  { value: "standard", label: "Standard" },
  { value: "half", label: "Half PPR" },
  { value: "ppr", label: "PPR" },
] as const satisfies readonly { value: ScoringFormat; label: string }[];

const SLOT_LABEL: Record<Slot, string> = {
  QB: "QB",
  RB: "RB",
  WR: "WR",
  TE: "TE",
  FLEX: "FLEX",
  K: "K",
  DST: "D/ST",
  BENCH: "Bench",
};

const ALL_SLOTS: Slot[] = ["QB", "RB", "WR", "TE", "FLEX", "K", "DST", "BENCH"];

export function RosterEditor() {
  const { roster, ready } = useRoster();
  const teams = useTeams();
  const players = sortLineup(roster.players);

  return (
    <section className="flex flex-col gap-4" aria-label="Your roster">
      <div className="glass flex flex-col gap-3 p-4">
        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-[11px] tracking-[0.1em] text-muted uppercase">Team name</span>
          <input
            defaultValue={roster.name}
            key={ready ? "ready" : "loading"}
            onBlur={(e) => rosterActions.rename(e.target.value)}
            maxLength={40}
            className="rounded-xl bg-white/5 px-3 py-2.5 text-[16px] text-ink-strong ring-1 ring-line focus:ring-2 focus:ring-gain/60 focus:outline-none"
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[11px] tracking-[0.1em] text-muted uppercase">Scoring</span>
          <Segmented options={FORMATS} value={roster.format} onChange={rosterActions.setFormat} label="Scoring format" />
        </div>
      </div>

      <div>
        <SectionLabel action={<span>{roster.players.length}/{MAX_ROSTER}</span>}>Roster</SectionLabel>
        {players.length === 0 ? (
          <p className="glass px-4 py-6 text-center text-sm text-ink-soft">
            No players yet. Search below and tap <span className="text-gain">+</span> to add them.
          </p>
        ) : (
          <ul className="glass divide-y divide-line-soft overflow-hidden">
            <AnimatePresence initial={false}>
              {players.map((player) => {
                const team = player.teamId ? teams[player.teamId] : undefined;
                return (
                  <motion.li
                    key={player.playerId}
                    layout
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 24, transition: { duration: 0.18 } }}
                    className="flex items-center gap-3 px-4 py-2.5"
                  >
                    <label className="relative">
                      <span className="sr-only">Lineup slot for {player.name}</span>
                      <select
                        value={player.slot}
                        onChange={(e) => rosterActions.move(player.playerId, e.target.value as Slot)}
                        className={`w-16 appearance-none rounded-lg py-1.5 text-center font-mono text-[11px] font-bold tracking-wide ${
                          player.slot === "BENCH" ? "glass-chip text-muted" : "glass-gain text-gain"
                        }`}
                      >
                        {ALL_SLOTS.filter((slot) => canFill(slot, player.position)).map((slot) => (
                          <option key={slot} value={slot} className="bg-raised text-ink">
                            {SLOT_LABEL[slot]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <PlayerAvatar
                      name={player.name}
                      headshot={player.position === "DST" ? team?.logo : player.headshot}
                      teamColor={visibleTeamColor(team)}
                      size={38}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold text-ink-strong">{player.name}</p>
                      <p className="font-mono text-[11px] text-muted">
                        {player.position === "DST" ? "D/ST" : player.position} · {team?.abbr ?? "FA"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => rosterActions.remove(player.playerId)}
                      aria-label={`Remove ${player.name}`}
                      className="flex size-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-loss/15 hover:text-loss"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M6 6l12 12M18 6 6 18" />
                      </svg>
                    </button>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </section>
  );
}
