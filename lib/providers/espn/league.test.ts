import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeSwid, ownedTeamIds, parseLeague, parseScoring } from "./league";

const raw = JSON.parse(readFileSync("samples/fantasy-league-week7.json", "utf8"));

describe("ESPN league (real week-7 sample)", () => {
  const league = parseLeague(raw);

  it("reads the league, its teams and this week's matchups", () => {
    expect(league.size).toBe(10);
    expect(league.teams).toHaveLength(10);
    expect(league.currentPeriod).toBe(7);
    expect(league.scoringPeriod).toBe(7);
    expect(league.matchups).toHaveLength(5);
    const team = league.teams[0];
    expect(team.wins + team.losses + team.ties).toBe(6);
  });

  it("carries ESPN's live score, live projection and win probability", () => {
    const m = league.matchups[0];
    expect(m.home.points).toBeGreaterThan(0);
    expect(m.home.projectedLive).not.toBeNull();
    expect(m.home.winProbability).toBeGreaterThanOrEqual(0);
    expect((m.home.winProbability ?? 0) + (m.away?.winProbability ?? 0)).toBeCloseTo(1, 1);
  });

  it("reads lineups with league-scored points and slots", () => {
    const roster = league.matchups[0].home.roster;
    expect(roster.length).toBeGreaterThanOrEqual(15);
    const side = league.matchups[0].home;
    const starters = roster.filter((e) => e.slot !== "BENCH" && e.slot !== "IR");
    expect(starters.length).toBe(Object.values(league.lineup).reduce((a, b) => a + (b ?? 0), 0));
    // This is an IDP league: two defensive players start, and ESPN's total includes their points.
    expect(side.otherStarters).toBe(2);
    // Lineup points + IDP points add up to ESPN's own live total.
    const total = starters.reduce((sum, e) => sum + (e.points ?? 0), 0) + side.otherPoints;
    expect(Math.round(total * 100) / 100).toBeCloseTo(league.matchups[0].home.points, 1);
    expect(roster.every((e) => e.playerId && e.name)).toBe(true);
  });

  it("translates the league's scoring into the app's stat names", () => {
    const scoring = parseScoring(raw);
    expect(scoring.rules.passTd).toBeDefined();
    expect(scoring.rules.rec).toBe(scoring.ppr);
    // D/ST-only overrides (slot 16) apply to D/ST stats.
    expect(scoring.rules.dstPa28_34).toBeLessThan(0);
  });

  it("keeps every week's results for charts", () => {
    expect(league.results.filter((r) => r.period === 1)).toHaveLength(5);
    expect(league.results.every((r) => r.period <= 7)).toBe(true);
  });
});

describe("league membership (owners are ESPN account ids)", () => {
  it("finds the teams an account owns, whatever the SWID's case or braces", () => {
    const owner = raw.teams[3].owners[0] as string;
    expect(ownedTeamIds(raw, owner.toLowerCase().replace(/[{}]/g, ""))).toEqual([raw.teams[3].id]);
    expect(ownedTeamIds(raw, "{00000000-0000-4000-8000-999999999999}")).toEqual([]);
    expect(normalizeSwid(" abc ")).toBe("{ABC}");
  });
});
