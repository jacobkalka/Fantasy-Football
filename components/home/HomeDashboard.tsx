"use client";

import Link from "next/link";
import { useMemo } from "react";
import { UpdatedAgo } from "@/components/live/UpdatedAgo";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { Reveal } from "@/components/motion/Reveal";
import { BringYourTeam, InstallCard } from "@/components/pwa";
import { ButtonLink } from "@/components/ui/Button";
import { Card, CardHeader, Pill } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { EmptyState, ErrorState, Skeleton, SkeletonRows } from "@/components/ui/States";
import { visibleTeamColor } from "@/lib/color";
import { kickoffLabel } from "@/lib/format";
import { lineupDecisions, type Urgency } from "@/lib/home/decisions";
import { useTeamLive } from "@/lib/hooks/useTeamLive";
import { useTeams } from "@/lib/hooks/useTeams";
import type { PlayerLive } from "@/lib/live/types";
import { isStarter, sortLineup } from "@/lib/roster/lineup";
import { roundPoints } from "@/lib/scoring";
import { useSettings } from "@/lib/settings/store";

const FORMAT_LABEL = { standard: "Standard", half: "Half PPR", ppr: "PPR" } as const;
const URGENCY: Record<Urgency, { label: string; tone: "negative" | "warning" | "neutral" }> = {
  high: { label: "Fix now", tone: "negative" },
  medium: { label: "Worth a look", tone: "warning" },
  low: { label: "Keep an eye on", tone: "neutral" },
};

function HomeSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]" aria-busy="true" aria-label="Loading your team">
      <Card>
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-3 h-10 w-36" />
        <Skeleton className="mt-3 h-4 w-60" />
      </Card>
      <Card>
        <SkeletonRows rows={3} height={56} />
      </Card>
    </div>
  );
}

function Welcome() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Installed app with no team yet (iPhone keeps it apart from the browser's). */}
      <BringYourTeam />
      <EmptyState
        title="Start by adding your team"
        icon="team"
        action={{ label: "Add your players", href: "/team/edit" }}
      >
        FantasyLab rates your roster, flags lineup problems, suggests trades and pickups, and follows every play live.
        It all starts with your players. They&apos;re saved on this device, and to your account if you sign in.
      </EmptyState>
      <Card className="flex flex-col gap-3">
        <h2 className="text-[16px] leading-6 font-semibold">Or look around first</h2>
        <ul className="-mx-2 flex flex-col">
          {[
            { href: "/start-sit", icon: "swap" as const, title: "Compare any two players", sub: "Who to start, how sure we are, and why" },
            { href: "/games", icon: "live" as const, title: "This week's games", sub: "Scores, odds and kickoffs" },
            { href: "/feed", icon: "bolt" as const, title: "Live plays", sub: "Every play that moves fantasy points" },
          ].map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="flex min-h-14 items-center gap-3 rounded-xl px-2 py-2 hover:bg-raised">
                <Icon name={item.icon} className="text-muted" />
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

/** Home: this week's outlook, the decisions you can still make, and when your players play. */
export function HomeDashboard() {
  const { roster, ready, data, delayed } = useTeamLive(undefined);
  const { value: settings } = useSettings();
  const teams = useTeams();
  const allTeams = { ...teams, ...data?.teams };

  const byId = useMemo(() => new Map<string, PlayerLive>((data?.players ?? []).map((p) => [p.playerId, p])), [data]);
  const lineup = sortLineup(roster.players);
  const starters = lineup.filter(isStarter);
  const decisions = useMemo(() => (data ? lineupDecisions(roster.players, byId) : []), [data, roster.players, byId]);

  if (!ready) return <HomeSkeleton />;
  if (roster.players.length === 0) return <Welcome />;

  const startersLive = starters.map((p) => byId.get(p.playerId)).filter((p): p is PlayerLive => Boolean(p));
  const points = roundPoints(startersLive.reduce((sum, p) => sum + p.points, 0));
  const playing = startersLive.filter((p) => p.game?.state === "in").length;
  const toPlay = startersLive.filter((p) => p.game?.state === "pre").length;
  const done = startersLive.filter((p) => p.game?.state === "post").length;
  const outlook = startersLive.some((p) => p.projection !== null)
    ? roundPoints(
        startersLive.reduce(
          (sum, p) =>
            sum + (p.game?.state === "post" ? p.points : (p.liveProjection ?? p.projection ?? p.points)),
          0,
        ),
      )
    : null;

  // Your players' games that haven't started, soonest first.
  const upcoming = lineup
    .map((p) => ({ p, live: byId.get(p.playerId) }))
    .filter(({ live }) => live?.game?.state === "pre")
    .sort((a, b) => (a.live!.game!.kickoff < b.live!.game!.kickoff ? -1 : 1))
    .slice(0, 6);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[14px] text-muted">
        <span>
          {data ? `Week ${data.week}` : "This week"} · {FORMAT_LABEL[roster.format]} · {settings.leagueSize}-team league
        </span>
        <UpdatedAgo fetchedAt={data?.fetchedAt} delayed={delayed} live={data?.anyLive} />
      </div>

      {delayed && !data && <ErrorState what="ESPN isn't responding right now. This fills in as soon as it does." />}

      <Reveal className="grid gap-4 lg:grid-cols-[1.2fr_1fr]" stagger>
        <Card className="flex flex-col">
          <CardHeader title="This week" href="/team" hrefLabel="Lineup" />
          <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
            <div>
              <p className="text-[13px] text-muted">{playing + done > 0 ? "Points so far" : "Projected"}</p>
              <p className="text-[40px] leading-[44px] font-semibold tracking-[-0.02em] text-accent">
                {data ? (
                  <AnimatedNumber value={playing + done > 0 ? points : (outlook ?? 0)} />
                ) : (
                  <Skeleton className="h-10 w-28" />
                )}
              </p>
            </div>
            {playing + done > 0 && outlook !== null && (
              <div>
                <p className="text-[13px] text-muted">On pace for</p>
                <p className="tabular text-[24px] leading-8 font-semibold">{outlook.toFixed(1)}</p>
              </div>
            )}
          </div>
          <p className="tabular mt-3 text-[14px] text-muted">
            <span className={playing ? "text-positive" : undefined}>{playing} playing</span> · {toPlay} yet to play ·{" "}
            {done} done
          </p>
          <div className="mt-auto flex flex-wrap gap-2 pt-5">
            <ButtonLink href="/start-sit" variant="primary" icon="swap">
              Start/Sit
            </ButtonLink>
            <ButtonLink href="/team/edit" icon="edit">
              Edit roster
            </ButtonLink>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="To do"
            subtitle={data ? (decisions.length ? `${decisions.length} lineup ${decisions.length === 1 ? "decision" : "decisions"}` : undefined) : undefined}
          />
          {!data ? (
            <SkeletonRows rows={3} height={56} />
          ) : decisions.length === 0 ? (
            <div className="flex items-start gap-3 rounded-xl bg-raised p-4">
              <Icon name="check" className="text-positive" />
              <div>
                <p className="text-[15px] font-medium">Your lineup is set</p>
                <p className="mt-0.5 text-[14px] text-muted">
                  No byes, injuries or better bench options among players who haven&apos;t played yet.
                </p>
              </div>
            </div>
          ) : (
            <ul className="-mx-2 flex flex-col divide-y divide-rule">
              {decisions.slice(0, 5).map((d) => (
                <li key={d.id} className="flex items-start gap-3 px-2 py-3">
                  <div className="min-w-0 flex-1">
                    <Pill tone={URGENCY[d.urgency].tone}>{URGENCY[d.urgency].label}</Pill>
                    <p className="mt-1.5 text-[15px] leading-5 font-medium">{d.title}</p>
                    <p className="mt-0.5 text-[14px] leading-5 text-muted">{d.detail}</p>
                  </div>
                  {d.compare && (
                    <ButtonLink href={`/start-sit?ids=${d.compare.join(",")}`} size="sm" className="mt-7">
                      Compare
                    </ButtonLink>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {upcoming.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader title="Next up" subtitle="Your players who haven't played yet" href="/games" hrefLabel="All games" />
            <ul className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
              {upcoming.map(({ p, live }) => {
                const team = p.teamId ? allTeams[p.teamId] : undefined;
                const opp = live?.game ? allTeams[live.game.opponentId]?.abbr : undefined;
                return (
                  <li key={p.playerId} className="flex min-h-14 items-center gap-3 border-b border-rule py-2">
                    <PlayerAvatar
                      name={p.name}
                      headshot={p.position === "DST" ? team?.logo : p.headshot}
                      teamColor={visibleTeamColor(team)}
                      size={36}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] leading-5 font-medium">{p.name}</span>
                      <span className="block truncate text-[13px] leading-5 text-muted">
                        {live?.game ? kickoffLabel(live.game.kickoff) : ""}
                        {opp ? ` ${live?.game?.isHome ? "vs" : "@"} ${opp}` : ""}
                      </span>
                    </span>
                    {live?.projection != null && (
                      <span className="tabular text-[13px] text-faint">proj {live.projection.toFixed(1)}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </Reveal>
      {/* For people using FantasyLab in a browser tab: put it on the Home Screen. */}
      <InstallCard />
    </div>
  );
}
