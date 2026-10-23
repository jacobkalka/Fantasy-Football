"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Segmented } from "@/components/ui/Segmented";
import { ErrorState, SkeletonRows } from "@/components/ui/States";
import { normalizeName, searchPlayers, usePlayers } from "@/lib/hooks/usePlayers";
import { useTeams } from "@/lib/hooks/useTeams";
import type { Position } from "@/lib/providers/types";
import { useRoster } from "@/lib/roster/store";
import { useSettings } from "@/lib/settings/store";
import { PlayerList } from "./PlayerList";

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

const SORTS = [
  { value: "rostered", label: "Most rostered" },
  { value: "name", label: "A–Z" },
] as const;
type Sort = (typeof SORTS)[number]["value"];

const PAGE = 50;

/** Search and browse every NFL player: by name or team, by position, most rostered first. */
export function PlayerBrowser() {
  const { players, error, retry } = usePlayers();
  const teams = useTeams();
  const { roster } = useRoster();
  const { value: settings } = useSettings();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [sort, setSort] = useState<Sort>("rostered");
  const [shown, setShown] = useState(PAGE);
  const deferred = useDeferredValue(query);

  const mine = useMemo(() => new Set(roster.players.map((p) => p.playerId)), [roster.players]);
  const watched = useMemo(() => new Set(settings.watchlist), [settings.watchlist]);

  const results = useMemo(() => {
    if (!players) return [];
    const pool = filter === "ALL" ? players : players.filter((p) => p.position === (filter as Position));
    if (deferred.trim()) return searchPlayers(pool, deferred, (id) => (id ? (teams[id]?.abbr ?? null) : null), 200);
    const list = [...pool];
    if (sort === "name") list.sort((a, b) => normalizeName(a.name).localeCompare(normalizeName(b.name)));
    else list.sort((a, b) => (b.percentOwned ?? 0) - (a.percentOwned ?? 0));
    return list;
  }, [players, deferred, filter, sort, teams]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <label className="flex h-11 items-center gap-2.5 rounded-full bg-surface px-4 focus-within:ring-2 focus-within:ring-accent">
          <Icon name="search" size={18} className="text-faint" />
          <span className="sr-only">Search players</span>
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShown(PAGE);
            }}
            placeholder="Any player, or a team like KC"
            autoComplete="off"
            enterKeyHint="search"
            className="h-full w-full bg-transparent text-[16px] text-ink placeholder:text-faint focus:outline-none"
          />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="radiogroup" aria-label="Position">
            {POSITIONS.map((p) => (
              <button
                key={p.value}
                type="button"
                role="radio"
                aria-checked={filter === p.value}
                onClick={() => {
                  setFilter(p.value);
                  setShown(PAGE);
                }}
                className={`h-8 shrink-0 rounded-full px-3.5 text-[13px] transition-colors ${
                  filter === p.value ? "bg-ink font-medium text-black" : "bg-surface text-muted hover:text-ink"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {!query.trim() && <Segmented options={SORTS} value={sort} onChange={setSort} label="Sort" size="sm" />}
        </div>
      </div>

      <Card>
        <p className="tabular mb-1 text-[13px] text-muted">
          {players ? `${results.length.toLocaleString()} players` : " "}
        </p>
        {error && <ErrorState what="Couldn't load the player list from ESPN." onRetry={retry} />}
        {!players && !error && <SkeletonRows rows={8} height={64} />}
        {players && results.length === 0 && (
          <p className="py-6 text-[14px] text-muted">No player matches “{query}”. Try a last name, or a team like “BUF”.</p>
        )}
        {players && results.length > 0 && (
          <>
            <PlayerList players={results.slice(0, shown)} teams={teams} mine={mine} watched={watched} />
            {results.length > shown && (
              <button
                type="button"
                onClick={() => setShown((n) => n + PAGE)}
                className="mt-3 h-11 w-full rounded-full text-[14px] text-muted hover:bg-raised hover:text-ink"
              >
                Show more ({(results.length - shown).toLocaleString()} left)
              </button>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
