import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { rulesForFormat, scoreStatLine } from "@/lib/scoring";
import type { StatLine } from "@/lib/stats";
import {
  DEFENSE_SAMPLE_SIZE,
  parseDefenseVsPosition,
  parseScheduleGames,
  weeklyActualsRequest,
} from "./defense";
import { fantasyStatsToStatLine } from "./stats";

function load(file: string): unknown {
  return JSON.parse(readFileSync(new URL(`../../../samples/${file}`, import.meta.url), "utf8"));
}

type KonaLine = {
  seasonId: number;
  scoringPeriodId: number;
  externalId: string;
  proTeamId: number;
  appliedTotal: number;
  stats: Record<string, number>;
};
type KonaEntry = { id: number; player: { id: number; fullName: string; defaultPositionId: number; stats: KonaLine[] } };

// Real responses: the first 120 players of the weekly-actuals query (2026, through week 6)
// and the season schedule.
const ACTUALS = load("fantasy-weekly-actuals-trimmed.json") as { players: KonaEntry[] };
const SCHEDULE = load("fantasy-pro-team-schedules.json");
const PPR = rulesForFormat("ppr");

function only(...names: string[]) {
  return { players: ACTUALS.players.filter((p) => names.includes(p.player.fullName)) };
}

describe("parseScheduleGames", () => {
  it("reads every game once with its week, home and away team", () => {
    const games = parseScheduleGames(SCHEDULE);
    expect(games.size).toBe(272); // 17 weeks × 16 games
    expect(games.get("401872931")).toEqual({ id: "401872931", week: 1, homeId: "12", awayId: "7" });
  });
});

describe("parseDefenseVsPosition", () => {
  it("credits a player's game to the defense he played against", () => {
    // Jahmyr Gibbs (DET RB) played at Arizona (team 22) in week 5: game 401872991.
    const dvp = parseDefenseVsPosition(only("Jahmyr Gibbs"), SCHEDULE, 2026, 5);
    const gibbs = ACTUALS.players.find((p) => p.player.fullName === "Jahmyr Gibbs")!.player;
    const week5 = gibbs.stats.find((s) => s.seasonId === 2026 && s.scoringPeriodId === 5)!;
    expect(dvp.teams["22"].RB?.stats).toEqual(fantasyStatsToStatLine(week5.stats));
    expect(scoreStatLine(dvp.teams["22"].RB!.stats, PPR).total).toBe(37.7); // ESPN's own PPR total
    // Nothing is credited to his own team.
    expect(dvp.teams["8"].RB?.stats).toEqual({});
  });

  it("only counts weeks 1..throughWeek of the requested season", () => {
    // Gibbs also has a 2025 week-18 line in the response, which must be ignored.
    const through4 = parseDefenseVsPosition(only("Jahmyr Gibbs"), SCHEDULE, 2026, 4);
    expect(through4.teams["22"].RB?.stats).toEqual({});
    const other = parseDefenseVsPosition(only("Jahmyr Gibbs"), SCHEDULE, 2025, 18);
    const total = Object.values(other.teams).reduce((sum, t) => sum + Object.keys(t.RB?.stats ?? {}).length, 0);
    expect(total).toBe(0); // 2025 games aren't on the 2026 schedule
  });

  it("counts games played per defense, skipping byes", () => {
    const dvp = parseDefenseVsPosition({ players: [] }, SCHEDULE, 2026, 6);
    expect(Object.keys(dvp.teams)).toHaveLength(32);
    expect(dvp.teams["12"].QB?.games).toBe(5); // Kansas City's bye was week 5
    expect(dvp.teams["3"].QB?.games).toBe(6);
  });

  it("uses the team a player was on that week (trades)", () => {
    const gibbs = structuredClone(only("Jahmyr Gibbs"));
    // Pretend he played for Arizona in that game: then Detroit's defense allowed it.
    gibbs.players[0].player.stats.find((s) => s.seasonId === 2026 && s.scoringPeriodId === 5)!.proTeamId = 22;
    const dvp = parseDefenseVsPosition(gibbs, SCHEDULE, 2026, 5);
    expect(scoreStatLine(dvp.teams["8"].RB!.stats, PPR).total).toBe(37.7);
    expect(dvp.teams["22"].RB?.stats).toEqual({});
  });

  it("adds up every player's real points without losing or doubling any", () => {
    const dvp = parseDefenseVsPosition(ACTUALS, SCHEDULE, 2026, 6);
    let espnTotal = 0;
    for (const { player } of ACTUALS.players) {
      for (const s of player.stats) if (s.seasonId === 2026 && s.scoringPeriodId <= 6) espnTotal += s.appliedTotal;
    }
    let ours = 0;
    for (const positions of Object.values(dvp.teams)) {
      for (const allowed of Object.values(positions)) ours += scoreStatLine(allowed.stats as StatLine, PPR).total;
    }
    expect(Math.abs(ours - espnTotal)).toBeLessThan(0.5);
  });

  it("never throws on missing or odd data", () => {
    expect(parseDefenseVsPosition(undefined, undefined, 2026, 6)).toEqual({ season: 2026, throughWeek: 6, teams: {} });
    const odd = parseDefenseVsPosition(
      { players: [{ player: { defaultPositionId: 3, stats: [{ statSourceId: 0, statSplitTypeId: 1, seasonId: 2026, scoringPeriodId: 1, externalId: "nope" }] } }, null, "x"] },
      SCHEDULE,
      2026,
      1,
    );
    expect(Object.values(odd.teams).every((t) => Object.keys(t.WR?.stats ?? {}).length === 0)).toBe(true);
  });
});

describe("weeklyActualsRequest", () => {
  it("asks for real weekly lines of the most-owned QBs, RBs, WRs and TEs", () => {
    const { url, headers } = weeklyActualsRequest(2026, 6);
    expect(url).toContain("/seasons/2026/segments/0/leaguedefaults/3?scoringPeriodId=7&view=kona_player_info");
    const filter = JSON.parse(headers["x-fantasy-filter"]).players;
    expect(filter.filterSlotIds.value).toEqual([0, 2, 4, 6]);
    expect(filter.filterStatsForSourceIds.value).toEqual([0]);
    expect(filter.filterStatsForSplitTypeIds.value).toEqual([1]);
    expect(filter.filterStatsForTopScoringPeriodIds.value).toBe(6);
    expect(filter.limit).toBe(DEFENSE_SAMPLE_SIZE);
  });
});
