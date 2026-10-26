"use client";

import { useDeferredValue, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { visibleTeamColor } from "@/lib/color";
import { searchPlayers, usePlayers } from "@/lib/hooks/usePlayers";
import { useTeams } from "@/lib/hooks/useTeams";
import type { Player } from "@/lib/providers/types";

/** A search box with the matching players under it. Picking one calls onPick (the box clears). */
export function PlayerPicker({
  onPick,
  exclude,
  label,
  limit = 6,
}: {
  onPick: (player: Player) => void;
  exclude?: Set<string>;
  label: string;
  limit?: number;
}) {
  const { players, error, retry } = usePlayers();
  const teams = useTeams();
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const abbr = (id: string | null) => (id ? (teams[id]?.abbr ?? null) : null);
  const results =
    players && deferred.trim() ? searchPlayers(players, deferred, abbr, limit + (exclude?.size ?? 0)).filter((p) => !exclude?.has(p.id)).slice(0, limit) : [];
  return (
    <div className="flex flex-col gap-1">
      <label className="flex h-11 items-center gap-2.5 rounded-full bg-raised px-4 focus-within:ring-2 focus-within:ring-accent">
        <Icon name="search" size={18} className="text-faint" />
        <span className="sr-only">{label}</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={label}
          className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-faint"
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      {error && (
        <p className="px-2 text-[13px] text-muted">
          Couldn&apos;t load players.{" "}
          <button type="button" onClick={retry} className="font-medium text-ink underline">
            Retry
          </button>
        </p>
      )}
      {results.length > 0 && (
        <ul className="flex flex-col">
          {results.map((p) => {
            const team = p.teamId ? teams[p.teamId] : undefined;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(p);
                    setQuery("");
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left hover:bg-raised"
                >
                  <PlayerAvatar
                    name={p.name}
                    headshot={p.position === "DST" ? team?.logo : p.headshot}
                    teamColor={visibleTeamColor(team)}
                    size={30}
                  />
                  <span className="min-w-0 flex-1 truncate text-[14px]">{p.name}</span>
                  <span className="shrink-0 text-[12px] text-faint">
                    {p.position === "DST" ? "D/ST" : p.position} · {team?.abbr ?? "FA"}
                  </span>
                  <Icon name="plus" size={16} className="shrink-0 text-muted" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
