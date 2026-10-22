import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseBoxscore, parseCorePlays } from "@/lib/providers/espn/stats";
import { parseDrives, parseSummaryGame, parseTeamStats, parseWinProbability } from "@/lib/providers/espn/summary";
import type { Game, GameDetail } from "@/lib/providers/types";
import { buildGameView, fieldPositionFrom } from "./game-view";

const sample = (name: string) => JSON.parse(readFileSync(`samples/${name}`, "utf8"));

function detail(gameId: string): GameDetail {
  const summary = sample(`summary-${gameId}-final.json`);
  return {
    game: parseSummaryGame(summary),
    drives: parseDrives(summary),
    plays: parseCorePlays(sample(`core-plays-${gameId}.json`), gameId),
    boxscore: parseBoxscore(summary),
    teamStats: parseTeamStats(summary),
    winProbability: parseWinProbability(summary),
  };
}

describe("Game Center view of HOU 34 – JAX 31 (Week 6)", () => {
  const view = buildGameView(detail("401872996"), "ppr");

  it("lists real plays only, oldest first, with cleaned text", () => {
    expect(view.plays.length).toBeGreaterThan(120);
    expect(view.plays.some((p) => /Timeout|END QUARTER/i.test(p.type + p.text))).toBe(false);
    for (let i = 1; i < view.plays.length; i++) expect(view.plays[i].sequence).toBeGreaterThan(view.plays[i - 1].sequence);
    expect(view.plays.every((p) => !p.text.startsWith("(Shotgun)"))).toBe(true);
  });

  it("finds all eight touchdowns (4 each) and the final score", () => {
    expect(view.plays.filter((p) => p.isTouchdown)).toHaveLength(8);
    const last = view.plays[view.plays.length - 1];
    expect([last.awayScore, last.homeScore]).toEqual([34, 31]);
  });

  it("attaches each play's fantasy points and drive", () => {
    const td = view.plays.find((p) => p.isTouchdown && p.fantasy.some((f) => f.playerId === "3843945"))!;
    // Foster Moreau 6-yard TD catch: 0.6 yds + 6 TD + 1 reception in PPR.
    expect(td.fantasy.find((f) => f.playerId === "3843945")?.points).toBeCloseTo(7.6, 2);
    expect(td.driveId).toBeTruthy();
  });

  it("ranks fantasy leaders by official points (Lawrence 27.34 PPR)", () => {
    expect(view.leaders[0]).toMatchObject({ playerId: "4360310", points: 27.34 });
    expect(view.leaders[0].summary).toMatch(/306 yds/);
    expect(view.players["4360310"]).toMatchObject({ name: "Trevor Lawrence", teamId: "30" });
  });

  it("gives the winner a 100% win probability once final", () => {
    expect(view.homeWinPct).toBe(0); // JAX was home and lost
    expect(view.field).toBeNull();
  });
});

describe("fieldPositionFrom", () => {
  const game = (downDistance: string): Game =>
    ({
      state: "in",
      home: { team: { abbr: "JAX", id: "30" } },
      away: { team: { abbr: "HOU", id: "34" } },
      situation: { downDistance, possessionTeamId: "34", isRedZone: false },
    }) as unknown as Game;

  it("measures from the away goal line (0) to the home goal line (100)", () => {
    expect(fieldPositionFrom(game("1st & 10 at HOU 38"))?.ballOn).toBe(38);
    expect(fieldPositionFrom(game("3rd & 2 at JAX 12"))?.ballOn).toBe(88);
    expect(fieldPositionFrom(game("2nd & 5 at 50"))?.ballOn).toBe(50);
    expect(fieldPositionFrom(game("1st & 10 at HST 25"))?.ballOn).toBe(25);
  });

  it("returns nothing when it can't tell", () => {
    expect(fieldPositionFrom(game("Kickoff"))).toBeNull();
    expect(fieldPositionFrom(game("1st & 10 at XYZ 20"))).toBeNull();
  });
});
