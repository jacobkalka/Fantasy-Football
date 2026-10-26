"use client";

import Link from "next/link";
import { useMemo } from "react";
import { UpdatedAgo } from "@/components/live/UpdatedAgo";
import { MatchupStrip } from "@/components/matchup/MatchupStrip";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { Reveal } from "@/components/motion/Reveal";
import { ArticleCard } from "@/components/news/ArticleCard";
import { PlayerLink } from "@/components/player/PlayerLink";
import { BringYourTeam, InstallCard } from "@/components/pwa";
import { GameStatus } from "@/components/team/GameStatus";
import { Possession } from "@/components/team/Possession";
import { TeamHealth } from "@/components/team/TeamHealth";
import { LeagueStatus } from "@/components/teams/LeagueStatus";
import { TeamSwitcher } from "@/components/teams/TeamSwitcher";
import { ButtonLink } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Icon, type IconName } from "@/components/ui/Icon";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { ErrorState, Skeleton, SkeletonRows } from "@/components/ui/States";
import { visibleTeamColor } from "@/lib/color";
import { projectPlayer, projectTeam } from "@/lib/fantasy/projection";
import { useMatchupLive } from "@/lib/fantasy/useMatchupLive";
import { kickoffLabel, pts } from "@/lib/format";
import { lineupDecisions } from "@/lib/home/decisions";
import { recommendedActions, type Action } from "@/lib/home/actions";
import { useLeagueNews, useMyPlayersNews } from "@/lib/hooks/useNews";
import { useRankings } from "@/lib/hooks/useRankings";
import { useTeamAnalysis } from "@/lib/hooks/useTeamAnalysis";
import { useTeams } from "@/lib/hooks/useTeams";
import type { PlayerLive } from "@/lib/live/types";
import { openPlayer } from "@/lib/nav/query";
import { isStarter, sortLineup } from "@/lib/roster/lineup";
import { specLabel } from "@/lib/scoring/spec";

const TONE: Record<Action["tone"], { icon: IconName; cls: string }> = {
  urgent: { icon: "alert", cls: "text-negative" },
  opportunity: { icon: "bolt", cls: "text-accent" },
  info: { icon: "trend", cls: "text-positive" },
};

function Welcome() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <BringYourTeam />
      <section className="card flex flex-col gap-4 p-6">
        <h2 className="text-[22px] leading-7 font-semibold tracking-[-0.02em]">Bring in your team</h2>
        <p className="text-[15px] leading-6 text-muted">
          Connect your ESPN league for your real roster, scoring, opponent and standings, all live. Or build a team by hand in
          a minute.
        </p>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/team/connect" variant="primary" icon="link" size="lg">
            Connect an ESPN league
          </ButtonLink>
          <ButtonLink href="/team/edit" icon="edit" size="lg">
            Build by hand
          </ButtonLink>
        </div>
      </section>
      <Card className="flex flex-col gap-3">
        <h2 className="text-[16px] leading-6 font-semibold">Or look around first</h2>
        <ul className="-mx-2 flex flex-col">
          {[
            { href: "/players", icon: "rank" as const, title: "Season rankings", sub: "Every player, sorted the way you want" },
            { href: "/start-sit", icon: "swap" as const, title: "Compare any two players", sub: "Who to start, how sure we are, and why" },
            { href: "/games", icon: "live" as const, title: "This week's games", sub: "Scores, odds and kickoffs" },
            { href: "/news", icon: "news" as const, title: "News", sub: "Injuries, transactions and fantasy analysis" },
          ].map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="flex min-h-14 items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/[0.04]">
                <Icon name={item.icon} className="text-accent" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] leading-5 font-medium">{item.title}</span>
                  <span className="block text-[13px] leading-5 text-muted">{item.sub}</span>
                </span>
                <Icon name="chevronRight" size={16} className="text-faint" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
      <InstallCard className="lg:col-span-2" />
    </div>
  );
}

/**
 * Home, the command center: the selected team's week at a glance (matchup or points), what to do
 * about it, team health, who's playing right now, and the news that matters to your players.
 * Every block links to the screen that goes deeper. All numbers come from the shared live data.
 */
export function HomeDashboard() {
  const live = useMatchupLive();
  const { team, ready, data, byId, view } = live;
  const analysis = useTeamAnalysis({ pickups: true });
  const ranks = useRankings();
  const teams = useTeams();
  const myNews = useMyPlayersNews(ready && team.players.length > 0);
  const leagueNews = useLeagueNews(ready);
  const allTeams = { ...teams, ...data?.teams };

  const lineup = useMemo(() => sortLineup(team.players), [team.players]);
  const decisions = useMemo(() => (data ? lineupDecisions(team.players, byId) : []), [data, team.players, byId]);
  const rosterIds = useMemo(() => new Set(team.players.map((p) => p.playerId)), [team.players]);
  const actions = useMemo(
    () =>
      recommendedActions({
        decisions,
        weaknesses: analysis.weaknesses,
        pickups: analysis.pickups?.pickups ?? [],
        ranked: ranks.rows,
        rosterIds,
        taken: new Set(team.taken),
        isLeague: Boolean(team.espn),
      }),
    [decisions, analysis.weaknesses, analysis.pickups, ranks.rows, rosterIds, team.taken, team.espn],
  );

  if (!ready) {
    return (
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]" aria-busy="true" aria-label="Loading your team">
        <Skeleton className="h-56 rounded-[22px]" />
        <Skeleton className="h-56 rounded-[22px]" />
      </div>
    );
  }

  const header = (
    <div className="flex flex-col gap-1 pt-2 pb-4 lg:pt-6">
      <h1 className="sr-only">Home</h1>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TeamSwitcher variant="hero" />
        <UpdatedAgo stamps={live.data} receivedAt={live.receivedAt} error={live.error} live={data?.anyLive} />
      </div>
    </div>
  );

  if (team.players.length === 0) {
    return (
      <>
        {header}
        <Welcome />
      </>
    );
  }

  const starters = lineup.filter(isStarter);
  const startersLive = starters.map((p) => byId.get(p.playerId)).filter((p): p is PlayerLive => Boolean(p));
  const totals = projectTeam(startersLive, view?.me.espn.otherPoints ?? 0);
  const playingNow = lineup.map((p) => byId.get(p.playerId)).filter((p): p is PlayerLive => p?.game?.state === "in");
  const upcoming = lineup
    .map((p) => ({ p, l: byId.get(p.playerId) }))
    .filter(({ l }) => l?.game?.state === "pre")
    .sort((a, b) => a.l!.game!.kickoff.localeCompare(b.l!.game!.kickoff))
    .slice(0, 4);

  // The one finding, first: the state of your week in a sentence.
  const finding = (() => {
    if (view?.opponent) {
      const margin = view.me.projection.points - view.opponent.projection.points;
      const started = totals.playing + totals.done > 0 || view.opponent.projection.playing + view.opponent.projection.done > 0;
      if (!started) {
        return `Week ${view.week} vs ${view.opponent.name}: projected ${pts(view.projected.me)} to ${pts(view.projected.opponent)}${
          view.win ? `, ${Math.round(view.win.probability * 100)}% to win` : ""
        }.`;
      }
      return `${margin >= 0 ? "You lead" : "You trail"} ${view.opponent.name} by ${pts(Math.abs(margin))} · ${totals.playing} playing, ${totals.yetToPlay} still to play.`;
    }
    if (decisions.length) return `${decisions.length} lineup ${decisions.length === 1 ? "decision" : "decisions"} to make before kickoff.`;
    return `${specLabel({ format: team.format, rules: team.rules })} · ${totals.playing} playing, ${totals.yetToPlay} still to play this week.`;
  })();

  const myArticles = myNews.data?.articles ?? [];
  const leagueArticles = (leagueNews.data?.articles ?? []).filter((a) => !myArticles.some((m) => m.id === a.id));
  const headlines = [...myArticles.slice(0, 2), ...leagueArticles].slice(0, 3);
  const names = new Map(team.players.map((p) => [p.playerId, p.name]));

  return (
    <>
      {header}
      <p className="-mt-2 mb-4 text-[15px] leading-6 text-ink">{finding}</p>
      {live.error && !data && <ErrorState className="mb-4" what="ESPN isn't responding right now. This fills in as soon as it does." onRetry={live.refresh} />}

      <Reveal className="grid gap-4 lg:grid-cols-[1.25fr_1fr]" stagger>
        {/* ── My matchup / my week ───────────────────────────── */}
        <section className="card p-5">
          <CardHeader
            title={view ? "My matchup" : "This week"}
            subtitle={data ? `Week ${data.week} · ${specLabel({ format: team.format, rules: team.rules })}` : undefined}
            href={view ? "/team/matchup" : "/team"}
            hrefLabel={view ? "Matchup" : "Lineup"}
          />
          {view ? (
            <MatchupStrip view={view} />
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
                <div>
                  <p className="text-[13px] text-muted">Points so far</p>
                  <p className="text-[44px] leading-[48px] font-semibold tracking-[-0.03em]">
                    {data ? <AnimatedNumber value={totals.points} className="text-accent" /> : <span className="skeleton inline-block h-11 w-32 rounded-md align-middle" aria-hidden="true" />}
                  </p>
                </div>
                <div>
                  <p className="text-[13px] text-muted">{totals.playing > 0 ? "On pace for (estimate)" : "Projected"}</p>
                  <p className="tabular text-[24px] leading-8 font-semibold">{data ? pts(totals.projected) : "–"}</p>
                </div>
              </div>
              <p className="mt-4 text-[13px] text-muted">
                Matchups, opponents and win probability come with an ESPN league.{" "}
                <Link href="/team/connect" className="font-medium text-accent hover:underline">
                  Connect one
                </Link>
              </p>
            </>
          )}
          {team.espn && <LeagueStatus className="mt-4" />}
        </section>

        {/* ── Recommended actions ────────────────────────────── */}
        <Card>
          <CardHeader title="Recommended" subtitle={actions.length ? `${actions.length} things worth a look` : undefined} />
          {!data && analysis.loading ? (
            <SkeletonRows rows={3} height={64} />
          ) : actions.length === 0 ? (
            <div className="well flex items-start gap-3 p-4">
              <Icon name="check" className="text-positive" />
              <div>
                <p className="text-[15px] font-medium">Nothing urgent</p>
                <p className="mt-0.5 text-[14px] text-muted">Your lineup is set and no move clearly improves your team right now.</p>
              </div>
            </div>
          ) : (
            <ul className="-mx-1 flex flex-col gap-1">
              {actions.map((a) => (
                <li key={a.id}>
                  <Link
                    href={a.href}
                    onClick={(e) => {
                      if (a.playerId && a.href.startsWith("/players/")) {
                        e.preventDefault();
                        openPlayer(a.playerId);
                      }
                    }}
                    className="flex items-start gap-3 rounded-2xl p-2.5 transition-colors hover:bg-white/[0.04]"
                  >
                    <Icon name={TONE[a.tone].icon} size={18} className={`mt-0.5 ${TONE[a.tone].cls}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] leading-5 font-medium">{a.title}</span>
                      <span className="mt-0.5 block text-[13px] leading-5 text-muted">{a.detail}</span>
                    </span>
                    <span className="mt-0.5 shrink-0 text-[12px] font-medium text-accent">{a.cta} →</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ── Live now ───────────────────────────────────────── */}
        <Card>
          <CardHeader
            title={playingNow.length ? "Live now" : "Next up"}
            subtitle={playingNow.length ? `${playingNow.length} of your players on the field` : "Your players who haven't played yet"}
            href="/feed?view=mine"
            hrefLabel="Live"
          />
          {!data ? (
            <SkeletonRows rows={3} height={56} />
          ) : playingNow.length ? (
            <ul className="-mx-1 flex flex-col">
              {playingNow.slice(0, 6).map((l) => {
                const t = l.teamId ? allTeams[l.teamId] : undefined;
                return (
                  <li key={l.playerId}>
                    <PlayerLink id={l.playerId} className="flex items-center gap-3 rounded-xl p-1.5 hover:bg-white/[0.04]">
                      <PlayerAvatar name={l.name} headshot={l.position === "DST" ? t?.logo : (team.players.find((p) => p.playerId === l.playerId)?.headshot ?? null)} teamColor={visibleTeamColor(t)} size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-medium">{l.name}</span>
                        <span className="block truncate text-[12px]">
                          <GameStatus game={l.game} teams={allTeams} />
                        </span>
                        <Possession game={l.game} position={l.position} />
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="tabular block text-[16px] font-semibold">{pts(l.points)}</span>
                        <span className="tabular block text-[11px] text-faint">est {pts(projectPlayer(l).projected)}</span>
                      </span>
                    </PlayerLink>
                  </li>
                );
              })}
            </ul>
          ) : upcoming.length ? (
            <ul className="-mx-1 flex flex-col">
              {upcoming.map(({ p, l }) => {
                const t = p.teamId ? allTeams[p.teamId] : undefined;
                const opp = l?.game ? allTeams[l.game.opponentId]?.abbr : undefined;
                return (
                  <li key={p.playerId}>
                    <PlayerLink id={p.playerId} className="flex min-h-12 items-center gap-3 rounded-xl p-1.5 hover:bg-white/[0.04]">
                      <PlayerAvatar name={p.name} headshot={p.position === "DST" ? t?.logo : p.headshot} teamColor={visibleTeamColor(t)} size={34} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-medium">{p.name}</span>
                        <span className="block truncate text-[12px] text-muted">
                          {l?.game ? kickoffLabel(l.game.kickoff) : ""}
                          {opp ? ` ${l?.game?.isHome ? "vs" : "@"} ${opp}` : ""}
                        </span>
                      </span>
                      {l?.projection != null && <span className="tabular text-[12px] text-faint">proj {pts(l.projection)}</span>}
                    </PlayerLink>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-[14px] text-muted">Your players&apos; games this week are all done.</p>
          )}
        </Card>

        {/* ── Team health ────────────────────────────────────── */}
        <Card>
          <CardHeader title="Team health" href="/team" hrefLabel="Team" />
          <TeamHealth rating={analysis.rating} weaknesses={analysis.weaknesses} loading={analysis.loading} error={analysis.error} onRetry={analysis.refresh} compact />
        </Card>

        {/* ── News ───────────────────────────────────────────── */}
        <Card className="lg:col-span-2">
          <CardHeader title="News" subtitle={myArticles.length ? "Your players first" : "Across the NFL"} href="/news" hrefLabel="All news" />
          {headlines.length === 0 ? (
            leagueNews.error && myNews.error ? (
              <ErrorState what="Couldn't load ESPN news." onRetry={leagueNews.refresh} />
            ) : (
              <SkeletonRows rows={3} height={64} />
            )
          ) : (
            <div className="grid gap-2 md:grid-cols-3">
              {headlines.map((a) => (
                <ArticleCard key={a.id} article={a} names={names} teams={allTeams} variant="compact" />
              ))}
            </div>
          )}
        </Card>
      </Reveal>
      <div className="mt-4">
        <InstallCard />
      </div>
    </>
  );
}
