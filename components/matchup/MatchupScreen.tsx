"use client";

import { useMemo } from "react";
import { LineChart } from "@/components/charts/LineChart";
import { WinMeter } from "@/components/charts/WinMeter";
import { UpdatedAgo } from "@/components/live/UpdatedAgo";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { InjuryBadge } from "@/components/player/InjuryBadge";
import { PlayerLink } from "@/components/player/PlayerLink";
import { GameStatus } from "@/components/team/GameStatus";
import { Possession } from "@/components/team/Possession";
import { LeagueStatus } from "@/components/teams/LeagueStatus";
import { TeamBadge } from "@/components/teams/TeamBadge";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { EmptyState, ErrorState, Skeleton, SkeletonRows } from "@/components/ui/States";
import { visibleTeamColor } from "@/lib/color";
import { readMatchup, scoreProgression, type SlotPair } from "@/lib/fantasy/matchup-analysis";
import { projectPlayer } from "@/lib/fantasy/projection";
import { useMatchupLive, type SideView } from "@/lib/fantasy/useMatchupLive";
import { pts, signedPts } from "@/lib/format";
import { useTeams } from "@/lib/hooks/useTeams";
import type { PlayerLive, TeamLite } from "@/lib/live/types";
import { headshotUrl } from "@/lib/providers";
import type { LeagueRosterEntry } from "@/lib/providers/types";

function shortName(name: string) {
  const parts = name.split(" ");
  return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(" ")}` : name;
}

function Cell({
  x,
  teams,
  align,
}: {
  x: { entry: LeagueRosterEntry; live: PlayerLive | undefined } | null;
  teams: Record<string, TeamLite>;
  align: "left" | "right";
}) {
  if (!x) return <div className={`text-[13px] text-faint ${align === "right" ? "text-right" : ""}`}>Empty</div>;
  const { entry, live } = x;
  const team = entry.teamId ? teams[entry.teamId] : undefined;
  const proj = live ? projectPlayer(live) : null;
  const right = align === "right";
  return (
    <PlayerLink id={entry.playerId} className={`flex min-w-0 items-center gap-2 rounded-xl p-1 hover:bg-white/[0.04] ${right ? "flex-row-reverse text-right" : ""}`}>
      <span className="hidden sm:inline-flex">
        <PlayerAvatar
          name={entry.name}
          headshot={entry.position === "DST" ? team?.logo : headshotUrl(entry.playerId)}
          teamColor={visibleTeamColor(team)}
          size={34}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`flex items-center gap-1 ${right ? "justify-end" : ""}`}>
          <span className="truncate text-[13px] font-medium">{shortName(entry.name)}</span>
          <InjuryBadge status={live?.injuryStatus ?? entry.injuryStatus} />
        </span>
        <span className="block truncate text-[11px] text-muted">
          {live ? <GameStatus game={live.game} onBye={live.onBye} teams={teams} /> : (team?.abbr ?? "")}
        </span>
        {live?.game?.state === "in" && (
          <span className={`mt-0.5 flex ${right ? "justify-end" : ""}`}>
            <Possession game={live.game} position={live.position} />
          </span>
        )}
      </span>
      <span className={`w-[52px] shrink-0 ${right ? "text-left" : "text-right"}`}>
        <span className="tabular block text-[16px] font-semibold">{live ? pts(live.points) : pts(entry.points)}</span>
        <span className="tabular block text-[11px] text-faint">
          {live?.game?.state === "in" ? `est ${pts(proj?.projected)}` : `proj ${pts(live?.projection ?? entry.projected)}`}
        </span>
      </span>
    </PlayerLink>
  );
}

function SideHeader({ side, align, leading }: { side: SideView; align: "left" | "right"; leading: boolean }) {
  return (
    <div className={`flex min-w-0 items-center gap-3 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      <TeamBadge name={side.name} logo={side.logo} size={44} className="hidden sm:inline-flex" />
      <div className="min-w-0">
        <p className="truncate text-[15px] font-semibold">{side.name}</p>
        <p className="text-[12px] text-muted">{side.record}</p>
        <p className={`mt-1 text-[30px] leading-[36px] font-semibold tracking-[-0.03em] sm:text-[38px] sm:leading-[42px] ${leading ? "text-accent" : "text-ink"}`}>
          <AnimatedNumber value={side.projection.points} />
        </p>
      </div>
    </div>
  );
}

function pairLabel(p: SlotPair) {
  return p.slot === "DST" ? "D/ST" : p.slot;
}

/**
 * The matchup as a strategic view: who's winning and by how much, where the projections say it
 * ends (ESPN's live numbers when ESPN publishes them, else a labeled estimate), the score as it
 * happened play by play, every lineup spot head to head, and what can still change it.
 */
export function MatchupScreen() {
  const live = useMatchupLive();
  const { team, ready, view, league, data } = live;
  const teams = useTeams();
  const allTeams = { ...teams, ...data?.teams };

  const reading = useMemo(() => (view?.opponent ? readMatchup(view.me, view.opponent) : null), [view]);
  const progression = useMemo(() => {
    if (!view?.opponent || !data) return [];
    const mine = new Set(view.me.starters.map((s) => s.entry.playerId));
    const theirs = new Set(view.opponent.starters.map((s) => s.entry.playerId));
    return scoreProgression(data.feed, mine, theirs);
  }, [view, data]);

  if (!ready) return <Skeleton className="h-80 rounded-[22px]" />;
  if (!team.espn) {
    return (
      <EmptyState title="Matchups come from your ESPN league" icon="versus" action={{ label: "Connect an ESPN league", href: "/team/connect" }}>
        Hand-built teams don&apos;t have an opponent. Connect your league to see your opponent&apos;s lineup, the live score,
        ESPN&apos;s projections and your chance to win, all updating during games.
      </EmptyState>
    );
  }
  if (!view) {
    if (league.error && !league.data) {
      return (
        <div className="flex flex-col gap-3">
          <ErrorState what={league.error} onRetry={league.refresh} />
          <LeagueStatus />
        </div>
      );
    }
    if (league.data && !league.loading) {
      return (
        <EmptyState title="No matchup this week" icon="info">
          Your league has no matchup for {team.name} this week (a bye, or the season is over).
        </EmptyState>
      );
    }
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-56 rounded-[22px]" />
        <div className="card p-5">
          <SkeletonRows rows={8} height={56} />
        </div>
      </div>
    );
  }

  const { me, opponent, win, projected } = view;
  if (!opponent) {
    return (
      <EmptyState title={`${me.name} has a bye this week`} icon="info">
        No opponent in week {view.week}. Your players&apos; points still show on My Team and in Live.
      </EmptyState>
    );
  }

  const margin = me.projection.points - opponent.projection.points;
  const leftMe = me.projection.yetToPlay + me.projection.playing;
  const leftThem = opponent.projection.yetToPlay + opponent.projection.playing;
  const finding =
    me.projection.done + me.projection.playing + opponent.projection.done + opponent.projection.playing === 0
      ? `Projected ${pts(projected.me)} to ${pts(projected.opponent)} before kickoff${win ? `: ${Math.round(win.probability * 100)}% to win` : ""}.`
      : `${margin >= 0 ? "You lead" : "You trail"} by ${pts(Math.abs(margin))} with ${leftMe} of your starters still to finish against their ${leftThem}.`;
  const times = progression.map((p) => new Date(p.at).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" }));

  return (
    <div className="flex flex-col gap-4">
      <p className="-mt-2 text-[15px] text-ink">{finding}</p>

      {/* ── Scoreboard ───────────────────────────────────────────── */}
      <section className="card p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[13px] text-muted">
            Week {view.week} · {team.espn.leagueName}
          </span>
          <UpdatedAgo stamps={live.data} receivedAt={live.receivedAt} error={live.error} live={data?.anyLive} />
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
          <SideHeader side={me} align="left" leading={margin >= 0} />
          <span className="text-[12px] font-semibold tracking-widest text-faint">VS</span>
          <SideHeader side={opponent} align="right" leading={margin < 0} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-[13px]">
          <div className="well p-3">
            <p className="text-muted">Projected finish</p>
            <p className="tabular mt-0.5 text-[18px] font-semibold">{pts(projected.me)}</p>
            <p className="text-[11px] text-faint">
              {me.projection.playing} playing · {me.projection.yetToPlay} to play
            </p>
          </div>
          <div className="well p-3 text-right">
            <p className="text-muted">Projected finish</p>
            <p className="tabular mt-0.5 text-[18px] font-semibold">{pts(projected.opponent)}</p>
            <p className="text-[11px] text-faint">
              {opponent.projection.playing} playing · {opponent.projection.yetToPlay} to play
            </p>
          </div>
        </div>
        {win && (
          <div className="mt-4">
            <WinMeter probability={win.probability} source={win.source} meLabel={me.abbrev || "You"} themLabel={opponent.abbrev || "Them"} />
          </div>
        )}
        <p className="mt-2 text-[11px] text-faint">
          Projected finish: {projected.source === "espn" ? "ESPN's live projection" : "Xpert estimate (points so far + projection for the time left)"}.
          {me.espn.otherStarters + opponent.espn.otherStarters > 0 &&
            ` Includes ${pts(me.espn.otherPoints)} and ${pts(opponent.espn.otherPoints)} from defensive players (IDP), which Xpert doesn't track play by play.`}
        </p>
      </section>

      {/* ── Score progression ───────────────────────────────────── */}
      {progression.length >= 2 && (
        <section className="card p-5">
          <h2 className="mb-1 text-[16px] font-semibold">How the score moved</h2>
          <p className="mb-3 text-[12px] text-faint">Running totals rebuilt from every scoring play, in the order they happened.</p>
          <LineChart
            labels={times}
            series={[
              { id: "me", label: me.name, color: "var(--color-chart-1)", values: progression.map((p) => p.me), area: true },
              { id: "them", label: opponent.name, color: "var(--color-chart-2)", values: progression.map((p) => p.them) },
            ]}
            yMin={0}
            ariaLabel={`${me.name} and ${opponent.name} points over time`}
          />
        </section>
      )}

      {/* ── What decides it ─────────────────────────────────────── */}
      {reading && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="card p-5">
            <h2 className="mb-3 text-[16px] font-semibold">Where you&apos;re ahead and behind</h2>
            <ul className="flex flex-col gap-2 text-[13px]">
              {reading.advantages.map((p) => (
                <li key={`a-${p.slot}-${p.mine?.entry.playerId}`} className="well flex items-center gap-2 p-3">
                  <Icon name="arrowUp" size={16} className="text-positive" />
                  <span className="flex-1">
                    <span className="font-medium">{pairLabel(p)}</span>: {p.mine ? shortName(p.mine.entry.name) : "empty"} over{" "}
                    {p.theirs ? shortName(p.theirs.entry.name) : "an empty spot"}
                  </span>
                  <span className="tabular font-semibold text-positive">{signedPts(p.edge)}</span>
                </li>
              ))}
              {reading.disadvantages.map((p) => (
                <li key={`d-${p.slot}-${p.theirs?.entry.playerId}`} className="well flex items-center gap-2 p-3">
                  <Icon name="arrowDown" size={16} className="text-negative" />
                  <span className="flex-1">
                    <span className="font-medium">{pairLabel(p)}</span>: {p.theirs ? shortName(p.theirs.entry.name) : "empty"} over{" "}
                    {p.mine ? shortName(p.mine.entry.name) : "your empty spot"}
                  </span>
                  <span className="tabular font-semibold text-negative">{signedPts(p.edge)}</span>
                </li>
              ))}
              {reading.advantages.length + reading.disadvantages.length === 0 && (
                <li className="text-muted">Every spot is projected within 2 points: it&apos;s close all the way down.</li>
              )}
            </ul>
            <p className="mt-2 text-[11px] text-faint">Edge = projected finish difference for that lineup spot.</p>
          </section>
          <section className="card p-5">
            <h2 className="mb-3 text-[16px] font-semibold">What can still change it</h2>
            {reading.toPlay.length > 0 ? (
              <ul className="flex flex-col gap-1.5 text-[13px]">
                {reading.toPlay.map(({ side, live: l }) => (
                  <li key={l.playerId} className="flex items-center gap-2">
                    <span className={`size-2 shrink-0 rounded-full ${side === "me" ? "bg-[var(--color-chart-1)]" : "bg-[var(--color-chart-2)]"}`} aria-hidden="true" />
                    <PlayerLink id={l.playerId} className="flex-1 truncate hover:underline">
                      {l.name}
                    </PlayerLink>
                    <span className="text-[12px] text-muted">{side === "me" ? "yours" : "theirs"}</span>
                    <span className="tabular w-14 text-right text-muted">proj {pts(l.projection)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-muted">Every starter&apos;s game has started.</p>
            )}
            {reading.under.length > 0 && (
              <>
                <h3 className="mt-4 mb-2 text-[13px] font-semibold text-warning">Behind their projection</h3>
                <ul className="flex flex-col gap-1.5 text-[13px]">
                  {reading.under.map(({ side, live: l, expected }) => (
                    <li key={l.playerId} className="flex items-center gap-2">
                      <PlayerLink id={l.playerId} className="flex-1 truncate hover:underline">
                        {l.name}
                      </PlayerLink>
                      <span className="text-[12px] text-muted">{side === "me" ? "yours" : "theirs"}</span>
                      <span className="tabular text-right text-muted">
                        {pts(l.points)} of {pts(expected)} expected by now
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {reading.drivers.length > 0 && (
              <>
                <h3 className="mt-4 mb-2 text-[13px] font-semibold">Driving the matchup</h3>
                <div className="flex flex-wrap gap-1.5">
                  {reading.drivers.map(({ side, live: l }) => (
                    <PlayerLink key={l.playerId} id={l.playerId} className="bg-raised inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] hover:bg-well">
                      <span className={`size-1.5 rounded-full ${side === "me" ? "bg-[var(--color-chart-1)]" : "bg-[var(--color-chart-2)]"}`} aria-hidden="true" />
                      {shortName(l.name)} <span className="tabular font-semibold">{pts(l.points)}</span>
                    </PlayerLink>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {/* ── Head to head, spot by spot ──────────────────────────── */}
      {reading && (
        <section className="card p-4 sm:p-5">
          <div className="mb-2 grid grid-cols-[minmax(0,1fr)_40px_minmax(0,1fr)] items-center gap-1 text-[12px] text-faint sm:gap-2">
            <span>{me.name}</span>
            <span className="text-center">Spot</span>
            <span className="text-right">{opponent.name}</span>
          </div>
          <ul className="flex flex-col divide-y divide-rule">
            {reading.pairs.map((p, i) => (
              <li key={`${p.slot}-${i}`} className="grid grid-cols-[minmax(0,1fr)_40px_minmax(0,1fr)] items-center gap-1 py-1.5 sm:gap-2">
                <Cell x={p.mine} teams={allTeams} align="left" />
                <span className="flex flex-col items-center gap-0.5">
                  <span className="text-[11px] font-semibold text-faint">{pairLabel(p)}</span>
                  <span className={`tabular text-[10px] ${p.edge > 0 ? "text-positive" : p.edge < 0 ? "text-negative" : "text-faint"}`}>
                    {p.edge === 0 ? "even" : signedPts(p.edge)}
                  </span>
                </span>
                <Cell x={p.theirs} teams={allTeams} align="right" />
              </li>
            ))}
          </ul>
          <details className="mt-3 text-[13px]">
            <summary className="cursor-pointer text-muted">Benches</summary>
            <div className="mt-2 grid gap-4 sm:grid-cols-2">
              {[me, opponent].map((side) => (
                <div key={side.teamId}>
                  <p className="mb-1 text-[12px] text-faint">{side.name}</p>
                  {side.bench.map((x) => (
                    <Cell key={x.entry.playerId} x={x} teams={allTeams} align="left" />
                  ))}
                </div>
              ))}
            </div>
          </details>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        <ButtonLink href="/start-sit" variant="primary" icon="swap">
          Start/Sit for this matchup
        </ButtonLink>
        <ButtonLink href="/feed?view=opponent" icon="live">
          Opponent&apos;s live plays
        </ButtonLink>
        <ButtonLink href="/chat/matchups" icon="chat">
          Talk matchups
        </ButtonLink>
      </div>
      <LeagueStatus />
    </div>
  );
}
