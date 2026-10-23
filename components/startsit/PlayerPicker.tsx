"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Pill } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { Sheet } from "@/components/ui/Sheet";
import { ErrorState, SkeletonRows } from "@/components/ui/States";
import { visibleTeamColor } from "@/lib/color";
import { searchPlayers, usePlayers } from "@/lib/hooks/usePlayers";
import type { TeamLite } from "@/lib/live/types";
import type { Position } from "@/lib/providers/types";
import { shortName } from "@/lib/startsit/model";
import { MAX_PICK } from "@/lib/startsit/pick";

const LETTERS = ["A", "B", "C"];
const OFFENSE: Position[] = ["QB", "RB", "WR", "TE"];

/** A player that can be compared: yours (with a lineup slot) or anyone else's. */
export interface Pickable {
  playerId: string;
  name: string;
  position: Position;
  teamId: string | null;
  headshot: string | null;
  onRoster: boolean;
  starter?: boolean;
}

/**
 * Choose who to compare (up to three): your players as a row of chips, plus
 * "Compare anyone" to search every QB, RB, WR and TE in the league. Outside players
 * are always labelled as not on your team.
 */
export function PlayerPicker({
  mine,
  picked,
  outside,
  teams,
  onToggle,
  onAddOutside,
}: {
  mine: Pickable[];
  picked: string[];
  /** Picked players who aren't on the roster. */
  outside: Pickable[];
  teams: Record<string, TeamLite>;
  onToggle: (playerId: string) => void;
  onAddOutside: (player: Pickable) => void;
}) {
  const full = picked.length >= MAX_PICK;
  const list = useRef<HTMLUListElement>(null);
  const [searching, setSearching] = useState(false);
  const chips = [...mine, ...outside];

  // On arrival, scroll the row so the first picked player is in view (they may be far right).
  useEffect(() => {
    const row = list.current;
    const chip = row?.querySelector<HTMLElement>("[aria-pressed='true']");
    if (row && chip && chip.offsetLeft + chip.offsetWidth > row.clientWidth) row.scrollLeft = chip.offsetLeft - 12;
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[14px] text-muted">
          Pick up to {MAX_PICK} players · <span className="tabular">{picked.length} chosen</span>
        </p>
        <button
          type="button"
          onClick={() => setSearching(true)}
          disabled={full}
          className="pressable inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-medium text-ink shadow-[inset_0_0_0_1px_var(--color-control)] hover:bg-raised disabled:text-faint disabled:shadow-[inset_0_0_0_1px_var(--color-line)]"
          title={full ? `Remove someone first (up to ${MAX_PICK})` : undefined}
        >
          <Icon name="search" size={16} />
          Compare anyone
        </button>
      </div>
      <ul
        ref={list}
        className="no-scrollbar -mx-5 flex snap-x scroll-px-5 gap-2 overflow-x-auto px-5 pt-2 pb-1 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0"
        aria-label="Players to compare"
      >
        {chips.map((p) => {
          const index = picked.indexOf(p.playerId);
          const selected = index !== -1;
          const disabled = !selected && full;
          const team = p.teamId ? teams[p.teamId] : undefined;
          return (
            <li key={p.playerId} className="snap-start">
              <button
                type="button"
                onClick={() => onToggle(p.playerId)}
                aria-pressed={selected}
                aria-disabled={disabled}
                title={disabled ? `You can compare up to ${MAX_PICK} players` : undefined}
                className={`pressable relative flex h-12 items-center gap-2 rounded-full py-1 pr-4 pl-1 transition-colors ${
                  selected ? "bg-ink text-black" : "bg-raised text-ink hover:bg-well"
                } ${disabled ? "opacity-40" : ""}`}
              >
                <PlayerAvatar name={p.name} headshot={p.headshot} teamColor={visibleTeamColor(team)} size={38} />
                <span className="flex flex-col items-start leading-tight">
                  <span className="text-[14px] font-medium whitespace-nowrap">{shortName(p.name)}</span>
                  <span className={`text-[12px] whitespace-nowrap ${selected ? "text-black/60" : "text-faint"}`}>
                    {p.position} · {p.onRoster ? (p.starter ? "Starter" : "Bench") : "Not on your team"}
                  </span>
                </span>
                {selected && (
                  <span
                    className="absolute -top-1.5 -right-1 grid size-5 place-items-center rounded-full bg-brand text-[11px] font-semibold text-white"
                    aria-hidden="true"
                  >
                    {LETTERS[index]}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <Sheet open={searching} onClose={() => setSearching(false)} title="Compare any player" description="Search every QB, RB, WR and TE.">
        {searching && (
          <OutsideSearch
            exclude={new Set(chips.map((p) => p.playerId))}
            mine={new Set(mine.map((p) => p.playerId))}
            teams={teams}
            onPick={(p) => {
              onAddOutside(p);
              setSearching(false);
            }}
          />
        )}
      </Sheet>
    </div>
  );
}

function OutsideSearch({
  exclude,
  mine,
  teams,
  onPick,
}: {
  exclude: Set<string>;
  mine: Set<string>;
  teams: Record<string, TeamLite>;
  onPick: (player: Pickable) => void;
}) {
  const { players, error, retry } = usePlayers();
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const results = useMemo(() => {
    if (!players) return [];
    const pool = players.filter((p) => OFFENSE.includes(p.position) && !exclude.has(p.id));
    return searchPlayers(pool, deferred, (id) => (id ? (teams[id]?.abbr ?? null) : null), 30);
  }, [players, deferred, exclude, teams]);

  return (
    <div className="flex flex-col gap-3">
      <label className="flex h-11 items-center gap-2.5 rounded-full bg-raised px-4 focus-within:ring-2 focus-within:ring-accent">
        <Icon name="search" size={18} className="text-faint" />
        <input
          ref={input}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name or team"
          aria-label="Search players to compare"
          autoComplete="off"
          enterKeyHint="search"
          className="h-full w-full bg-transparent text-[16px] text-ink placeholder:text-faint focus:outline-none"
        />
      </label>
      {error && <ErrorState what="Couldn't load the player list." onRetry={retry} />}
      {!players && !error && <SkeletonRows rows={6} />}
      <ul className="-mx-2 flex flex-col">
        {results.map((p) => {
          const team = p.teamId ? teams[p.teamId] : undefined;
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() =>
                  onPick({
                    playerId: p.id,
                    name: p.name,
                    position: p.position,
                    teamId: p.teamId,
                    headshot: p.headshot,
                    onRoster: mine.has(p.id),
                  })
                }
                className="flex h-14 w-full items-center gap-3 rounded-xl px-2 text-left hover:bg-raised"
              >
                <PlayerAvatar name={p.name} headshot={p.headshot} teamColor={visibleTeamColor(team)} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] leading-5 font-medium">{p.name}</span>
                  <span className="block truncate text-[13px] leading-5 text-muted">
                    {p.position} · {team?.abbr ?? "Free agent"}
                    {p.percentOwned != null && ` · ${Math.round(p.percentOwned)}% rostered`}
                  </span>
                </span>
                {mine.has(p.id) ? <Pill tone="accent">Yours</Pill> : <Icon name="plus" size={18} className="text-faint" />}
              </button>
            </li>
          );
        })}
        {players && results.length === 0 && <li className="px-2 py-6 text-[14px] text-muted">No match for “{query}”.</li>}
      </ul>
    </div>
  );
}
