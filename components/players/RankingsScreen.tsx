"use client";

import { useSearchParams } from "next/navigation";
import { useDeferredValue, useMemo, useState } from "react";
import { InjuryBadge } from "@/components/player/InjuryBadge";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { Segmented } from "@/components/ui/Segmented";
import { Button } from "@/components/ui/Button";
import { ErrorState, SkeletonRows } from "@/components/ui/States";
import { visibleTeamColor } from "@/lib/color";
import { posRank, pts } from "@/lib/format";
import { normalizeName } from "@/lib/hooks/usePlayers";
import { useRankings } from "@/lib/hooks/useRankings";
import { useTeams } from "@/lib/hooks/useTeams";
import { openPlayer, setQueryParams } from "@/lib/nav/query";
import { consistencyLabel, sortRanked, type RankSort, type RankedPlayer } from "@/lib/players/rankings";
import type { Position } from "@/lib/providers/types";
import { specLabel } from "@/lib/scoring/spec";
import { useActiveTeam } from "@/lib/teams/store";

const POSITIONS = [
  { value: "ALL", label: "All" },
  { value: "QB", label: "QB" },
  { value: "RB", label: "RB" },
  { value: "WR", label: "WR" },
  { value: "TE", label: "TE" },
  { value: "K", label: "K" },
  { value: "DST", label: "D/ST" },
] as const;

const SORTS: { value: RankSort; label: string }[] = [
  { value: "rank", label: "Season rank" },
  { value: "total", label: "Total points" },
  { value: "ppg", label: "Points per game" },
  { value: "recent", label: "Last 3 games" },
  { value: "projection", label: "This week's projection" },
  { value: "ros", label: "Rest-of-season projection" },
  { value: "consistency", label: "Most consistent" },
];

const PAGE = 60;

function trendTone(trend: number | null) {
  if (trend === null) return "text-faint";
  return trend >= 2 ? "text-positive" : trend <= -2 ? "text-negative" : "text-muted";
}

/**
 * Season rankings for the active team's scoring: overall and position ranks, totals, per game,
 * recent form, ESPN's projections, consistency and floor/ceiling. Filter, sort and search live in
 * the URL (they survive a refresh). Every row opens the player's profile.
 */
export function RankingsScreen() {
  const params = useSearchParams();
  const { team } = useActiveTeam();
  const r = useRankings();
  const teams = useTeams();
  const pos = (POSITIONS.find((p) => p.value === params.get("pos"))?.value ?? "ALL") as Position | "ALL";
  const sort = (SORTS.find((s) => s.value === params.get("sort"))?.value ?? "rank") as RankSort;
  const [query, setQuery] = useState(params.get("q") ?? "");
  const deferred = useDeferredValue(query);
  const [shown, setShown] = useState(PAGE);
  const mine = useMemo(() => new Set(team.players.map((p) => p.playerId)), [team.players]);
  const taken = useMemo(() => new Set(team.taken), [team.taken]);

  const rows = useMemo(() => {
    if (!r.rows) return [];
    let list = pos === "ALL" ? r.rows : r.rows.filter((x) => x.position === pos);
    const q = normalizeName(deferred);
    if (q) list = list.filter((x) => normalizeName(x.name).includes(q) || (x.teamId && teams[x.teamId]?.abbr.toLowerCase() === q));
    return sortRanked(list, sort);
  }, [r.rows, pos, sort, deferred, teams]);

  const status = (x: RankedPlayer) =>
    mine.has(x.id) ? { text: "Yours", cls: "bg-accent-soft text-accent" } : taken.has(x.id) ? { text: "Taken", cls: "bg-well text-muted" } : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="card flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShown(PAGE);
            }}
            placeholder="Search players or a team (KC)"
            aria-label="Search the rankings"
            className="h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 text-[16px] outline-none placeholder:text-faint focus:border-accent"
          />
          <label className="flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 text-[14px] text-muted">
            Sort
            <select
              value={sort}
              onChange={(e) => setQueryParams({ sort: e.target.value === "rank" ? null : e.target.value })}
              className="bg-transparent text-[15px] text-ink outline-none"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value} className="bg-surface">
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="no-scrollbar -mx-1 overflow-x-auto px-1">
          <Segmented options={POSITIONS} value={pos} onChange={(v) => setQueryParams({ pos: v === "ALL" ? null : v })} label="Position" size="sm" />
        </div>
        <p className="text-[12px] text-faint">
          {specLabel({ format: team.format, rules: team.rules })} · weeks 1-{r.universe?.throughWeek ?? "…"} · ESPN&apos;s ~650 most-rostered players
        </p>
      </div>

      {r.error && !r.rows && <ErrorState what="Couldn't load the rankings from ESPN." onRetry={r.refresh} />}
      {!r.rows && !r.error && (
        <div className="card p-4">
          <SkeletonRows rows={10} height={56} />
        </div>
      )}

      {r.rows && (
        <section className="card overflow-hidden">
          {/* Desktop and tablet: a real table. */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[12px] text-faint">
                  <th scope="col" className="py-3 pr-2 pl-5 font-medium">#</th>
                  <th scope="col" className="px-2 py-3 font-medium">Player</th>
                  <th scope="col" className="px-2 py-3 text-right font-medium">Pos</th>
                  <th scope="col" className="px-2 py-3 text-right font-medium">Total</th>
                  <th scope="col" className="px-2 py-3 text-right font-medium">Per game</th>
                  <th scope="col" className="px-2 py-3 text-right font-medium">Last 3</th>
                  <th scope="col" className="px-2 py-3 text-right font-medium">Proj</th>
                  <th scope="col" className="px-2 py-3 text-right font-medium">Floor–ceiling</th>
                  <th scope="col" className="py-3 pr-5 pl-2 text-right font-medium">Consistency</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {rows.slice(0, shown).map((x, i) => {
                  const t = x.teamId ? teams[x.teamId] : undefined;
                  const s = status(x);
                  return (
                    <tr
                      key={x.id}
                      onClick={() => openPlayer(x.id)}
                      className="cursor-pointer border-t border-rule transition-colors hover:bg-white/[0.035]"
                    >
                      <td className="py-2 pr-2 pl-5 text-muted">{sort === "rank" ? x.overallRank : i + 1}</td>
                      <td className="px-2 py-2">
                        <a
                          href={`/players/${x.id}`}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            openPlayer(x.id);
                          }}
                          className="flex items-center gap-2.5"
                        >
                          <PlayerAvatar name={x.name} headshot={x.position === "DST" ? t?.logo : x.headshot} teamColor={visibleTeamColor(t)} size={32} />
                          <span className="min-w-0">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate font-medium text-ink">{x.name}</span>
                              <InjuryBadge status={x.injuryStatus} />
                              {s && <span className={`rounded-full px-1.5 text-[11px] font-medium ${s.cls}`}>{s.text}</span>}
                            </span>
                            <span className="text-[12px] text-faint">
                              {t?.abbr ?? "FA"} · {x.games} games{x.byeWeek ? ` · bye ${x.byeWeek}` : ""}
                            </span>
                          </span>
                        </a>
                      </td>
                      <td className="px-2 py-2 text-right text-muted">{posRank(x.position, x.positionRank)}</td>
                      <td className="px-2 py-2 text-right font-semibold text-ink">{pts(x.total)}</td>
                      <td className="px-2 py-2 text-right">{pts(x.ppg)}</td>
                      <td className={`px-2 py-2 text-right ${trendTone(x.trend)}`}>{pts(x.recent)}</td>
                      <td className="px-2 py-2 text-right">
                        {pts(x.projection)}
                        {x.projectedPositionRank && <span className="block text-[11px] text-faint">{posRank(x.position, x.projectedPositionRank)}</span>}
                      </td>
                      <td className="px-2 py-2 text-right text-muted">
                        {x.floor !== null ? `${x.floor.toFixed(1)}–${x.ceiling!.toFixed(1)}` : "–"}
                      </td>
                      <td className="py-2 pr-5 pl-2 text-right text-muted">{consistencyLabel(x.volatility) ?? "–"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Phone: two-line rows. */}
          <ul className="flex flex-col md:hidden">
            {rows.slice(0, shown).map((x, i) => {
              const t = x.teamId ? teams[x.teamId] : undefined;
              const s = status(x);
              return (
                <li key={x.id} className="border-t border-rule first:border-t-0">
                  <button type="button" onClick={() => openPlayer(x.id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left active:bg-white/[0.04]">
                    <span className="tabular w-7 shrink-0 text-[12px] text-faint">{sort === "rank" ? x.overallRank : i + 1}</span>
                    <PlayerAvatar name={x.name} headshot={x.position === "DST" ? t?.logo : x.headshot} teamColor={visibleTeamColor(t)} size={38} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[14px] font-medium">{x.name}</span>
                        <InjuryBadge status={x.injuryStatus} />
                        {s && <span className={`rounded-full px-1.5 text-[11px] font-medium ${s.cls}`}>{s.text}</span>}
                      </span>
                      <span className="tabular block truncate text-[12px] text-muted">
                        {posRank(x.position, x.positionRank)} · {t?.abbr ?? "FA"} · {pts(x.ppg)}/g ·{" "}
                        <span className={trendTone(x.trend)}>last 3 {pts(x.recent)}</span>
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="tabular block text-[15px] font-semibold">
                        {sort === "projection" ? pts(x.projection) : sort === "ros" ? pts(x.restOfSeason) : pts(x.total)}
                      </span>
                      <span className="block text-[11px] text-faint">{sort === "projection" ? "proj" : sort === "ros" ? "ROS" : "total"}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {rows.length === 0 && <p className="p-5 text-[14px] text-muted">No players match. Try a last name or a team abbreviation.</p>}
          {rows.length > shown && (
            <div className="border-t border-rule p-3 text-center">
              <Button size="sm" onClick={() => setShown((n) => n + PAGE)}>
                Show more ({rows.length - shown} left)
              </Button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
