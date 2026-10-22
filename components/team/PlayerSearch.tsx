"use client";

import { AnimatePresence, motion } from "motion/react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Notice, Skeleton } from "@/components/ui/bits";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { Segmented } from "@/components/ui/Segmented";
import { useTeams } from "@/lib/hooks/useTeams";
import type { Player, Position } from "@/lib/providers/types";
import { rosterActions, useRoster } from "@/lib/roster/store";
import { visibleTeamColor } from "@/lib/color";

let playersCache: Player[] | null = null;

function normalize(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/gi, "")
    .toLowerCase();
}

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

export function PlayerSearch() {
  const [players, setPlayers] = useState<Player[] | null>(playersCache);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [message, setMessage] = useState<string | null>(null);
  const deferred = useDeferredValue(query);
  const teams = useTeams();
  const { roster } = useRoster();
  const onRoster = useMemo(() => new Set(roster.players.map((p) => p.playerId)), [roster.players]);

  useEffect(() => {
    if (playersCache) return;
    fetch("/api/players")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((body: { players: Player[] }) => {
        playersCache = body.players;
        setPlayers(body.players);
      })
      .catch(() => setFailed(true));
  }, []);

  const results = useMemo(() => {
    if (!players) return [];
    const q = normalize(deferred.trim());
    return players
      .filter((p) => filter === "ALL" || p.position === (filter as Position))
      .filter((p) => {
        if (!q) return true;
        const name = normalize(p.name);
        const team = p.teamId ? normalize(teams[p.teamId]?.abbr ?? "") : "";
        return name.includes(q) || name.split(" ").some((part) => part.startsWith(q)) || team === q;
      })
      .slice(0, 40);
  }, [players, deferred, filter, teams]);

  function add(player: Player) {
    const result = rosterActions.add(player);
    setMessage(result.ok ? `${player.name} added` : (result.reason ?? null));
    window.setTimeout(() => setMessage(null), 2200);
  }

  return (
    <section className="flex flex-col gap-3" aria-label="Add players">
      <label className="glass-chip flex items-center gap-3 rounded-2xl px-4 py-3 focus-within:ring-2 focus-within:ring-gain/60">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <span className="sr-only">Search players</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search players or a team (e.g. KC)"
          className="w-full bg-transparent text-[16px] text-ink-strong placeholder:text-muted focus:outline-none"
          autoComplete="off"
          enterKeyHint="search"
        />
      </label>
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <Segmented options={POSITIONS} value={filter} onChange={setFilter} label="Position" className="min-w-max" />
      </div>

      <AnimatePresence>
        {message && (
          <motion.p
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="glass-chip self-start rounded-xl px-3 py-1.5 font-mono text-[11px] text-gain"
            role="status"
          >
            {message}
          </motion.p>
        )}
      </AnimatePresence>

      {failed && <Notice title="Data delayed" tone="warn">Couldn&apos;t load the player list from ESPN. Try again in a minute.</Notice>}
      {!players && !failed && (
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
      )}

      <ul className="glass divide-y divide-line-soft overflow-hidden">
        {results.map((player) => {
          const team = player.teamId ? teams[player.teamId] : undefined;
          const added = onRoster.has(player.id);
          return (
            <li key={player.id} className="flex items-center gap-3 px-4 py-2.5">
              <PlayerAvatar
                name={player.name}
                headshot={player.position === "DST" ? team?.logo : player.headshot}
                teamColor={visibleTeamColor(team)}
                size={40}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-ink-strong">{player.name}</p>
                <p className="font-mono text-[11px] text-muted">
                  {player.position === "DST" ? "D/ST" : player.position} · {team?.abbr ?? "FA"}
                  {player.percentOwned ? ` · ${Math.round(player.percentOwned)}% rostered` : ""}
                </p>
              </div>
              <motion.button
                type="button"
                whileTap={{ scale: 0.88 }}
                onClick={() => (added ? rosterActions.remove(player.id) : add(player))}
                aria-label={added ? `Remove ${player.name}` : `Add ${player.name}`}
                className={`flex size-10 items-center justify-center rounded-full text-xl font-bold ${
                  added ? "glass-gain text-gain" : "glass-chip text-ink"
                }`}
              >
                {added ? "✓" : "+"}
              </motion.button>
            </li>
          );
        })}
        {players && results.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-muted">No players match &ldquo;{query}&rdquo;.</li>
        )}
      </ul>
    </section>
  );
}
