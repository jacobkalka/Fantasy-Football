"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { ErrorState, SkeletonRows } from "@/components/ui/States";
import { visibleTeamColor } from "@/lib/color";
import { searchPlayers, usePlayers } from "@/lib/hooks/usePlayers";
import { useTeams } from "@/lib/hooks/useTeams";
import { gsap } from "@/lib/motion/gsap";
import type { Player, Position } from "@/lib/providers/types";
import { rosterActions, useRoster } from "@/lib/roster/store";

const POSITIONS = [
  { value: "ALL", label: "All" },
  { value: "QB", label: "QB" },
  { value: "RB", label: "RB" },
  { value: "WR", label: "WR" },
  { value: "TE", label: "TE" },
  { value: "K", label: "K" },
  { value: "DST", label: "D/ST" },
] as const;

type Filter = (typeof POSITIONS)[number]["value"];

/** Add players to your team: search by name or team, filter by position, tap + to add. */
export function PlayerSearch() {
  const { players, error, retry } = usePlayers();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const deferred = useDeferredValue(query);
  const teams = useTeams();
  const { roster } = useRoster();
  const onRoster = useMemo(() => new Set(roster.players.map((p) => p.playerId)), [roster.players]);
  const status = useRef<HTMLParagraphElement>(null);

  const results = useMemo(() => {
    if (!players) return [];
    const pool = filter === "ALL" ? players : players.filter((p) => p.position === (filter as Position));
    return searchPlayers(pool, deferred, (id) => (id ? (teams[id]?.abbr ?? null) : null), 40);
  }, [players, deferred, filter, teams]);

  function add(player: Player) {
    const result = rosterActions.add(player);
    setMessage({ text: result.ok ? `${player.name} added` : (result.reason ?? "Couldn't add"), ok: result.ok });
    if (status.current && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      gsap.fromTo(status.current, { autoAlpha: 0, y: -4 }, { autoAlpha: 1, y: 0, duration: 0.2 });
    }
    window.setTimeout(() => setMessage(null), 2200);
  }

  return (
    <Card as="section" aria-label="Add players" className="flex flex-col gap-3">
      <h2 className="text-[16px] leading-6 font-semibold">Add players</h2>
      <label className="flex h-11 items-center gap-2.5 rounded-full bg-raised px-4 focus-within:ring-2 focus-within:ring-accent">
        <Icon name="search" size={18} className="text-faint" />
        <span className="sr-only">Search players</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name or team (e.g. KC)"
          className="h-full w-full bg-transparent text-[16px] text-ink placeholder:text-faint focus:outline-none"
          autoComplete="off"
          enterKeyHint="search"
        />
      </label>
      <div className="no-scrollbar -mx-5 flex gap-1.5 overflow-x-auto px-5" role="radiogroup" aria-label="Position">
        {POSITIONS.map((p) => (
          <button
            key={p.value}
            type="button"
            role="radio"
            aria-checked={filter === p.value}
            onClick={() => setFilter(p.value)}
            className={`h-8 shrink-0 rounded-full px-3.5 text-[13px] transition-colors ${
              filter === p.value ? "bg-ink font-medium text-black" : "bg-raised text-muted hover:text-ink"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Fixed height so the list below doesn't jump when a message appears. */}
      <p ref={status} role="status" className={`h-5 text-[13px] ${message?.ok ? "text-positive" : "text-warning"}`}>
        {message?.text ?? ""}
      </p>

      {error && <ErrorState what="Couldn't load the player list from ESPN." onRetry={retry} />}
      {!players && !error && <SkeletonRows rows={6} height={56} />}

      <ul className="-mx-2 flex flex-col divide-y divide-rule">
        {results.map((player) => {
          const team = player.teamId ? teams[player.teamId] : undefined;
          const added = onRoster.has(player.id);
          return (
            <li key={player.id} className="flex min-h-14 items-center gap-3 px-2 py-1.5">
              <PlayerAvatar
                name={player.name}
                headshot={player.position === "DST" ? team?.logo : player.headshot}
                teamColor={visibleTeamColor(team)}
                size={36}
              />
              <Link href={`/players/${player.id}`} className="min-w-0 flex-1 rounded-md hover:underline">
                <p className="truncate text-[15px] leading-5 font-medium">{player.name}</p>
                <p className="text-[13px] leading-5 text-muted">
                  {player.position === "DST" ? "D/ST" : player.position} · {team?.abbr ?? "Free agent"}
                  {player.percentOwned != null ? ` · ${Math.round(player.percentOwned)}% rostered` : ""}
                </p>
              </Link>
              <button
                type="button"
                onClick={() => (added ? rosterActions.remove(player.id) : add(player))}
                aria-label={added ? `Remove ${player.name}` : `Add ${player.name}`}
                aria-pressed={added}
                className={`pressable grid size-10 shrink-0 place-items-center rounded-full ${
                  added ? "bg-ink text-black" : "bg-raised text-ink hover:bg-well"
                }`}
              >
                <Icon name={added ? "check" : "plus"} size={18} />
              </button>
            </li>
          );
        })}
        {players && results.length === 0 && (
          <li className="px-2 py-6 text-[14px] text-muted">No players match “{query}”.</li>
        )}
      </ul>
    </Card>
  );
}
