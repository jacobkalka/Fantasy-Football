"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { LivePlayerCard } from "@/components/live/LivePlayerCard";
import { UpdatedAgo } from "@/components/live/UpdatedAgo";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { ReplayControls } from "@/components/motion/ReplayControls";
import { WeekPicker } from "@/components/team/WeekPicker";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { useMatchupLive } from "@/lib/fantasy/useMatchupLive";
import { searchPlayers, usePlayers } from "@/lib/hooks/usePlayers";
import { useNow } from "@/lib/hooks/useNow";
import { usePreference } from "@/lib/hooks/usePreference";
import { useReplay } from "@/lib/hooks/useReplay";
import { useWeekParam } from "@/lib/hooks/useTeamLive";
import { useTeams } from "@/lib/hooks/useTeams";
import { isKeyPlay } from "@/lib/live/play-text";
import type { FeedItem, PlayerLive } from "@/lib/live/types";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/motion/gsap";
import { setQueryParams } from "@/lib/nav/query";
import { headshotUrl } from "@/lib/providers";
import { isStarter, sortLineup } from "@/lib/roster/lineup";
import { roundPoints } from "@/lib/scoring";
import { settingsActions, useSettings } from "@/lib/settings/store";
import { FeedCard, type Owner } from "./FeedCard";

export const VIEWS = [
  { value: "key", label: "Key plays" },
  { value: "all", label: "All plays" },
  { value: "mine", label: "My team" },
  { value: "opponent", label: "Opponent" },
  { value: "tracker", label: "Tracker" },
] as const;
export type View = (typeof VIEWS)[number]["value"];

function isView(v: string | null | undefined): v is View {
  return VIEWS.some((x) => x.value === v);
}

/** Feed items that weren't there on the previous update, so only those get the arrival animation. */
function useNewIds(items: FeedItem[] | undefined) {
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const key = items ? items.map((i) => i.id).join(",") : null;
  useEffect(() => {
    if (key === null) return;
    const ids = key ? key.split(",") : [];
    if (seen.current === null) {
      seen.current = new Set(ids);
      return;
    }
    const added = ids.filter((id) => !seen.current!.has(id));
    ids.forEach((id) => seen.current!.add(id));
    if (added.length) setFresh(new Set(added));
  }, [key]);
  return fresh;
}

/** Tabs as a scrollable underline row; the choice lives in the URL (?view=) and on this device. */
function ViewTabs({ view, counts }: { view: View; counts: Partial<Record<View, number>> }) {
  return (
    <div role="tablist" aria-label="Live views" className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      {VIEWS.map((v) => {
        const on = v.value === view;
        return (
          <button
            key={v.value}
            role="tab"
            type="button"
            aria-selected={on}
            onClick={() => setQueryParams({ view: v.value })}
            className={`pressable inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium ${
              on ? "bg-ink text-black" : "bg-raised text-muted hover:text-ink"
            }`}
          >
            {v.label}
            {counts[v.value] !== undefined && <span className={`tabular text-[11px] ${on ? "text-black/60" : "text-faint"}`}>{counts[v.value]}</span>}
          </button>
        );
      })}
    </div>
  );
}

function TrackerAdd({ tracked }: { tracked: string[] }) {
  const [q, setQ] = useState("");
  const { players } = usePlayers(q.length > 0);
  const teams = useTeams();
  const results = players && q.trim() ? searchPlayers(players, q, (id) => (id ? (teams[id]?.abbr ?? null) : null), 6) : [];
  return (
    <div className="card p-4">
      <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3">
        <Icon name="search" size={18} className="text-faint" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Add a player to track"
          className="h-11 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-faint"
        />
      </label>
      {results.length > 0 && (
        <ul className="mt-2 flex flex-col">
          {results.map((p) => {
            const on = tracked.includes(p.id);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    settingsActions.toggleWatch(p.id);
                    setQ("");
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-[14px] hover:bg-white/[0.04]"
                >
                  <Icon name={on ? "check" : "plus"} size={16} className={on ? "text-accent" : "text-faint"} />
                  <span className="flex-1 truncate">{p.name}</span>
                  <span className="text-[12px] text-faint">
                    {p.position === "DST" ? "D/ST" : p.position} · {p.teamId ? teams[p.teamId]?.abbr : "FA"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Live: your fantasy week as it happens. Key plays and All plays cover your team, your opponent
 * and the players you track; My team, Opponent and Tracker show each player's points, projection,
 * game, possession and the plays behind the points. The tab lives in the URL (a refresh or a data
 * update never resets it) and is remembered for next time.
 */
export function FeedList() {
  const params = useSearchParams();
  const [savedView, saveView] = usePreference<View>("live-view", "key");
  const fromUrl = params.get("view");
  const view: View = isView(fromUrl) ? fromUrl : savedView;
  useEffect(() => {
    if (isView(fromUrl) && fromUrl !== savedView) saveView(fromUrl);
  }, [fromUrl, savedView, saveView]);

  const week = useWeekParam();
  const live = useMatchupLive();
  const { team, ready, data, byId, opponentIds, trackedIds, view: matchup } = live;
  const { value: settings } = useSettings();
  const teams = useTeams();
  const now = useNow(15_000);
  const allTeams = { ...teams, ...data?.teams };
  const list = useRef<HTMLUListElement>(null);

  const mine = useMemo(() => new Set(team.players.map((p) => p.playerId)), [team.players]);
  const theirs = useMemo(() => new Set(opponentIds), [opponentIds]);
  const ownerOf = (id: string): Owner => (mine.has(id) ? "mine" : theirs.has(id) ? "opponent" : "tracked");
  const headshotOf = (id: string, position?: string, teamId?: string | null) =>
    position === "DST" ? (teamId ? (allTeams[teamId]?.logo ?? null) : null) : headshotUrl(id);

  // Replay a finished week: the real plays arrive one by one, oldest first, on a sped-up clock.
  const chronological = useMemo(() => [...(data?.feed ?? [])].reverse(), [data?.feed]);
  const times = useMemo(() => chronological.map((i) => (i.wallclock ? Date.parse(i.wallclock) : NaN)), [chronological]);
  const replay = useReplay(times, { maxWaitMs: 1200 });
  const feed = replay.active ? chronological.slice(0, replay.shown).reverse() : (data?.feed ?? []);
  const fresh = useNewIds(data ? feed : undefined);
  const playsOf = useMemo(() => {
    const map = new Map<string, FeedItem[]>();
    for (const item of data?.feed ?? []) map.set(item.playerId, [...(map.get(item.playerId) ?? []), item]);
    return map;
  }, [data?.feed]);

  const feedItems = feed.filter((item) => (view === "key" ? isKeyPlay(item) : true));

  useGSAP(
    () => {
      if (prefersReducedMotion() || fresh.size === 0) return;
      const items = list.current?.querySelectorAll<HTMLElement>("[data-new]");
      if (items?.length) gsap.from(items, { y: -20, yPercent: 0, scale: 0.97, autoAlpha: 0, duration: 0.45, stagger: 0.05, ease: "back.out(1.4)" });
    },
    { scope: list, dependencies: [fresh] },
  );

  if (!ready) return <Skeleton className="h-40 rounded-[22px]" />;
  const empty = team.players.length === 0 && trackedIds.length === 0;

  const myLive = sortLineup(team.players).map((p) => ({ p, live: byId.get(p.playerId) }));
  const oppLive = matchup?.opponent ? [...matchup.opponent.starters, ...matchup.opponent.bench] : [];
  const trackedLive = settings.watchlist.map((id) => byId.get(id)).filter((p): p is PlayerLive => Boolean(p));
  const starters = new Set(team.players.filter(isStarter).map((p) => p.playerId));
  const replayTotal = roundPoints(feed.filter((i) => starters.has(i.playerId)).reduce((sum, i) => sum + i.points, 0));
  const canReplay = data !== undefined && data.week < data.currentWeek && data.feed.length > 0 && (view === "key" || view === "all");
  const counts: Partial<Record<View, number>> = {
    mine: team.players.length,
    ...(matchup?.opponent ? { opponent: oppLive.length } : {}),
    tracker: settings.watchlist.length,
  };

  const removeButton = (id: string) => (
    <button
      type="button"
      onClick={() => settingsActions.toggleWatch(id)}
      className="pressable grid size-9 shrink-0 place-items-center rounded-full text-faint hover:bg-white/[0.06] hover:text-ink"
      aria-label="Stop tracking"
    >
      <Icon name="close" size={16} />
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {data ? <WeekPicker currentWeek={data.currentWeek} week={week} /> : <span />}
        {!replay.active && <UpdatedAgo stamps={live.data} receivedAt={live.receivedAt} error={live.error} live={data?.anyLive} />}
      </div>
      <ViewTabs view={view} counts={counts} />

      {live.error && !data && !empty && <ErrorState what="ESPN isn't responding right now. New plays will appear as soon as it does." onRetry={live.refresh} />}

      {(view === "key" || view === "all") && (
        <>
          {empty ? (
            <EmptyState title="Nothing to follow yet" icon="live" action={{ label: "Connect an ESPN league", href: "/team/connect" }}>
              Live shows every play that moves your players&apos; points. Add your team, or track a few players.
            </EmptyState>
          ) : (
            <>
              {canReplay && !replay.active && (
                <Button onClick={replay.start} icon="refresh" size="sm" className="self-start">
                  Replay week {data.week}
                </Button>
              )}
              {replay.active && (
                <ReplayControls replay={replay} total={chronological.length}>
                  <div className="flex items-end justify-between px-1">
                    <span className="text-[12px] text-muted">Replaying week {data?.week} · your starters</span>
                    <span className="tabular text-[34px] leading-10 font-semibold text-ink">
                      <AnimatedNumber value={replayTotal} />
                    </span>
                  </div>
                </ReplayControls>
              )}
              {!data && !live.error && (
                <div className="flex flex-col gap-3">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-28 rounded-[22px]" />
                  ))}
                </div>
              )}
              {data && feedItems.length === 0 && (
                <EmptyState title={view === "key" ? "No key plays yet" : "No plays yet"} icon="live">
                  {data.players.some((p) => p.game?.state === "pre")
                    ? "Your players haven't touched the ball yet this week. Plays appear here seconds after they happen."
                    : "None of the plays this week moved these players' points."}
                </EmptyState>
              )}
              <ul ref={list} className="flex flex-col gap-3">
                {feedItems.map((item) => (
                  <li key={item.id} data-new={fresh.has(item.id) ? "" : undefined}>
                    <FeedCard
                      item={item}
                      team={item.teamId ? allTeams[item.teamId] : undefined}
                      headshot={headshotOf(item.playerId, byId.get(item.playerId)?.position, item.teamId)}
                      isNew={fresh.has(item.id)}
                      owner={ownerOf(item.playerId)}
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {view === "mine" &&
        (team.players.length === 0 ? (
          <EmptyState title="No team yet" icon="team" action={{ label: "Connect an ESPN league", href: "/team/connect" }}>
            Add your team to follow each player&apos;s points live.
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-3">
            {myLive.map(({ p, live: l }) =>
              l ? (
                <LivePlayerCard
                  key={p.playerId}
                  player={l}
                  plays={playsOf.get(p.playerId) ?? []}
                  teams={allTeams}
                  headshot={headshotOf(p.playerId, p.position, p.teamId)}
                  slot={p.slot === "BENCH" ? "BN" : p.slot === "DST" ? "D/ST" : p.slot}
                  now={now}
                />
              ) : (
                <Skeleton key={p.playerId} className="h-[110px] rounded-[22px]" />
              ),
            )}
          </div>
        ))}

      {view === "opponent" &&
        (!team.espn ? (
          <EmptyState title="Opponents come from your ESPN league" icon="versus" action={{ label: "Connect an ESPN league", href: "/team/connect" }}>
            Hand-built teams don&apos;t have an opponent. Connect your league to follow your opponent&apos;s players live.
          </EmptyState>
        ) : !matchup ? (
          <Skeleton className="h-40 rounded-[22px]" />
        ) : !matchup.opponent ? (
          <EmptyState title="No opponent this week" icon="info">
            {team.name} has a bye in week {matchup.week}.
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-[14px] text-muted">
              <span className="font-medium text-ink">{matchup.opponent.name}</span> · {matchup.opponent.record} ·{" "}
              <Link href="/team/matchup" className="text-accent hover:underline">
                Matchup
              </Link>
            </p>
            {oppLive.map(({ entry, live: l }) =>
              l ? (
                <LivePlayerCard
                  key={entry.playerId}
                  player={l}
                  plays={playsOf.get(entry.playerId) ?? []}
                  teams={allTeams}
                  headshot={headshotOf(entry.playerId, entry.position, entry.teamId)}
                  slot={entry.slot === "BENCH" ? "BN" : entry.slot === "DST" ? "D/ST" : entry.slot}
                  now={now}
                />
              ) : (
                <Skeleton key={entry.playerId} className="h-[110px] rounded-[22px]" />
              ),
            )}
          </div>
        ))}

      {view === "tracker" && (
        <div className="flex flex-col gap-3">
          <TrackerAdd tracked={settings.watchlist} />
          {settings.watchlist.length === 0 ? (
            <EmptyState title="No players tracked" icon="eye">
              Track anyone (a waiver target, your opponent&apos;s star, a player you&apos;re thinking of trading for) and follow
              their points, projection and every scoring play here. Tap Track on any player&apos;s profile too.
            </EmptyState>
          ) : (
            <>
              {trackedLive.map((l) => (
                <LivePlayerCard
                  key={l.playerId}
                  player={l}
                  plays={playsOf.get(l.playerId) ?? []}
                  teams={allTeams}
                  headshot={headshotOf(l.playerId, l.position, l.teamId)}
                  now={now}
                  action={removeButton(l.playerId)}
                />
              ))}
              {settings.watchlist.length > trackedLive.length && !data && (
                <Skeleton className="h-[110px] rounded-[22px]" />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
