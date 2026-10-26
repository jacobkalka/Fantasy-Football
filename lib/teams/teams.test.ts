import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseLeague } from "@/lib/providers/espn/league";
import { leagueTeamChanged, nearestLeagueSize, teamFromLeague } from "./from-league";
import { parseLeagueInput } from "./league-helpers";
import { blankTeam, migrateTeams } from "./store";

const league = parseLeague(JSON.parse(readFileSync("samples/fantasy-league-week7.json", "utf8")));

describe("teams store migration", () => {
  it("turns the old single roster into the first team", () => {
    const state = migrateTeams({
      version: 1,
      name: "Sunday Scaries",
      format: "half",
      players: [{ playerId: "3139477", name: "Patrick Mahomes", position: "QB", teamId: "12", headshot: null, slot: "QB" }],
      updatedAt: "2026-10-20T10:00:00.000Z",
    });
    expect(state?.teams).toHaveLength(1);
    expect(state?.teams[0].name).toBe("Sunday Scaries");
    expect(state?.teams[0].format).toBe("half");
    expect(state?.activeId).toBe(state?.teams[0].id);
  });

  it("keeps good teams, drops damaged ones, and repairs a missing active id", () => {
    const good = blankTeam({ id: "t_abc123", name: "A" });
    const state = migrateTeams({ version: 2, activeId: "t_gone", teams: [good, { id: "bad" }, null] });
    expect(state?.teams.map((t) => t.id)).toEqual(["t_abc123"]);
    expect(state?.activeId).toBe("t_abc123");
  });

  it("refuses unusable data (so it gets backed up, not overwritten)", () => {
    expect(migrateTeams("nope")).toBeNull();
    expect(migrateTeams({ version: 2, teams: [] })).toBeNull();
  });
});

describe("ESPN league → team", () => {
  const team = teamFromLeague(league, league.teams[1].id, { isPrivate: false, syncedAt: "2026-10-26T18:00:00Z" })!;

  it("imports the lineup with the app's slots and the league's scoring", () => {
    expect(team.source).toBe("espn");
    expect(team.players.length).toBeGreaterThanOrEqual(15);
    expect(team.players.some((p) => p.slot === "QB")).toBe(true);
    expect(team.rules?.passTd).toBeDefined();
    expect(team.espn?.leagueId).toBe(league.id);
    expect(team.espn?.record).toMatch(/^\d+-\d+/);
  });

  it("marks every other team's players as taken, and none of its own", () => {
    const own = new Set(team.players.map((p) => p.playerId));
    expect(team.taken.length).toBeGreaterThan(100);
    expect(team.taken.some((id) => own.has(id))).toBe(false);
  });

  it("detects real changes only", () => {
    const saved = { ...team, id: "t_x1y2z3", updatedAt: "" };
    expect(leagueTeamChanged(saved, team)).toBe(false);
    expect(leagueTeamChanged(saved, { ...team, players: team.players.slice(1) })).toBe(true);
  });

  it("rounds league sizes to ones the analysis supports", () => {
    expect(nearestLeagueSize(10)).toBe(10);
    expect(nearestLeagueSize(11)).toBe(10);
    expect(nearestLeagueSize(20)).toBe(16);
  });
});

describe("league link parsing", () => {
  it("reads ids and ESPN URLs", () => {
    expect(parseLeagueInput(" 432593 ")).toEqual({ leagueId: "432593" });
    expect(
      parseLeagueInput("https://fantasy.espn.com/football/team?leagueId=432593&teamId=3&seasonId=2026"),
    ).toEqual({ leagueId: "432593", teamId: 3, season: 2026 });
    expect(parseLeagueInput("https://evil.example.com/?leagueId=1")).toBeNull();
    expect(parseLeagueInput("hello")).toBeNull();
  });
});
