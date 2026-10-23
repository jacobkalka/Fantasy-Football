"use client";

import Link from "next/link";
import { InjuryBadge } from "@/components/player/InjuryBadge";
import { Pill } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { visibleTeamColor } from "@/lib/color";
import type { TeamLite } from "@/lib/live/types";
import type { Player } from "@/lib/providers/types";
import { settingsActions } from "@/lib/settings/store";

const POSITION_LABEL: Record<string, string> = { DST: "D/ST" };

/** Rows of players: who they are, % rostered, and a star to add them to your watchlist. */
export function PlayerList({
  players,
  teams,
  mine,
  watched,
}: {
  players: Player[];
  teams: Record<string, TeamLite>;
  mine: Set<string>;
  watched: Set<string>;
}) {
  return (
    <ul className="-mx-2 flex flex-col divide-y divide-rule">
      {players.map((p) => {
        const team = p.teamId ? teams[p.teamId] : undefined;
        const starred = watched.has(p.id);
        return (
          <li key={p.id} className="flex min-h-16 items-center gap-1 px-1">
            <Link
              href={`/players/${encodeURIComponent(p.id)}`}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1 py-2 hover:bg-raised"
            >
              <PlayerAvatar
                name={p.name}
                headshot={p.position === "DST" ? team?.logo : p.headshot}
                teamColor={visibleTeamColor(team)}
                size={40}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[15px] leading-5 font-medium">{p.name}</span>
                  <InjuryBadge status={p.injuryStatus} />
                </span>
                <span className="block truncate text-[13px] leading-5 text-muted">
                  {POSITION_LABEL[p.position] ?? p.position} · {team?.abbr ?? "Free agent"}
                </span>
              </span>
              {mine.has(p.id) && <Pill tone="accent">On your team</Pill>}
              {p.percentOwned != null && (
                <span className="tabular w-[72px] shrink-0 text-right text-[13px] leading-4 text-muted">
                  {Math.round(p.percentOwned)}%<span className="block text-[11px] text-faint">rostered</span>
                </span>
              )}
            </Link>
            <button
              type="button"
              onClick={() => settingsActions.toggleWatch(p.id)}
              aria-pressed={starred}
              aria-label={starred ? `Remove ${p.name} from your watchlist` : `Add ${p.name} to your watchlist`}
              className={`pressable grid size-10 shrink-0 place-items-center rounded-full hover:bg-raised ${
                starred ? "text-warning" : "text-faint hover:text-ink"
              }`}
            >
              <Icon name="star" size={18} className={starred ? "fill-current" : ""} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
