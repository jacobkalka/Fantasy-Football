import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { rulesForFormat, scoreStatLine } from "@/lib/scoring";
import { parsePlayerUniverse, parseTeamSchedules, UNIVERSE_SIZE, universeRequest } from "./universe";

const sample = (name: string) => JSON.parse(readFileSync(`samples/${name}`, "utf8"));
// Real ESPN responses: the 650 most-rostered players during week 7 of 2026 (after Thursday's game),
// trimmed of fields the app doesn't read, and the season schedule.
const playersRaw = sample("fantasy-universe-week7.json");
const scheduleRaw = sample("fantasy-pro-team-schedules.json");
const universe = parsePlayerUniverse(playersRaw, scheduleRaw, 2026, 7);
const byName = new Map(universe.players.map((p) => [p.name, p]));

type RawStat = { id: string; statSourceId: number; statSplitTypeId: number; scoringPeriodId: number; appliedTotal: number };
type RawEntry = { player: { id: number; fullName: string; stats: RawStat[] } };

describe("universeRequest", () => {
  it("asks for the most-rostered QB/RB/WR/TE/K/DST with this season's lines only", () => {
    const { url, headers } = universeRequest(2026, 7);
    expect(url).toContain("scoringPeriodId=7");
    expect(url).toContain("view=kona_player_info");
    const filter = JSON.parse(headers["x-fantasy-filter"]).players;
    expect(filter.limit).toBe(UNIVERSE_SIZE);
    expect(filter.sortPercOwned.sortAsc).toBe(false);
    expect(filter.filterSlotIds.value).toEqual([0, 2, 4, 6, 17, 16]);
    expect(filter.filterStatsForTopScoringPeriodIds.value).toBe(7);
    expect(filter.filterStatsForTopScoringPeriodIds.additionalValue).toEqual(["002026", "102026", "1120267"]);
  });
});

describe("parsePlayerUniverse", () => {
  it("reads every player, most rostered first, with all six positions", () => {
    expect(universe.players).toHaveLength(650);
    const positions = new Set(universe.players.map((p) => p.position));
    expect([...positions].sort()).toEqual(["DST", "K", "QB", "RB", "TE", "WR"]);
    const owned = universe.players.map((p) => p.percentOwned ?? 0);
    expect(owned).toEqual([...owned].sort((a, b) => b - a));
    expect(universe.players.filter((p) => p.position === "DST")).toHaveLength(32);
  });

  it("reads identity, market signals and bye weeks", () => {
    const gibbs = byName.get("Jahmyr Gibbs")!;
    expect(gibbs).toMatchObject({ id: "4429795", position: "RB", teamId: "8", byeWeek: 6, injuryStatus: "ACTIVE" });
    expect(gibbs.percentOwned).toBeCloseTo(99.94, 2);
    expect(gibbs.percentStarted).toBeGreaterThan(90);
    expect(typeof gibbs.percentOwnedChange).toBe("number");
    expect(gibbs.headshot).toContain("4429795");
    expect(byName.get("Steelers D/ST")!.headshot).toBeNull();
  });

  it("marks weeks a player missed (ESPN sends an empty line) as not played", () => {
    const puka = byName.get("Puka Nacua")!;
    expect(puka.weeks.map((w) => w.week)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(puka.weeks.filter((w) => w.played).map((w) => w.week)).toEqual([1, 4, 5, 6]);
  });

  it("ESPN's season projection is rest of season: projected games = team games left from this week", () => {
    // Remaining weeks 7-18 minus the bye, for healthy players (ESPN discounts injured ones).
    const healthy = universe.players.filter(
      (p) => p.injuryStatus === "ACTIVE" && p.restOfSeason && p.restOfSeason.games > 0 && p.position !== "DST",
    );
    const matching = healthy.filter((p) => p.restOfSeason!.games === p.teamGamesLeft);
    expect(matching.length / healthy.length).toBeGreaterThan(0.9);
    // Detroit's bye (week 6) is behind it: 12 games left. Buffalo's bye is week 7: 11 left.
    expect(byName.get("Jahmyr Gibbs")!.restOfSeason!.games).toBe(12);
    expect(byName.get("Josh Allen")!.teamGamesLeft).toBe(11);
    // On injured reserve with 102 points already scored, projected 0: so it can't include past weeks.
    const adams = byName.get("Davante Adams")!;
    expect(adams.restOfSeason!.games).toBe(0);
    expect(scoreStatLine(adams.restOfSeason!.stats, rulesForFormat("ppr")).total).toBe(0);
  });

  it("counts a D/ST's remaining games from the schedule (ESPN always says 17)", () => {
    const steelers = byName.get("Steelers D/ST")!;
    expect(steelers.restOfSeason!.games).toBe(11);
    expect(steelers.teamGamesLeft).toBe(11);
  });

  it("our PPR scoring of every weekly and rest-of-season line equals ESPN's own total", () => {
    const rules = rulesForFormat("ppr");
    let checked = 0;
    for (const entry of playersRaw.players as RawEntry[]) {
      const player = universe.players.find((p) => p.id === String(entry.player.id))!;
      for (const line of entry.player.stats) {
        let ours: number | undefined;
        if (line.id === "102026") ours = player.restOfSeason ? scoreStatLine(player.restOfSeason.stats, rules).total : undefined;
        else if (line.statSourceId === 0 && line.statSplitTypeId === 1) {
          const week = player.weeks.find((w) => w.week === line.scoringPeriodId);
          ours = week && scoreStatLine(week.stats, rules).total;
        }
        if (ours === undefined) continue;
        checked++;
        expect(Math.abs(ours - line.appliedTotal), `${player.name} ${line.id}`).toBeLessThan(0.05);
      }
    }
    expect(checked).toBe(4078); // 3,485 weekly lines + 593 rest-of-season lines
  });

  it("keeps only defensive TDs from a two-way player's defensive stats", () => {
    const hunter = byName.get("Travis Hunter")!;
    for (const w of hunter.weeks) {
      expect(Object.keys(w.stats).filter((k) => k.startsWith("dst") && !k.endsWith("Td"))).toEqual([]);
    }
    expect(hunter.restOfSeason!.stats.dstIntTd).toBeGreaterThan(0);
  });
});

describe("parseTeamSchedules", () => {
  it("knows each team's bye and games left", () => {
    const { bye, gamesLeft } = parseTeamSchedules(scheduleRaw, 7);
    expect(bye.get("17")).toBe(11); // New England
    expect(gamesLeft.get("17")).toBe(11);
    expect(parseTeamSchedules(scheduleRaw, 1).gamesLeft.get("17")).toBe(17);
  });
});
