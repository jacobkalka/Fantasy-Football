"use client";

import { useMemo } from "react";
import { LineChart } from "@/components/charts/LineChart";
import type { Universe } from "@/lib/analysis/universe";
import type { LeagueResponse } from "@/lib/fantasy/context";
import type { FantasyTeam } from "@/lib/teams/types";

/**
 * "How has my team been scoring?" For an ESPN team: your real weekly totals against your
 * opponent's that week, straight from the league. For a hand-built team there's no real weekly
 * lineup history, so it shows what your CURRENT starters scored each week (and says so).
 */
export function WeeklyScoreChart({
  team,
  league,
  universe,
}: {
  team: FantasyTeam;
  league: LeagueResponse | undefined;
  universe: Universe | undefined;
}) {
  const chart = useMemo(() => {
    if (team.espn && league) {
      const mine = league.results.filter((r) => r.homeId === team.espn!.teamId || r.awayId === team.espn!.teamId);
      if (mine.length < 2) return null;
      const labels = mine.map((r) => `W${r.period}`);
      const you = mine.map((r) => (r.homeId === team.espn!.teamId ? r.homePoints : r.awayPoints));
      const them = mine.map((r) => (r.homeId === team.espn!.teamId ? r.awayPoints : r.homePoints));
      const wins = mine.filter((r) => (r.winner === "HOME" && r.homeId === team.espn!.teamId) || (r.winner === "AWAY" && r.awayId === team.espn!.teamId)).length;
      return {
        title: "Your score each week vs your opponent",
        note: `${wins} wins in ${mine.filter((r) => r.winner !== "UNDECIDED").length} finished weeks. This week updates live.`,
        labels,
        series: [
          { id: "you", label: team.name, color: "var(--color-chart-1)", values: you, markers: true, area: true },
          { id: "opp", label: "Opponent", color: "var(--color-chart-2)", values: them, markers: true },
        ],
      };
    }
    if (!universe) return null;
    const starters = new Set(team.players.filter((p) => p.slot !== "BENCH").map((p) => p.playerId));
    const totals = new Map<number, number>();
    for (const p of universe.players) {
      if (!starters.has(p.id)) continue;
      for (const g of p.games) totals.set(g.week, (totals.get(g.week) ?? 0) + g.points);
    }
    const weeks = [...totals.keys()].sort((a, b) => a - b);
    if (weeks.length < 2) return null;
    return {
      title: "What your current starters scored each week",
      note: "Your lineup's history isn't saved for hand-built teams, so this adds up today's starters' real points each week.",
      labels: weeks.map((w) => `W${w}`),
      series: [{ id: "you", label: "Current starters", color: "var(--color-chart-1)", values: weeks.map((w) => Math.round((totals.get(w) ?? 0) * 100) / 100), markers: true, area: true }],
    };
  }, [team, league, universe]);

  if (!chart) return null;
  return (
    <section className="card p-5">
      <h2 className="mb-1 text-[16px] font-semibold">{chart.title}</h2>
      <p className="mb-3 text-[12px] text-faint">{chart.note}</p>
      <LineChart labels={chart.labels} series={chart.series} yMin={0} ariaLabel={chart.title} />
    </section>
  );
}
