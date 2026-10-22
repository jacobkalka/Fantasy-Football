/**
 * Back-test on REAL past weeks (needs the internet, so it's skipped in `npm test`).
 * Run it with:
 *   BACKTEST=1 npx vitest run lib/startsit/backtest.live.test.ts
 * Options: BACKTEST_WEEKS=4,5,6 (default 6), BACKTEST_FORMAT=half (default ppr).
 *
 * For each week: take the most-owned players, find same-position "close calls"
 * (ESPN projections within 25% of each other), and check whether the model's pick
 * or the higher projection actually scored more. Uses only what was knowable before
 * that week: projections for that week, form and defense stats from earlier weeks.
 * Today's injury report says nothing about a past week, so injuries are left out,
 * and finished games no longer carry betting lines, so Vegas is usually missing too.
 */
import { describe, expect, it } from "vitest";
import { sports } from "@/lib/providers";
import type { Player } from "@/lib/providers/types";
import { rulesForFormat, scoreStatLine, type ScoringFormat } from "@/lib/scoring";
import { backtest, closePairs, type BacktestCase } from "./backtest";
import { assemblePlayerFactors, isOffense } from "./factors";

const WEEKS = (process.env.BACKTEST_WEEKS ?? "6").split(",").map(Number);
const FORMAT = (process.env.BACKTEST_FORMAT ?? "ppr") as ScoringFormat;
/** How many of the most-owned players to consider at each position. */
const POOL = { QB: 24, RB: 40, WR: 50, TE: 20 } as const;

describe.skipIf(!process.env.BACKTEST)("back-test on real ESPN data", () => {
  it(
    `weeks ${WEEKS.join(", ")} (${FORMAT})`,
    async () => {
      const current = await sports.getScoreboard();
      const season = current.season;
      const [players, teams, byeWeeks] = await Promise.all([
        sports.getPlayers(season),
        sports.getTeams(),
        sports.getByeWeeks(season),
      ]);
      const pool: Player[] = [];
      for (const [position, count] of Object.entries(POOL)) {
        pool.push(...players.filter((p) => p.position === position && p.teamId).slice(0, count));
      }
      const rules = rulesForFormat(FORMAT);
      const cases: BacktestCase[] = [];

      for (const week of WEEKS) {
        const [board, outlooks, defense] = await Promise.all([
          sports.getScoreboard({ season, week }),
          sports.getPlayerOutlooks(pool.map((p) => p.id).sort(), season, week),
          sports.getDefenseVsPosition(season, week - 1),
        ]);
        // Real points that week; players with no stat line (inactive) are left out.
        const actual = new Map<string, number>();
        for (const o of outlooks) {
          const line = o.weeks.find((w) => w.week === week);
          if (line) actual.set(o.playerId, scoreStatLine(line.stats, rules).total);
        }
        const factors = assemblePlayerFactors({
          format: FORMAT,
          week,
          players: pool.filter((p) => isOffense(p.position) && actual.has(p.id)),
          outlooks,
          scoreboard: board,
          byeWeeks,
          defense,
          teams,
          useInjuries: false,
        });
        for (const [a, b] of closePairs(factors, { maxGap: 0.25, minProjection: 6 })) {
          cases.push({ a, b, actualA: actual.get(a.playerId)!, actualB: actual.get(b.playerId)! });
        }
      }

      const result = backtest(cases, FORMAT);
      const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "–");
      console.log(
        [
          `Back-test, week(s) ${WEEKS.join(", ")}, ${FORMAT}: ${result.pairs} close-call pairs (${result.ties} ties skipped)`,
          `  Model picked the higher scorer:          ${result.modelCorrect}/${result.pairs} (${pct(result.modelCorrect, result.pairs)})`,
          `  Higher ESPN projection picked it:        ${result.projectionCorrect}/${result.pairs} (${pct(result.projectionCorrect, result.pairs)})`,
          `  They disagreed on ${result.disagreements} pairs; the model was right on ${result.modelWonDisagreements}`,
          ...Object.entries(result.byConfidence).map(
            ([level, b]) => `  ${level.padEnd(6)} picks: ${b.correct}/${b.pairs} (${pct(b.correct, b.pairs)})`,
          ),
        ].join("\n"),
      );
      expect(result.pairs).toBeGreaterThan(0);
    },
    120_000,
  );
});
