"use client";

import { TiltCard } from "@/components/motion/TiltCard";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { PointsBadge } from "@/components/ui/PointsBadge";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { visibleTeamColor } from "@/lib/color";
import type { SharedPlay } from "@/lib/chat/shared-play";
import { periodLabel } from "@/lib/format";
import { useTeams } from "@/lib/hooks/useTeams";
import { PlayerLink } from "@/components/player/PlayerLink";

/** A play shared from the feed, shown in chat as a small glass card that tilts in 3D. */
export function SharedPlayCard({ play, compact = false }: { play: SharedPlay; compact?: boolean }) {
  const teams = useTeams();
  const team = play.teamId ? teams[play.teamId] : undefined;
  const color = visibleTeamColor(team);
  return (
    <TiltCard
      max={7}
      className="glass overflow-hidden rounded-2xl p-3"
      style={{ "--glow": play.isTouchdown ? `${color}aa` : "transparent" } as React.CSSProperties}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] whitespace-nowrap">
        <span className="text-sky">Shared play</span>
        {play.isTouchdown && (
          <span className="rounded-full bg-[rgb(255_211_107/0.15)] px-1.5 py-0.5 font-semibold text-accent">Touchdown</span>
        )}
        <span className="ml-auto text-muted">
          {periodLabel(play.period)} {play.clock}
        </span>
      </div>
      <div className="mt-2 flex gap-3">
        <span className="relative shrink-0 self-start" style={{ transform: "translateZ(26px)" }}>
          <PlayerAvatar name={play.playerName} teamColor={color} size={compact ? 36 : 42} />
          {team && (
            <span className="absolute -right-1.5 -bottom-1.5 rounded-full bg-raised/90 p-0.5 ring-1 ring-line">
              <TeamLogo abbr={team.abbr} logo={team.logo} color={team.color} size={16} />
            </span>
          )}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1" style={{ transform: "translateZ(14px)" }}>
          <div className="flex min-w-0 items-center gap-2">
            <PointsBadge points={play.points} size="sm" />
            <PlayerLink id={play.playerId} className="truncate text-[14px] font-semibold text-ink hover:underline">
              {play.playerName}
            </PlayerLink>
          </div>
          {play.text && <p className={`text-[13px] leading-snug text-ink-soft ${compact ? "line-clamp-2" : ""}`}>{play.text}</p>}
        </div>
      </div>
    </TiltCard>
  );
}
