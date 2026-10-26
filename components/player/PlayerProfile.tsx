"use client";

import Link from "next/link";
import { BarChart } from "@/components/charts/BarChart";
import { LineChart } from "@/components/charts/LineChart";
import { ArticleCard } from "@/components/news/ArticleCard";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { InjuryBadge } from "@/components/player/InjuryBadge";
import { GameStatus } from "@/components/team/GameStatus";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { PointsBadge } from "@/components/ui/PointsBadge";
import { ErrorState, Skeleton } from "@/components/ui/States";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { visibleTeamColor } from "@/lib/color";
import { liveUrl, specOf, useLiveWeek } from "@/lib/fantasy/context";
import { projectPlayer } from "@/lib/fantasy/projection";
import { periodLabel, posRank, pts } from "@/lib/format";
import { useRankings } from "@/lib/hooks/useRankings";
import { useTeams } from "@/lib/hooks/useTeams";
import type { TeamLiveResponse } from "@/lib/hooks/useTeamLive";
import { statLineSummary } from "@/lib/live/statline";
import { consistencyLabel } from "@/lib/players/rankings";
import type { PlayerAnalysis, PlayerProfile as Profile } from "@/lib/players/types";
import type { NewsArticle } from "@/lib/providers/types";
import { formatBreakdown } from "@/lib/scoring";
import { specLabel, specQuery } from "@/lib/scoring/spec";
import { settingsActions, useSettings } from "@/lib/settings/store";
import { useLive } from "@/lib/sync/useLive";

type Research = { profile: Profile; analysis: PlayerAnalysis };

function Section({ title, children, id, aside }: { title: string; children: React.ReactNode; id?: string; aside?: React.ReactNode }) {
  return (
    <section id={id} className="card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-[16px] leading-6 font-semibold">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function StatTile({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "good" | "bad" }) {
  return (
    <div className="well p-3">
      <p className="text-[12px] leading-4 text-muted">{label}</p>
      <p
        className={`mt-1 text-[20px] leading-6 font-semibold tracking-[-0.01em] ${
          tone === "good" ? "text-positive" : tone === "bad" ? "text-negative" : "text-ink"
        }`}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[12px] leading-4 text-faint">{sub}</p>}
    </div>
  );
}

/**
 * THE player profile: every player tap in the app lands here (PlayerLink → ?player=<id>, or the
 * full page /players/<id>). Fantasy first: what he's worth to YOUR team in YOUR scoring, this
 * week live, the season week by week, how he's used, and what to do next. Everything comes from
 * the canonical data layer: live points from the same answer as every other screen.
 */
export function PlayerProfile({ playerId, inSheet = false }: { playerId: string; inSheet?: boolean }) {
  const week = useLiveWeek();
  const { team } = week;
  const spec = specOf(team);
  const teams = useTeams();
  const { value: settings } = useSettings();
  const research = useLive<Research>(`/api/player/${playerId}/profile?${specQuery(spec)}`, { interval: 10 * 60_000 });
  const ranks = useRankings();

  // Live points: from the shared week answer when he's in it, else his own (same engine, same rules).
  const shared = week.byId.get(playerId);
  const own = useLive<TeamLiveResponse>(shared ? null : liveUrl([playerId], spec), {
    interval: (d) => (d?.anyLive ? 8_000 : 60_000),
  });
  const live = shared ?? own.data?.players.find((p) => p.playerId === playerId);
  const feed = (shared ? week.data?.feed : own.data?.feed)?.filter((f) => f.playerId === playerId) ?? [];

  const data = research.data;
  const profile = data?.profile;
  const analysis = data?.analysis;
  const ranked = ranks.byId?.get(playerId);
  const position = profile?.position ?? live?.position ?? ranked?.position ?? null;
  const name = profile?.name ?? live?.name ?? ranked?.name ?? "Player";
  const teamId = profile?.team?.id ?? live?.teamId ?? ranked?.teamId ?? null;
  const nflTeam = teamId ? (teams[teamId] ?? week.data?.teams[teamId]) : undefined;
  const headshot = position === "DST" ? (nflTeam?.logo ?? null) : (profile?.headshot ?? ranked?.headshot ?? null);
  const injury = live?.injuryStatus ?? profile?.fantasy.injuryStatus ?? ranked?.injuryStatus;

  const onMyTeam = team.players.some((p) => p.playerId === playerId);
  const opponent = week.opponentIds.includes(playerId);
  const tracked = settings.watchlist.includes(playerId);
  const taken = team.taken.includes(playerId);
  const relevance = onMyTeam
    ? { text: `On ${team.name}`, tone: "accent" as const }
    : opponent
      ? { text: "On your opponent's team", tone: "negative" as const }
      : taken
        ? { text: "Rostered in your league", tone: "neutral" as const }
        : ranked && ranked.percentOwned !== null && ranked.percentOwned < 50
          ? { text: `Rostered in ${Math.round(ranked.percentOwned)}% of ESPN leagues: may be available`, tone: "positive" as const }
          : null;

  const games = analysis?.games ?? [];
  const bars = games.map((g) => ({
    label: `W${g.week}`,
    value: g.played ? g.points : null,
    compare: g.projected,
    note: `${g.home === false ? "@" : "vs"} ${g.opponentAbbr ?? "?"}${g.result ? ` · ${g.result}` : ""}`,
    muted: !g.played,
  }));
  const played = games.filter((g) => g.played && g.points !== null);
  const rolling = played.map((_, i) => {
    const slice = played.slice(0, i + 1);
    return slice.reduce((s, g) => s + (g.points ?? 0), 0) / slice.length;
  });
  const usageSeries = (() => {
    if (!profile || position === "K" || position === "DST" || position === null) return null;
    const rows = profile.games.filter((g) => g.played);
    if (rows.length < 2) return null;
    const touches = rows.map((g) => (g.stats.rushAtt ?? 0) + (g.stats.rec ?? 0));
    const targets = rows.map((g) => g.stats.targets ?? 0);
    const passes = rows.map((g) => g.stats.passAtt ?? 0);
    return {
      labels: rows.map((g) => `W${g.week}`),
      series:
        position === "QB"
          ? [
              { id: "att", label: "Pass attempts", color: "var(--color-chart-1)", values: passes, markers: true },
              { id: "rush", label: "Carries", color: "var(--color-chart-2)", values: rows.map((g) => g.stats.rushAtt ?? 0), markers: true },
            ]
          : [
              { id: "targets", label: "Targets", color: "var(--color-chart-1)", values: targets, markers: true },
              { id: "touches", label: "Touches (carries + catches)", color: "var(--color-chart-2)", values: touches, markers: true },
            ],
    };
  })();

  const strengths = [
    ...(analysis?.signals.filter((s) => s.tone === "positive").map((s) => s.text) ?? []),
    ...(analysis?.trends.filter((t) => t.direction === "up").map((t) => t.text) ?? []),
  ].slice(0, 4);
  const concerns = [
    ...(analysis?.signals.filter((s) => s.tone === "caution").map((s) => s.text) ?? []),
    ...(analysis?.trends.filter((t) => t.direction === "down").map((t) => t.text) ?? []),
  ].slice(0, 4);

  const projection = live ? projectPlayer(live) : null;
  const names = new Map([[playerId, name]]);
  const news: NewsArticle[] =
    profile?.news.map((n) => ({
      id: n.id,
      headline: n.headline,
      description: n.description,
      published: n.published,
      link: n.link ?? (position === "DST" ? null : `https://www.espn.com/nfl/player/_/id/${playerId}`),
      image: null,
      category: n.link ? "News" : "Player update",
      source: n.link ? "ESPN" : "RotoWire via ESPN",
      playerIds: [playerId],
      playerNames: { [playerId]: name },
      teamIds: teamId ? [teamId] : [],
      premium: false,
    })) ?? [];

  const color = visibleTeamColor(nflTeam);
  const posLabel = position === "DST" ? "D/ST" : (position ?? "");
  const compareIds = [
    playerId,
    ...team.players.filter((p) => p.position === position && p.playerId !== playerId).map((p) => p.playerId),
  ]
    .slice(0, 3)
    .join(",");

  if (research.error && !data && !ranked && !live) {
    return <ErrorState what="Couldn't load this player from ESPN." onRetry={research.refresh} />;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Header: who, where, status, what he means to you ───────────────── */}
      <header className="card overflow-hidden p-5">
        <div className="relative flex items-center gap-4">
          <PlayerAvatar name={name} headshot={headshot} teamColor={color} size={inSheet ? 80 : 96} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {position && <Pill tone="accent">{posLabel}</Pill>}
              {nflTeam && (
                <span className="inline-flex items-center gap-1.5 text-[13px] text-muted">
                  <TeamLogo abbr={nflTeam.abbr} logo={nflTeam.logo} color={nflTeam.color} size={18} />
                  {nflTeam.name}
                </span>
              )}
              {!teamId && profile && <span className="text-[13px] text-muted">Free agent</span>}
              <InjuryBadge status={injury ?? undefined} long />
            </div>
            <h2 className="mt-1 text-[26px] leading-8 font-semibold tracking-[-0.02em] lg:text-[30px] lg:leading-9">{name}</h2>
            <p className="mt-1 text-[13px] text-muted">
              {ranked ? (
                <>
                  <span className="font-medium text-ink">{posRank(ranked.position, ranked.positionRank)}</span> this season ·{" "}
                  <span className="tabular">{pts(ranked.ppg)}</span> per game · #{ranked.overallRank} overall
                </>
              ) : ranks.loading ? (
                <span className="skeleton inline-block h-3 w-48 rounded-md align-middle" aria-hidden="true" />
              ) : (
                "Not in the fantasy rankings this season"
              )}
            </p>
            {relevance && (
              <p className="mt-2">
                <Pill tone={relevance.tone}>{relevance.text}</Pill>
              </p>
            )}
          </div>
        </div>
        {/* What you can do next. */}
        <div className="relative mt-5 flex flex-wrap gap-2">
          <ButtonLink href={`/start-sit?ids=${compareIds}`} variant="primary" icon="swap" size="sm">
            {compareIds.includes(",") ? "Start/Sit" : "Compare"}
          </ButtonLink>
          <Button size="sm" icon={tracked ? "check" : "eye"} onClick={() => settingsActions.toggleWatch(playerId)} aria-pressed={tracked}>
            {tracked ? "Tracking" : "Track"}
          </Button>
          {!onMyTeam && position !== null && (
            <ButtonLink href={`/team/trades?get=${playerId}`} size="sm" icon="trades">
              Trade for
            </ButtonLink>
          )}
          {onMyTeam && (
            <ButtonLink href={`/team/trades?give=${playerId}`} size="sm" icon="trades">
              Trade away
            </ButtonLink>
          )}
          {news.length > 0 && (
            <a href="#player-news" className="pressable inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] text-muted hover:text-ink">
              <Icon name="news" size={16} /> News
            </a>
          )}
        </div>
      </header>

      {/* ── This week, live ───────────────────────────────────────────────── */}
      {live && (
        <Section
          title={`Week ${week.data?.week ?? own.data?.week ?? ""} · ${specLabel(spec)}`}
          aside={live.game ? <GameStatus game={live.game} onBye={live.onBye} teams={teams} /> : undefined}
        >
          <div className="grid grid-cols-3 gap-2">
            <StatTile label="Points" value={<AnimatedNumber value={live.points} />} />
            <StatTile label="ESPN projection" value={pts(live.projection)} sub="Before the game" />
            <StatTile
              label={live.game?.state === "in" ? "On pace for" : "Projected finish"}
              value={pts(projection?.projected ?? null)}
              sub={live.game?.state === "in" ? "FantasyLab estimate" : undefined}
            />
          </div>
          {live.game?.state === "in" && (
            <p className="mt-3 text-[13px] text-muted">
              {live.game.possession === "ball"
                ? "His team has the ball."
                : live.game.possession === "defense"
                  ? "The other team has the ball."
                  : "Possession unknown right now."}
              {live.game.downDistance ? ` ${live.game.downDistance}.` : ""}
            </p>
          )}
          {statLineSummary(live.stats, live.position) && (
            <p className="mt-3 text-[14px] text-muted">{statLineSummary(live.stats, live.position)}</p>
          )}
          {feed.length > 0 && (
            <ul className="mt-3 flex flex-col divide-y divide-rule">
              {feed.slice(0, 12).map((play) => (
                <li key={play.id} className="flex gap-3 py-2.5">
                  <div className="flex w-16 shrink-0 flex-col items-start gap-1">
                    {play.kind === "injury" ? <Pill tone="warning">Injury</Pill> : <PointsBadge points={play.points} size="sm" />}
                    <span className="tabular text-[11px] text-faint">
                      {periodLabel(play.period)} {play.clock}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] leading-5">{play.text}</p>
                    {play.parts.length > 0 && <p className="mt-0.5 text-[12px] text-faint">{formatBreakdown(play.parts)}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {/* ── Season fantasy performance ──────────────────────────────────── */}
      <Section title="Season" aside={<span className="text-[12px] text-faint">{specLabel(spec)}</span>}>
        {ranked ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatTile label="Total points" value={pts(ranked.total)} sub={`${ranked.games} games · weeks 1-${ranks.universe?.throughWeek ?? ""}`} />
            <StatTile label="Per game" value={pts(ranked.ppg)} sub={ranked.ppgPositionRank ? `${posRank(ranked.position, ranked.ppgPositionRank)} per game` : undefined} />
            <StatTile label="Position rank" value={posRank(ranked.position, ranked.positionRank)} sub={`#${ranked.overallRank} overall`} />
            <StatTile
              label="Last 3 games"
              value={pts(ranked.recent)}
              tone={ranked.trend === null ? undefined : ranked.trend > 1 ? "good" : ranked.trend < -1 ? "bad" : undefined}
              sub={ranked.trend === null ? undefined : `${ranked.trend >= 0 ? "+" : "−"}${Math.abs(ranked.trend).toFixed(2)} vs season`}
            />
            <StatTile label="Floor" value={pts(ranked.floor)} sub="A bad week (20th pct.)" />
            <StatTile label="Ceiling" value={pts(ranked.ceiling)} sub="A good week (80th pct.)" />
            <StatTile label="Best game" value={pts(ranked.best)} />
            <StatTile
              label="Consistency"
              value={consistencyLabel(ranked.volatility) ?? "–"}
              sub={ranked.volatility !== null ? `Swing ${Math.round(ranked.volatility * 100)}% of avg` : "Needs 3+ games"}
            />
          </div>
        ) : ranks.loading || research.loading ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-[76px] rounded-[var(--radius-inner)]" />
            ))}
          </div>
        ) : analysis ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatTile label="Total points" value={pts(analysis.totals.points)} sub={`${analysis.sample.gamesPlayed} games`} />
            <StatTile label="Per game" value={pts(analysis.totals.average)} />
            <StatTile label="Last 3 games" value={pts(analysis.totals.last3Average)} />
            <StatTile label="Best game" value={pts(analysis.totals.best?.points)} />
          </div>
        ) : (
          <p className="text-[14px] text-muted">No fantasy results for him this season.</p>
        )}
        {analysis?.sample.note && <p className="mt-3 text-[12px] text-faint">{analysis.sample.note}</p>}
      </Section>

      {/* ── Charts ──────────────────────────────────────────────────────── */}
      {bars.length > 0 && (
        <Section title="Points by week" aside={<span className="text-[12px] text-faint">Tap a week</span>}>
          <BarChart
            bars={bars.map((b) => ({ ...b, highlight: b.value !== null && b.value === Math.max(...bars.map((x) => x.value ?? -Infinity)) }))}
            ariaLabel={`${name}'s fantasy points by week, with ESPN's projection`}
            compareLabel="ESPN projection"
            format={(v) => v.toFixed(2)}
          />
          {analysis?.consistency?.beatProjection && (
            <p className="mt-3 text-[13px] text-muted">
              Beat ESPN&apos;s projection in {analysis.consistency.beatProjection.beat} of {analysis.consistency.beatProjection.games} games.
            </p>
          )}
        </Section>
      )}

      {(played.length >= 2 || (ranked && ranked.weekly.length >= 2)) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {played.length >= 2 && (
            <Section title="Average over time">
              <LineChart
                labels={played.map((g) => `W${g.week}`)}
                series={[
                  { id: "pts", label: "Points", color: "var(--color-chart-2)", values: played.map((g) => g.points), markers: true },
                  { id: "avg", label: "Season average so far", color: "var(--color-chart-1)", values: rolling, area: true },
                ]}
                yMin={0}
                ariaLabel={`${name}'s weekly points and running average`}
              />
            </Section>
          )}
          {ranked && ranked.weekly.length >= 2 && (
            <Section title={`${posLabel} rank by week`}>
              <LineChart
                labels={ranked.weekly.map((w) => `W${w.week}`)}
                series={[
                  { id: "rank", label: "Position rank", color: "var(--color-chart-1)", values: ranked.weekly.map((w) => w.positionRank), markers: true },
                ]}
                invert
                yMin={1}
                format={(v) => `${posLabel}${Math.round(v)}`}
                ariaLabel={`Where ${name}'s score ranked among ${posLabel}s each week (1 is best)`}
              />
            </Section>
          )}
        </div>
      )}

      {usageSeries && (
        <Section title="Usage by week">
          <LineChart labels={usageSeries.labels} series={usageSeries.series} yMin={0} format={(v) => String(Math.round(v))} ariaLabel={`${name}'s usage by week`} />
          {analysis && analysis.usage.length > 0 && (
            <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {analysis.usage.slice(0, 6).map((m) => (
                <div key={m.id} className="well p-3">
                  <dt className="text-[12px] text-muted">{m.label}</dt>
                  <dd className="tabular mt-0.5 text-[16px] font-semibold">{m.display}</dd>
                  {m.basis && <dd className="text-[11px] text-faint">{m.basis}</dd>}
                </div>
              ))}
            </dl>
          )}
        </Section>
      )}

      {/* ── Fantasy analysis ────────────────────────────────────────────── */}
      {analysis && (
        <Section title="Fantasy analysis">
          <p className="text-[15px] leading-6 text-ink">{analysis.summary}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="well p-4">
              <p className="flex items-center gap-1.5 text-[13px] font-semibold text-positive">
                <Icon name="arrowUp" size={16} /> Strengths and upside
              </p>
              {strengths.length ? (
                <ul className="mt-2 flex flex-col gap-1.5 text-[13px] leading-5 text-muted">
                  {strengths.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[13px] text-faint">Nothing stands out above his position&apos;s norm yet.</p>
              )}
              {ranked?.ceiling != null && <p className="mt-2 text-[12px] text-faint">Upside: a good week for him is about {pts(ranked.ceiling)} points.</p>}
            </div>
            <div className="well p-4">
              <p className="flex items-center gap-1.5 text-[13px] font-semibold text-negative">
                <Icon name="arrowDown" size={16} /> Concerns and risk
              </p>
              {concerns.length ? (
                <ul className="mt-2 flex flex-col gap-1.5 text-[13px] leading-5 text-muted">
                  {concerns.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[13px] text-faint">No red flags in his numbers.</p>
              )}
              {ranked?.floor != null && <p className="mt-2 text-[12px] text-faint">Risk: a bad week for him is about {pts(ranked.floor)} points.</p>}
            </div>
          </div>
          {analysis.labels.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {analysis.labels.map((l) => (
                <span key={l.id} title={l.reason} className="glass-chip rounded-full px-2.5 py-1 text-[12px] text-ink">
                  {l.label}
                </span>
              ))}
            </div>
          )}
          {profile?.nextGame && (
            <p className="mt-4 text-[13px] text-muted">
              <span className="font-medium text-ink">Next up:</span> Week {profile.nextGame.week}{" "}
              {profile.nextGame.home ? "vs" : "@"} {profile.nextGame.opponentAbbr}
              {profile.byeWeek ? ` · Bye in week ${profile.byeWeek}` : ""}.{" "}
              <Link href={`/start-sit?ids=${compareIds}`} className="text-accent hover:underline">
                See the matchup in Start/Sit
              </Link>
            </p>
          )}
          {(profile?.fantasy.weekOutlook || profile?.fantasy.seasonOutlook) && (
            <div className="well mt-4 p-4">
              <p className="text-[12px] font-medium text-muted">
                ESPN outlook · {profile.fantasy.weekOutlook ? "this week" : "season"}
              </p>
              <p className="mt-1.5 text-[14px] leading-6 text-muted">{profile.fantasy.weekOutlook ?? profile.fantasy.seasonOutlook}</p>
            </div>
          )}
          {analysis.unavailable.length > 0 && (
            <p className="mt-3 text-[12px] text-faint">ESPN doesn&apos;t publish: {analysis.unavailable.join(", ")}.</p>
          )}
        </Section>
      )}

      {/* ── News ───────────────────────────────────────────────────────── */}
      {news.length > 0 && (
        <Section title="News" id="player-news">
          <div className="flex flex-col gap-2">
            {news.slice(0, 6).map((n) => (
              <ArticleCard key={n.id} article={n} names={names} teams={teams} variant="compact" />
            ))}
          </div>
        </Section>
      )}

      {/* ── Game log ───────────────────────────────────────────────────── */}
      {games.length > 0 && (
        <Section title="Game log">
          <div className="-mx-2 overflow-x-auto">
            <table className="w-full min-w-[300px] text-[13px]">
              <thead>
                <tr className="text-left text-[12px] text-faint">
                  <th scope="col" className="px-2 py-1.5 font-medium">Week</th>
                  <th scope="col" className="px-2 py-1.5 font-medium">Opp</th>
                  <th scope="col" className="px-2 py-1.5 font-medium">Result</th>
                  <th scope="col" className="px-2 py-1.5 text-right font-medium">Proj</th>
                  <th scope="col" className="px-2 py-1.5 text-right font-medium">Points</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {[...games].reverse().map((g) => (
                  <tr key={g.gameId} className="border-t border-rule">
                    <td className="px-2 py-2">{g.week}</td>
                    <td className="px-2 py-2 text-muted">
                      {g.home === false ? "@" : "vs"} {g.opponentAbbr ?? "?"}
                    </td>
                    <td className="px-2 py-2 text-muted">{g.result ?? ""}</td>
                    <td className="px-2 py-2 text-right text-faint">{pts(g.projected)}</td>
                    <td className="px-2 py-2 text-right font-semibold">{g.played ? pts(g.points) : <span className="font-normal text-faint">Didn&apos;t play</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {!inSheet && (
        <p className="px-1 text-[12px] text-faint">
          Data from ESPN. Points in {specLabel(spec)} for {team.name}.
        </p>
      )}
    </div>
  );
}
