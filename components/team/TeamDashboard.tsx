"use client";

import Link from "next/link";
import { UpdatedAgo } from "@/components/live/UpdatedAgo";
import { MatchupStrip } from "@/components/matchup/MatchupStrip";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { Reveal } from "@/components/motion/Reveal";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Segmented } from "@/components/ui/Segmented";
import { EmptyState, ErrorState, Skeleton, SkeletonRows } from "@/components/ui/States";
import { useWeekParam } from "@/lib/hooks/useTeamLive";
import { projectTeam } from "@/lib/fantasy/projection";
import { useMatchupLive } from "@/lib/fantasy/useMatchupLive";
import { pts } from "@/lib/format";
import { usePreference } from "@/lib/hooks/usePreference";
import { useTeamAnalysis } from "@/lib/hooks/useTeamAnalysis";
import { useTeams } from "@/lib/hooks/useTeams";
import type { PlayerLive } from "@/lib/live/types";
import { isStarter, sortLineup } from "@/lib/roster/lineup";
import { specLabel } from "@/lib/scoring/spec";
import { LeagueStatus } from "@/components/teams/LeagueStatus";
import { LineupField } from "./LineupField";
import { PlayerRow } from "./PlayerRow";
import { TeamHealth } from "./TeamHealth";
import { WeekPicker } from "./WeekPicker";
import { WeeklyScoreChart } from "./WeeklyScoreChart";
import { openPlayer } from "@/lib/nav/query";

const VIEWS = [
  { value: "list", label: "List" },
  { value: "field", label: "Field" },
] as const;

/** The same frame as the loaded screen, so nothing jumps when data arrives. */
function LineupSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading your team">
      <Card>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-3 h-10 w-28" />
        <Skeleton className="mt-3 h-4 w-56" />
      </Card>
      <Card>
        <SkeletonRows rows={9} height={64} />
      </Card>
    </div>
  );
}

/**
 * My Team: this week's live points and where it's heading, your lineup (live, with who has the
 * ball), your matchup (connected leagues), team health and the moves that would fix it, and
 * how your team has scored week to week. Every number comes from the shared live answer.
 */
export function TeamDashboard() {
  const week = useWeekParam();
  const live = useMatchupLive();
  const { team, ready, data, byId, view, league } = live;
  const analysis = useTeamAnalysis();
  const teams = useTeams();
  const [layout, setLayout] = usePreference<"field" | "list">("lineup-view", "list");
  const allTeams = { ...teams, ...data?.teams };
  // Looking back at last week: only the roster's points (opponents' past lineups aren't kept).
  const lookingBack = week !== undefined && data !== undefined && week !== data.currentWeek;

  if (!ready) return <LineupSkeleton />;
  if (team.players.length === 0) {
    return (
      <EmptyState title="Add your team to see it here" icon="team" action={{ label: "Connect an ESPN league", href: "/team/connect" }}>
        Connect your ESPN league to bring in your roster, scoring and matchup, or{" "}
        <Link href="/team/edit" className="text-accent underline">
          build your team by hand
        </Link>
        . Every play that moves your players&apos; points shows up live.
      </EmptyState>
    );
  }

  const lineup = sortLineup(team.players);
  const starters = lineup.filter(isStarter);
  const bench = lineup.filter((p) => !isStarter(p));
  const startersLive = starters.map((p) => byId.get(p.playerId)).filter((p): p is PlayerLive => Boolean(p));
  const totals = projectTeam(startersLive, view?.me.espn.otherPoints ?? 0);
  const allDone = totals.playing === 0 && totals.yetToPlay === 0;

  const rows = (players: typeof lineup) => (
    <ul className="-mx-2 flex flex-col">
      {players.map((p) => (
        <li key={p.playerId}>
          <PlayerRow playerId={p.playerId} slot={p.slot} name={p.name} headshot={p.headshot} live={byId.get(p.playerId)} teams={allTeams} />
        </li>
      ))}
    </ul>
  );

  return (
    <div className="flex flex-col gap-4">
      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p className="min-w-0 truncate text-[13px] text-muted">
            {data ? `Week ${data.week}` : "This week"} · {specLabel({ format: team.format, rules: team.rules })}
          </p>
          <UpdatedAgo stamps={live.data} receivedAt={live.receivedAt} error={live.error} live={data?.anyLive} />
        </div>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[48px] leading-[52px] font-semibold tracking-[-0.03em]">
              {data ? <AnimatedNumber value={totals.points} className="text-accent" /> : <span className="skeleton inline-block h-12 w-36 rounded-md align-middle" aria-hidden="true" />}
              <span className="ml-2 text-[15px] font-normal tracking-normal text-faint">pts</span>
            </p>
            <p className="tabular mt-1 text-[14px] text-muted">
              {startersLive.some((p) => p.projection !== null) && (
                <>
                  {allDone ? "Final" : totals.playing > 0 ? "On pace for" : "Projected"}{" "}
                  <span className="text-ink">{pts(allDone ? totals.points : totals.projected)}</span>
                  {!allDone && totals.playing > 0 && <span className="text-faint"> (estimate)</span>}
                  {" · "}
                </>
              )}
              <span className={totals.playing ? "text-live" : undefined}>{totals.playing} playing</span> · {totals.yetToPlay} yet to play ·{" "}
              {totals.done} done
            </p>
          </div>
          {data && <WeekPicker currentWeek={data.currentWeek} week={week} />}
        </div>
        {view && !lookingBack && (
          <div className="mt-5 border-t border-white/[0.07] pt-4">
            <MatchupStrip view={view} />
          </div>
        )}
        {team.espn && <LeagueStatus className="mt-4" />}
      </section>

      {live.error && !data && <ErrorState what="ESPN isn't responding right now. Your points will appear as soon as it does." onRetry={live.refresh} />}

      <Reveal className="flex flex-col gap-4" stagger={false}>
        <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
          <div className="flex min-w-0 flex-col gap-4">
            <Card className="p-4 sm:p-5">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h2 className="text-[16px] leading-6 font-semibold">Starters</h2>
                <Segmented options={VIEWS} value={layout} onChange={setLayout} label="Lineup view" size="sm" />
              </div>
              {layout === "field" ? (
                <LineupField starters={starters} live={byId} teams={allTeams} onOpen={(p) => openPlayer(p.playerId)} />
              ) : (
                rows(starters)
              )}
            </Card>
            {bench.length > 0 && (
              <Card className="p-4 sm:p-5">
                <h2 className="mb-2 text-[16px] leading-6 font-semibold">Bench</h2>
                {rows(bench)}
              </Card>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <Card>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-[16px] font-semibold">Team health</h2>
                <Icon name="heal" size={18} className="text-faint" />
              </div>
              <TeamHealth
                rating={analysis.rating}
                weaknesses={analysis.weaknesses}
                loading={analysis.loading}
                error={analysis.error}
                onRetry={analysis.refresh}
              />
            </Card>
            <Card>
              <h2 className="mb-3 text-[16px] font-semibold">Next moves</h2>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { href: "/team/matchup", icon: "versus" as const, title: "Matchup", sub: view ? "Live head-to-head" : "Connect a league" },
                  { href: "/start-sit", icon: "swap" as const, title: "Start/Sit", sub: "Who to play" },
                  { href: "/team/trades", icon: "trades" as const, title: "Trades", sub: "Ideas + calculator" },
                  { href: "/feed?view=mine", icon: "live" as const, title: "Live plays", sub: "Your players" },
                ].map((a) => (
                  <Link key={a.href} href={a.href} className="tile flex flex-col gap-1 p-3">
                    <Icon name={a.icon} size={20} className="text-accent" />
                    <span className="text-[14px] font-medium">{a.title}</span>
                    <span className="text-[12px] text-muted">{a.sub}</span>
                  </Link>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {team.source === "manual" ? (
                  <ButtonLink href="/team/edit" icon="edit" size="sm">
                    Edit roster
                  </ButtonLink>
                ) : (
                  <span className="text-[12px] text-faint">Lineup changes happen on ESPN and show up here automatically.</span>
                )}
              </div>
            </Card>
          </div>
        </div>
        <WeeklyScoreChart team={team} league={league.data} universe={analysis.universe} />
      </Reveal>
    </div>
  );
}
