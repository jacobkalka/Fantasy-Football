"use client";

import { SharePlayButton } from "@/components/chat/SharePlayButton";
import { TouchdownBurst } from "@/components/motion/TouchdownBurst";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { PointsBadge } from "@/components/ui/PointsBadge";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { periodLabel } from "@/lib/format";
import type { FeedItem, TeamLite } from "@/lib/live/types";
import { formatBreakdown } from "@/lib/scoring";
import { visibleTeamColor } from "@/lib/color";

/** One play in the feed: who, when, what happened, and what it was worth. */
export function FeedCard({
  item,
  team,
  headshot,
  isNew,
  onOpenPlayer,
}: {
  item: FeedItem;
  team?: TeamLite;
  headshot: string | null;
  isNew: boolean;
  onOpenPlayer?: () => void;
}) {
  const injury = item.kind === "injury";
  return (
    <article
      className="glass overflow-hidden p-3.5 [contain-intrinsic-size:auto_120px] [content-visibility:auto]"
      style={{ "--glow": item.isTouchdown ? `${visibleTeamColor(team, "#c8ff2e")}cc` : "transparent" } as React.CSSProperties}
    >
      {isNew && <span className="arrival-flash" style={{ "--flash": `${visibleTeamColor(team, "#c8ff2e")}66` } as React.CSSProperties} />}
      {isNew && item.isTouchdown && <TouchdownBurst color={visibleTeamColor(team, "#c8ff2e")} />}
      <div className="flex gap-3">
        <button type="button" onClick={onOpenPlayer} className="relative shrink-0 self-start" aria-label={`Open ${item.playerName}`}>
          <PlayerAvatar name={item.playerName} headshot={headshot} teamColor={visibleTeamColor(team)} size={44} />
          {team && (
            <span className="absolute -right-1.5 -bottom-1.5 rounded-full bg-raised/90 p-0.5 ring-1 ring-line">
              <TeamLogo abbr={team.abbr} logo={team.logo} color={team.color} size={18} />
            </span>
          )}
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            {injury ? (
              <span className="rounded-md bg-alert/15 px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-[0.08em] text-alert ring-1 ring-alert/40">
                INJURY
              </span>
            ) : (
              <PointsBadge points={item.points} />
            )}
            <span className="truncate text-[15px] font-semibold text-ink-strong">{item.playerName}</span>
            <span className="ml-auto shrink-0 font-mono text-[11px] text-muted">
              {periodLabel(item.period)} {item.clock}
            </span>
          </div>
          {item.isTouchdown && (
            <span className="font-mono text-[10px] font-bold tracking-[0.16em] text-gain uppercase">Touchdown</span>
          )}
          <p className="text-[14px] leading-snug text-ink-soft">{item.text}</p>
          {!injury && item.parts.length > 0 && (
            <p className="font-mono text-[11px] text-muted">{formatBreakdown(item.parts)}</p>
          )}
          {/* Only shows when chat is available (database connected and signed in). */}
          <SharePlayButton item={item} />
        </div>
      </div>
    </article>
  );
}
