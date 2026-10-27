"use client";

import Image from "next/image";
import { PlayerLink } from "@/components/player/PlayerLink";
import { Icon } from "@/components/ui/Icon";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { visibleTeamColor } from "@/lib/color";
import { headshotUrl } from "@/lib/providers";
import type { NewsArticle } from "@/lib/providers/types";
import type { TeamLite } from "@/lib/live/types";
import { agoLabel } from "@/lib/format";
import { useNow } from "@/lib/hooks/useNow";

const CATEGORY_TONE: Record<string, string> = {
  Injury: "bg-negative-soft text-negative",
  "Player update": "bg-accent-soft text-accent",
  Fantasy: "bg-accent-soft text-accent",
  Transaction: "bg-warning-soft text-warning",
  Video: "bg-positive-soft text-positive",
};

export function timeAgo(iso: string, now: number) {
  const t = Date.parse(iso);
  if (!now || !Number.isFinite(t)) return "";
  const ms = now - t;
  if (ms > 6 * 24 * 3600_000) return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return agoLabel(ms);
}

/**
 * One news story as a card: image, category, headline, summary, time, source, and the players
 * and teams it's about (players open their profile). Reading the full article happens on ESPN:
 * only the headline, summary and image ESPN publishes in its feed are shown here.
 */
export function ArticleCard({
  article,
  names,
  teams,
  onOpen,
  variant = "card",
  highlight,
}: {
  article: NewsArticle;
  /** Player id → name, for the chips (players on your team, in the universe). */
  names: Map<string, string>;
  teams: Record<string, TeamLite>;
  /** Open the in-app reader sheet. Without it, the card links straight to ESPN. */
  onOpen?: (article: NewsArticle) => void;
  variant?: "card" | "compact";
  /** Player ids to call out ("Your player"). */
  highlight?: ReadonlySet<string>;
}) {
  const now = useNow(30_000);
  const nameOf = (id: string) => names.get(id) ?? article.playerNames[id];
  const players = article.playerIds.filter((id) => nameOf(id)).slice(0, 4);
  const team = article.teamIds.map((id) => teams[id]).find(Boolean);
  const mine = highlight ? article.playerIds.filter((id) => highlight.has(id)) : [];
  const open = () => (onOpen ? onOpen(article) : article.link && window.open(article.link, "_blank", "noopener"));

  if (variant === "compact") {
    return (
      <button type="button" onClick={open} className="tile flex w-full items-start gap-3 p-3 text-left">
        {article.image ? (
          <span className="relative h-14 w-20 shrink-0 overflow-hidden rounded-[10px] bg-well">
            <Image src={article.image} alt="" fill sizes="80px" className="object-cover" />
          </span>
        ) : players[0] ? (
          <PlayerAvatar name={nameOf(players[0]) ?? ""} headshot={headshotUrl(players[0])} size={44} />
        ) : null}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-[11px] font-medium text-faint">
            <span className={`rounded-full px-1.5 py-px ${CATEGORY_TONE[article.category] ?? "bg-well text-muted"}`}>
              {article.category}
            </span>
            {timeAgo(article.published, now)}
          </span>
          <span className="mt-1 line-clamp-2 block text-[14px] leading-5 font-medium">{article.headline}</span>
        </span>
      </button>
    );
  }

  return (
    <article className="card group overflow-hidden">
      {article.image && (
        <button type="button" onClick={open} className="relative block aspect-[16/8] w-full overflow-hidden" tabIndex={-1} aria-hidden="true">
          <Image
            src={article.image}
            alt=""
            fill
            sizes="(min-width: 1024px) 400px, 100vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
          {team && (
            <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-black/70 py-1 pr-2.5 pl-1 text-[12px] font-medium">
              <TeamLogo abbr={team.abbr} logo={team.logo} color={team.color} size={20} />
              {team.abbr}
            </span>
          )}
        </button>
      )}
      <div className="flex flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-faint">
          <span className={`rounded-full px-2 py-0.5 font-medium ${CATEGORY_TONE[article.category] ?? "bg-well text-muted"}`}>
            {article.category}
          </span>
          {mine.length > 0 && (
            <span className="rounded-full bg-accent-soft px-2 py-0.5 font-medium text-accent">Your player</span>
          )}
          <span>{timeAgo(article.published, now)}</span>
          <span aria-hidden="true">·</span>
          <span className="truncate">{article.source}</span>
        </div>
        <h3 className="text-[16px] leading-[22px] font-semibold tracking-[-0.01em]">
          <button type="button" onClick={open} className="text-left hover:underline">
            {article.headline}
          </button>
        </h3>
        {article.description && article.description !== article.headline && (
          <p className="line-clamp-3 text-[14px] leading-5 text-muted">{article.description}</p>
        )}
        {players.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {players.map((id) => {
              const t = teams[article.teamIds[0] ?? ""];
              return (
                <PlayerLink
                  key={id}
                  id={id}
                  className="bg-raised inline-flex items-center gap-1.5 rounded-full py-0.5 pr-2.5 pl-0.5 text-[12px] font-medium hover:bg-well"
                >
                  <PlayerAvatar name={nameOf(id)!} headshot={headshotUrl(id)} size={22} teamColor={visibleTeamColor(t)} />
                  {nameOf(id)}
                </PlayerLink>
              );
            })}
          </div>
        )}
        {article.link && (
          <a
            href={article.link}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-1 self-start text-[13px] font-medium text-accent hover:underline"
          >
            Read on ESPN <Icon name="external" size={14} />
          </a>
        )}
      </div>
    </article>
  );
}
