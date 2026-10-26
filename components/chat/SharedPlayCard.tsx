"use client";

import { PlayerLink } from "@/components/player/PlayerLink";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { PointsBadge } from "@/components/ui/PointsBadge";
import { TeamLogo } from "@/components/ui/TeamLogo";
import type { SharedPlay } from "@/lib/chat/shared-play";
import { visibleTeamColor } from "@/lib/color";
import { periodLabel } from "@/lib/format";
import { usePlayerIndex } from "@/lib/hooks/usePlayers";
import { useTeams } from "@/lib/hooks/useTeams";

/** A play shared from the Live feed, shown in chat as a small card. The player opens his profile. */
export function SharedPlayCard({ play, compact = false }: { play: SharedPlay; compact?: boolean }) {
  const teams = useTeams();
  const index = usePlayerIndex();
  const team = play.teamId ? teams[play.teamId] : undefined;
  const known = index.get(play.playerId);
  return (
    <div className="well w-full max-w-[420px] p-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] whitespace-nowrap">
        <span className="text-muted">Shared play</span>
        {play.isTouchdown && <span className="font-semibold">Touchdown</span>}
        <span className="tabular ml-auto text-faint">
          {periodLabel(play.period)} {play.clock}
        </span>
      </div>
      <div className="mt-2 flex gap-3">
        <PlayerLink id={play.playerId} className="relative shrink-0 self-start" label={`Open ${play.playerName}`}>
          <PlayerAvatar name={play.playerName} headshot={known?.headshot ?? null} teamColor={visibleTeamColor(team)} size={compact ? 36 : 42} />
          {team && (
            <span className="absolute -right-1.5 -bottom-1.5 rounded-full bg-well p-0.5">
              <TeamLogo abbr={team.abbr} logo={team.logo} color={team.color} size={16} />
            </span>
          )}
        </PlayerLink>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-2">
            <PointsBadge points={play.points} size="sm" />
            <PlayerLink id={play.playerId} className="truncate text-[14px] font-semibold hover:underline">
              {play.playerName}
            </PlayerLink>
          </div>
          {play.text && <p className={`text-[13px] leading-snug text-muted ${compact ? "line-clamp-2" : ""}`}>{play.text}</p>}
        </div>
      </div>
    </div>
  );
}
