"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { PlayerChip } from "@/components/player/PlayerChip";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Segmented } from "@/components/ui/Segmented";
import { Sheet } from "@/components/ui/Sheet";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { UpdatedAgo } from "@/components/live/UpdatedAgo";
import { useLiveWeek } from "@/lib/fantasy/context";
import { pts } from "@/lib/format";
import { useLeagueNews, useMyPlayersNews } from "@/lib/hooks/useNews";
import { useNow } from "@/lib/hooks/useNow";
import { useRankings } from "@/lib/hooks/useRankings";
import { useTeams } from "@/lib/hooks/useTeams";
import { setQueryParams } from "@/lib/nav/query";
import { headshotUrl } from "@/lib/providers";
import type { NewsArticle, Position } from "@/lib/providers/types";
import { ArticleCard, timeAgo } from "./ArticleCard";

const TABS = [
  { value: "mine", label: "Your players" },
  { value: "league", label: "League news" },
] as const;
type Tab = (typeof TABS)[number]["value"];

const CATEGORIES = ["All", "Injury", "Player update", "Fantasy", "Transaction", "News", "Story", "Video"] as const;

/**
 * News, two ways: stories about the players on your selected team (ESPN's fantasy news per
 * player), and ESPN's league-wide NFL news. Tap a story to read the summary, see who it's about
 * (each opens their profile, with what they mean to your team), and continue on ESPN.
 * Nothing is rewritten or invented: headlines, summaries and photos are ESPN's.
 */
export function NewsScreen() {
  const params = useSearchParams();
  const tab: Tab = params.get("tab") === "league" ? "league" : "mine";
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("All");
  const [open, setOpen] = useState<NewsArticle | null>(null);
  const mine = useMyPlayersNews(tab === "mine");
  const league = useLeagueNews(tab === "league" || !mine.hasPlayers);
  const teams = useTeams();
  const ranks = useRankings();
  const week = useLiveWeek();
  const now = useNow(30_000);

  const source = tab === "mine" ? mine : league;
  const names = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of ranks.rows ?? []) map.set(r.id, r.name);
    for (const p of mine.team.players) map.set(p.playerId, p.name);
    return map;
  }, [ranks.rows, mine.team.players]);
  const myIds = useMemo(() => new Set(mine.team.players.map((p) => p.playerId)), [mine.team.players]);
  const articles = (source.data?.articles ?? []).filter((a) => category === "All" || a.category === category);
  const present = new Set((source.data?.articles ?? []).map((a) => a.category));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented options={TABS} value={tab} onChange={(v) => setQueryParams({ tab: v === "mine" ? null : v })} label="News" />
        <UpdatedAgo stamps={source.data} receivedAt={source.receivedAt} error={source.error} />
      </div>
      <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="group" aria-label="Category">
        {CATEGORIES.filter((c) => c === "All" || present.has(c)).map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={category === c}
            onClick={() => setCategory(c)}
            className={`pressable h-8 shrink-0 rounded-full px-3 text-[13px] ${category === c ? "bg-well font-medium text-ink" : "glass-chip text-muted hover:text-ink"}`}
          >
            {c}
          </button>
        ))}
      </div>

      {tab === "mine" && !mine.hasPlayers ? (
        <EmptyState title="No players on this team yet" icon="news" action={{ label: "Read league news", onClick: () => setQueryParams({ tab: "league" }) }}>
          Add your team and this tab follows every story about your players.
        </EmptyState>
      ) : source.error && !source.data ? (
        <ErrorState what="Couldn't load ESPN news right now." onRetry={source.refresh} />
      ) : !source.data ? (
        <div className="grid gap-4 md:grid-cols-2" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-72 rounded-[22px]" />
          ))}
        </div>
      ) : articles.length === 0 ? (
        <EmptyState
          title={tab === "mine" ? "No stories about your players yet" : "No stories in this category"}
          icon="news"
          action={tab === "mine" ? { label: "View league news", onClick: () => setQueryParams({ tab: "league" }) } : undefined}
        >
          {tab === "mine" ? "ESPN hasn't published anything about your roster lately." : "Try another category."}
        </EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {articles.map((a) => (
            <ArticleCard key={a.id} article={a} names={names} teams={teams} onOpen={setOpen} highlight={myIds} />
          ))}
        </div>
      )}
      <p className="text-[12px] text-faint">News from ESPN. Full articles open on ESPN.com.</p>

      <Sheet open={Boolean(open)} onClose={() => setOpen(null)} title={open?.headline ?? "Story"} hideTitle size="lg">
        {open && (
          <article className="flex flex-col gap-4">
            {open.image && (
              <div className="relative -mx-5 aspect-[16/8] overflow-hidden sm:mx-0 sm:rounded-2xl">
                <Image src={open.image} alt="" fill sizes="760px" className="object-cover" />
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-faint">
              <span className="rounded-full bg-well px-2 py-0.5 font-medium text-muted">{open.category}</span>
              <span>{timeAgo(open.published, now)}</span>
              <span aria-hidden="true">·</span>
              <span>{open.source}</span>
            </div>
            <h2 className="text-[22px] leading-7 font-semibold tracking-[-0.01em]">{open.headline}</h2>
            {open.description && <p className="text-[15px] leading-6 text-muted">{open.description}</p>}
            {open.playerIds.length > 0 && (
              <section className="well p-3">
                <p className="mb-1 text-[13px] font-medium">Who it&apos;s about</p>
                {open.playerIds.slice(0, 6).map((id) => {
                  const ranked = ranks.byId?.get(id);
                  const live = week.byId.get(id);
                  const name = names.get(id) ?? open.playerNames[id];
                  if (!name) return null;
                  return (
                    <PlayerChip
                      key={id}
                      player={{
                        id,
                        name,
                        position: (ranked?.position ?? live?.position ?? "WR") as Position,
                        teamId: ranked?.teamId ?? live?.teamId ?? null,
                        headshot: ranked?.headshot ?? headshotUrl(id),
                        injuryStatus: ranked?.injuryStatus,
                      }}
                      teams={teams}
                      figure={ranked ? ranked.ppg : undefined}
                      figureLabel={ranked ? "per game" : undefined}
                      note={myIds.has(id) ? "on your team" : ranked ? `#${ranked.overallRank} overall` : undefined}
                    />
                  );
                })}
                {open.playerIds.some((id) => myIds.has(id)) && (
                  <p className="mt-2 text-[12px] text-muted">
                    {open.playerIds
                      .filter((id) => myIds.has(id) && week.byId.get(id))
                      .map((id) => {
                        const l = week.byId.get(id)!;
                        return `${l.name}: ${pts(l.points)} this week${l.projection !== null ? ` (proj ${pts(l.projection)})` : ""}`;
                      })
                      .join(" · ")}
                  </p>
                )}
              </section>
            )}
            {open.link && (
              <ButtonLink href={open.link} variant="primary" iconRight="external" className="self-start">
                Read the full story on ESPN
              </ButtonLink>
            )}
            {!open.link && (
              <p className="flex items-center gap-1.5 text-[13px] text-faint">
                <Icon name="info" size={14} /> This update has no full article.
              </p>
            )}
          </article>
        )}
      </Sheet>
    </div>
  );
}
