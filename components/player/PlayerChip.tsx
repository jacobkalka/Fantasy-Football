"use client";

import { InjuryBadge } from "@/components/player/InjuryBadge";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { visibleTeamColor } from "@/lib/color";
import { pts } from "@/lib/format";
import type { TeamLite } from "@/lib/live/types";
import type { Position } from "@/lib/providers/types";
import { PlayerLink } from "./PlayerLink";

/** A player as a compact, tappable row: photo, name, position · team, an optional figure. Opens the profile. */
export function PlayerChip({
  player,
  teams,
  figure,
  figureLabel,
  note,
  size = 36,
}: {
  player: { id: string; name: string; position: Position; teamId: string | null; headshot: string | null; injuryStatus?: string };
  teams: Record<string, TeamLite>;
  figure?: number | null;
  figureLabel?: string;
  note?: React.ReactNode;
  size?: number;
}) {
  const team = player.teamId ? teams[player.teamId] : undefined;
  return (
    <PlayerLink id={player.id} className="flex min-w-0 items-center gap-2.5 rounded-xl p-1 hover:bg-white/[0.04]">
      <PlayerAvatar
        name={player.name}
        headshot={player.position === "DST" ? team?.logo : player.headshot}
        teamColor={visibleTeamColor(team)}
        size={size}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[14px] font-medium">{player.name}</span>
          <InjuryBadge status={player.injuryStatus} />
        </span>
        <span className="block truncate text-[12px] text-muted">
          {player.position === "DST" ? "D/ST" : player.position} · {team?.abbr ?? "FA"}
          {note ? <> · {note}</> : null}
        </span>
      </span>
      {figure !== undefined && (
        <span className="shrink-0 text-right">
          <span className="tabular block text-[14px] font-semibold">{pts(figure)}</span>
          {figureLabel && <span className="block text-[11px] text-faint">{figureLabel}</span>}
        </span>
      )}
    </PlayerLink>
  );
}
