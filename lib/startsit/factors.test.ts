import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseScoreboard } from "@/lib/providers/espn/scoreboard";
import type { DefenseVsPosition, Player, PlayerOutlook } from "@/lib/providers/types";
import { assemblePlayerFactors, rankDefenses, throughWeekFor, vegasFor, weekImpliedAverage } from "./factors";

function load(file: string): unknown {
  return JSON.parse(readFileSync(new URL(`../../samples/${file}`, import.meta.url), "utf8"));
}

// Real week-7 2026 scoreboard: NE @ CHI "CHI -3", total 50.5, Soldier Field (outdoors), "Mostly clear" 61°F.
const BOARD = parseScoreboard(load("scoreboard.json"));
const CHI_NE = BOARD.games.find((g) => g.id === "401873010")!;

const player = (id: string, teamId: string | null, position: Player["position"] = "WR"): Player => ({
  id,
  name: `Player ${id}`,
  position,
  teamId,
  headshot: null,
});

describe("vegasFor", () => {
  it("splits the total by the spread: implied = total/2 − spread/2 from each team's side", () => {
    expect(vegasFor(CHI_NE, "3", 22.5)).toEqual({ teamAbbr: "CHI", impliedTotal: 26.75, leagueAverage: 22.5, overUnder: 50.5, spread: -3 });
    expect(vegasFor(CHI_NE, "17", 22.5)).toEqual({ teamAbbr: "NE", impliedTotal: 23.75, leagueAverage: 22.5, overUnder: 50.5, spread: 3 });
  });

  it("flips ESPN's home-side spread for an away favorite", () => {
    // PIT @ NO: "PIT -3.5", ESPN spread +3.5 (home NO is the underdog), total 44.5.
    const game = BOARD.games.find((g) => g.away.team.abbr === "PIT")!;
    expect(vegasFor(game, game.away.team.id, 22.5)?.impliedTotal).toBe(24);
    expect(vegasFor(game, game.home.team.id, 22.5)?.impliedTotal).toBe(20.5);
  });

  it("is null without a line", () => {
    expect(vegasFor({ ...CHI_NE, odds: undefined }, "3", 22.5)).toBeNull();
  });

  it("averages this week's implied totals", () => {
    const totals = BOARD.games.map((g) => g.odds!.overUnder!);
    expect(weekImpliedAverage(BOARD.games)).toBeCloseTo(totals.reduce((a, b) => a + b) / totals.length / 2);
    expect(weekImpliedAverage([])).toBe(22.5);
  });
});

describe("rankDefenses", () => {
  const dvp: DefenseVsPosition = {
    season: 2026,
    throughWeek: 2,
    teams: {
      "1": { WR: { games: 2, stats: { rec: 10, recYds: 200 } } }, // PPR 30 → 15 a game
      "2": { WR: { games: 2, stats: { rec: 20, recYds: 400, recTd: 2 } } }, // PPR 72 → 36 a game
      "3": { WR: { games: 1, stats: { rec: 5, recYds: 100 } } }, // PPR 15 → 15 a game (bye)
    },
  };

  it("ranks per game in the chosen format, 1 = toughest", () => {
    const table = rankDefenses(dvp, "ppr");
    expect(table.WR.byTeam["2"]).toMatchObject({ rank: 3, allowedPerGame: 36 });
    expect(table.WR.byTeam["1"].rank).toBe(1); // ties go by team id
    expect(table.WR.leagueAverage).toBe(22);
    expect(table.WR.teams).toBe(3);
    expect(rankDefenses(dvp, "standard").WR.byTeam["2"].allowedPerGame).toBe(26);
  });
});

describe("assemblePlayerFactors", () => {
  const outlook = (playerId: string, extra: Partial<PlayerOutlook> = {}): PlayerOutlook => ({
    playerId,
    injuryStatus: "ACTIVE",
    projection: { rec: 5, recYds: 60 },
    weeks: [
      { week: 5, stats: { rec: 4, recYds: 50 } },
      { week: 6, stats: { rec: 6, recYds: 90, recTd: 1 } },
      { week: 7, stats: { rec: 9, recYds: 150 } }, // this week's game: not "recent form"
    ],
    seasonProjection: null,
    ...extra,
  });

  const base = {
    format: "ppr" as const,
    week: 7,
    scoreboard: BOARD,
    byeWeeks: { "30": 7 },
    defense: null,
    teams: [],
  };

  it("builds a player's inputs from real game data", () => {
    const [chicago] = assemblePlayerFactors({ ...base, players: [player("9", "3")], outlooks: [outlook("9")] });
    expect(chicago).toMatchObject({
      unavailable: null,
      projection: 11,
      teamAbbr: "CHI",
      injuryStatus: "ACTIVE",
      recent: [
        { week: 5, points: 9 },
        { week: 6, points: 21 },
      ],
      weather: { indoor: false, text: "Mostly clear", temperature: 61 },
      game: { id: "401873010", isHome: true, opponentAbbr: "NE", state: "pre" },
    });
    expect(chicago.vegas?.impliedTotal).toBe(26.75);
    expect(chicago.matchup).toBeNull(); // no defense data passed in
  });

  it("knows a bye from a free agent, and sits players ruled out", () => {
    const players = [player("1", "30"), player("2", null), player("3", "3")];
    const outlooks = [outlook("1"), outlook("2"), outlook("3", { injuryStatus: "OUT" })];
    const [bye, freeAgent, out] = assemblePlayerFactors({ ...base, players, outlooks });
    expect(bye.unavailable).toBe("bye");
    expect(freeAgent.unavailable).toBe("no-game");
    expect(out.unavailable).toBe("out");
  });

  it("marks data it couldn't load as unknown instead of guessing", () => {
    const [p] = assemblePlayerFactors({ ...base, players: [player("9", "3")], outlooks: null });
    expect(p).toMatchObject({ injuryStatus: null, projection: null, recent: [] });
    const [noInjuries] = assemblePlayerFactors({ ...base, players: [player("9", "3")], outlooks: [outlook("9", { injuryStatus: "OUT" })], useInjuries: false });
    expect(noInjuries).toMatchObject({ injuryStatus: null, unavailable: null });
  });

  it("adds the opponent's rank against the position", () => {
    const defense: DefenseVsPosition = {
      season: 2026,
      throughWeek: 6,
      teams: { "17": { RB: { games: 6, stats: { rushYds: 900, rushTd: 6 } } }, "3": { RB: { games: 6, stats: { rushYds: 600 } } } },
    };
    const [rb] = assemblePlayerFactors({ ...base, defense, players: [player("9", "3", "RB")], outlooks: [outlook("9")] });
    expect(rb.matchup).toEqual({ opponentId: "17", opponentAbbr: "NE", rank: 2, teams: 2, allowedPerGame: 21, leagueAverage: 15.5, games: 6 });
  });

  it("leaves out kickers and defenses", () => {
    expect(assemblePlayerFactors({ ...base, players: [player("1", "3", "K")], outlooks: [] })).toEqual([]);
  });
});

describe("throughWeekFor", () => {
  it("uses finished weeks only", () => {
    expect(throughWeekFor(2, 7)).toBe(6);
    expect(throughWeekFor(2, 1)).toBe(0);
    expect(throughWeekFor(3, 2)).toBe(18);
    expect(throughWeekFor(1, 3)).toBe(0);
  });
});
