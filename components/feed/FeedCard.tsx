"use client";

import { SharePlayButton } from "@/components/chat/SharePlayButton";
import { TouchdownBurst } from "@/components/motion/TouchdownBurst";
import { PlayerLink } from "@/components/player/PlayerLink";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { PointsBadge } from "@/components/ui/PointsBadge";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { periodLabel } from "@/lib/format";
import type { FeedItem, TeamLite } from "@/lib/live/types";
import { formatBreakdown } from "@/lib/scoring";
import { useSettings } from "@/lib/settings/store";
import { visibleTeamColor } from "@/lib/color";

export type Owner = "mine" | "opponent" | "tracked";

const OWNER: Record<Owner, { text: string; cls: string }> = {
  mine: { text: "Your team", cls: "bg-accent-soft text-accent" },
  opponent: { text: "Opponent", cls: "bg-negative-soft text-negative" },
  tracked: { text: "Tracked", cls: "bg-well text-muted" },
};

/**
 * One play: who (opens the profile), whose player, when, what happened, and what it was worth.
 * A touchdown by one of your players plays the touchdown sound when it's on (Settings).
 */
export function FeedCard({
  item,
  team,
  headshot,
  isNew,
  owner,
}: {
  item: FeedItem;
  team?: TeamLite;
  headshot: string | null;
  isNew: boolean;
  owner?: Owner;
}) {
  const injury = item.kind === "injury";
  const tdSound = useSettings().value.tdSound === "on";
  const color = visibleTeamColor(team, "#4c8dff");
  return (
    <article
      className="card relative overflow-hidden p-3.5 [contain-intrinsic-size:auto_120px] [content-visibility:auto]"
    >
      {isNew && <span className="arrival-flash" style={{ "--flash": `${color}55` } as React.CSSProperties} />}
      {isNew && item.isTouchdown && <TouchdownBurst color={color} sound={owner === "mine" && tdSound} />}
      <div className="flex gap-3">
        <PlayerLink id={item.playerId} className="relative shrink-0 self-start" label={`Open ${item.playerName}`}>
          <PlayerAvatar name={item.playerName} headshot={headshot} teamColor={visibleTeamColor(team)} size={44} />
          {team && (
            <span className="absolute -right-1.5 -bottom-1.5 rounded-full bg-raised p-0.5 ring-1 ring-white/10">
              <TeamLogo abbr={team.abbr} logo={team.logo} color={team.color} size={18} />
            </span>
          )}
        </PlayerLink>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            {injury ? (
              <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[12px] font-semibold text-warning">Injury</span>
            ) : (
              <PointsBadge points={item.points} />
            )}
            <PlayerLink id={item.playerId} className="truncate text-[15px] font-semibold text-ink hover:underline">
              {item.playerName}
            </PlayerLink>
            <span className="tabular ml-auto shrink-0 text-[12px] text-muted">
              {periodLabel(item.period)} {item.clock}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {owner && <span className={`rounded-full px-1.5 py-px text-[11px] font-medium ${OWNER[owner].cls}`}>{OWNER[owner].text}</span>}
            {item.isTouchdown && <span className="text-[12px] font-semibold text-accent">Touchdown</span>}
          </div>
          <p className="text-[14px] leading-snug text-muted">{item.text}</p>
          {!injury && item.parts.length > 0 && <p className="text-[12px] text-muted">{formatBreakdown(item.parts)}</p>}
          {/* Only shows when chat is available (database connected and signed in). */}
          <SharePlayButton item={item} />
        </div>
      </div>
    </article>
  );
}
