import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { boxscoreLine, parseAthleteBio, parseCareer, parseGameLog, parseSeasonAdvanced, parseSplits, readNamedStats, statNumber } from "./athlete";
import { mergePlayerSeason } from "./player";
import { parsePlayerFantasy, playerFantasyRequest } from "./player-fantasy";
import { parseDepthChart, parseTeamSchedule } from "./team-pages";

const sample = (name: string) => JSON.parse(readFileSync(`samples/${name}`, "utf8"));
const bios = sample("athlete-bio-trimmed.json");
const cores = sample("athlete-core-trimmed.json");
const bio = (id: string) => parseAthleteBio(bios[id], cores[id]);

describe("athlete bio", () => {
  it("reads a veteran QB, using the core record's structured fields", () => {
    expect(bio("3139477")).toMatchObject({
      name: "Patrick Mahomes",
      sourcePosition: "QB",
      position: "QB",
      teamId: "12",
      teamAbbr: "KC",
      jersey: "15",
      age: 31,
      birthDate: "1995-09-17",
      birthPlace: "Whitehouse, TX",
      heightInches: 74,
      weightLbs: 225,
      nflSeason: 10,
      college: "Texas Tech",
      draft: { year: 2017, round: 1, pick: 10, teamId: "12" },
      status: "Active",
      injuries: [],
    });
    expect(bio("3139477").seasonRanks?.season).toBe(2026);
    expect(bio("3139477").seasonRanks?.stats[0]).toMatchObject({ stat: "passingYards", value: 1309, rank: 17, rankDisplay: "17th" });
  });

  it("counts a rookie's season as 1 (ESPN says 0 years)", () => {
    expect(bio("4870808")).toMatchObject({ nflSeason: 1, draft: { year: 2026, round: 1, pick: 3 }, college: "Notre Dame" });
  });

  it("maps a place-kicker to K and has no draft for an undrafted player", () => {
    expect(bio("3953687")).toMatchObject({ sourcePosition: "PK", position: "K", draft: null });
  });

  it("reads injuries, newest first, with ESPN's return date", () => {
    const adams = bio("16800");
    expect(adams.status).toBe("Day-To-Day");
    expect(adams.injuries[0]).toMatchObject({ status: "Injured Reserve", type: "Hamstring", side: "Left", detail: "Surgery", returnDate: "2026-11-25T00:00:00.000+00:00" });
  });

  it("gives a free agent no team even though ESPN still shows his last one", () => {
    expect(bio("15795")).toMatchObject({ status: "Free Agent", teamId: null, teamAbbr: null });
  });

  it("falls back to the display strings when the core record is missing", () => {
    const fallback = parseAthleteBio(bios["3139477"], null);
    // displayDOB is day/month/year: "17/9/1995".
    expect(fallback).toMatchObject({ birthDate: "1995-09-17", heightInches: 74, weightLbs: 225, nflSeason: 10, draft: { year: 2017, round: 1, pick: 10, teamId: null } });
    expect(parseAthleteBio(bios["4870808"], null).nflSeason).toBe(1);
  });
});

describe("named stats", () => {
  it("reads ESPN's display numbers", () => {
    expect(statNumber("1,309")).toBe(1309);
    expect(statNumber("-")).toBeNull();
    expect(statNumber("66.5")).toBe(66.5);
  });

  it("splits kicks into bands and resolves 50+ with the longest make", () => {
    const names = ["fieldGoalsMade1_19-fieldGoalAttempts1_19", "fieldGoalsMade40_49-fieldGoalAttempts40_49", "fieldGoalsMade50-fieldGoalAttempts50", "fieldGoalsMade-fieldGoalAttempts", "longFieldGoalMade", "extraPointsMade-extraPointAttempts"];
    const under60 = readNamedStats(names, ["1-1", "1-2", "2-2", "4-5", "55", "3-4"]);
    expect(boxscoreLine(under60)).toEqual({ fgMade0_39: 1, fgMade40_49: 1, fgMiss40_49: 1, fgMade50_59: 2, fgMade: 4, fgAtt: 5, fgMiss: 1, xpMade: 3, xpAtt: 4, xpMiss: 1 });
    const with60 = readNamedStats(names, ["0-0", "0-0", "1-1", "1-1", "61", "0-0"]);
    expect(boxscoreLine(with60)).toMatchObject({ fgMade60: 1, fgMade: 1 });
    expect(boxscoreLine(with60).fgMade50_59).toBeUndefined();
  });
});

describe("career table", () => {
  const careers = sample("athlete-stats-trimmed.json");

  it("adds up a season split between two teams (Totals row), keeping both teams", () => {
    const adams = parseCareer(careers["16800"]);
    const y2024 = adams.find((s) => s.season === 2024)!;
    expect(y2024).toMatchObject({ teams: ["LV", "NYJ"], gamesPlayed: 14, stats: { rec: 85, targets: 141, recYds: 1063, recTd: 8 }, twoPointConversions: 1 });
  });

  it("never reads the defensive table's interceptions as thrown picks", () => {
    const mahomes = parseCareer(careers["3139477"]);
    expect(mahomes.find((s) => s.season === 2018)?.stats).toMatchObject({ passInt: 12, passTd: 50, passYds: 5097 });
    // Scoring table TDs aren't double counted.
    expect(mahomes.find((s) => s.season === 2018)?.stats.rushTd).toBe(2);
  });

  it("keeps 50+ field goals and the longest make for kickers", () => {
    const aubrey = parseCareer(careers["3953687"]);
    expect(aubrey.find((s) => s.season === 2025)).toMatchObject({ fgMade50Plus: 11, fgMiss50Plus: 6, longFg: 64, stats: { fgMade: 36, fgAtt: 42, xpMade: 47, xpAtt: 48, xpMiss: 1 } });
  });

  it("covers a 22-season career, oldest first", () => {
    const rodgers = parseCareer(careers["8439"]);
    expect(rodgers).toHaveLength(22);
    expect(rodgers[0].season).toBe(2005);
    expect(rodgers.at(-1)?.season).toBe(2026);
  });
});

describe("game log", () => {
  const logs = sample("athlete-gamelog-trimmed.json");

  it("reads opponent, home/away, score and the box score", () => {
    const games = parseGameLog(logs["3139477"]);
    expect(games.map((g) => g.week)).toEqual([1, 2, 3, 4, 6]);
    expect(games[0]).toMatchObject({
      gameId: "401872931",
      opponentAbbr: "DEN",
      home: true,
      result: "W",
      teamScore: 31,
      opponentScore: 10,
      stats: { passCmp: 15, passAtt: 27, passYds: 184, passTd: 2, passInt: 1, rushAtt: 7, rushYds: 23, rushTd: 1 },
      extras: { longPass: 59, sacked: 2, passerRating: 86 },
    });
    expect(games[2]).toMatchObject({ opponentAbbr: "MIA", home: false, teamScore: 24, opponentScore: 10 });
  });

  it("leaves out games he missed (Love sat out Week 6)", () => {
    expect(parseGameLog(logs["4870808"]).map((g) => g.week)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("splits and tracking numbers", () => {
  const splits = sample("athlete-splits-trimmed.json");
  const advanced = sample("athlete-season-stats-trimmed.json");

  it("reads the red zone (Opp 19-Goal) and home/away", () => {
    expect(parseSplits(splits["4430807"], 2026).redZone).toEqual({ rushAtt: 20, rushYds: 57, rushTd: 3, rec: 1, recYds: 4 });
    expect(parseSplits(splits["4362628"], 2026).away).toMatchObject({ rec: 22, recYds: 250, recTd: 4 });
  });

  it("ignores splits for a different season", () => {
    expect(parseSplits(splits["4430807"], 2025)).toEqual({ redZone: null, home: null, away: null });
  });

  it("reads tracking numbers that add up, and treats 'not tracked' zeros as unknown", () => {
    const chase = parseSeasonAdvanced(advanced["4362628"]);
    expect(chase).toMatchObject({ yardsAfterCatch: 71, yardsAtCatch: 218, avgDepthOfTarget: 9.11, yardsPerRouteRun: 2.06, receivingFirstDowns: 14 });
    // Yards after the catch + yards at the catch = receiving yards (289), for every receiver sampled.
    for (const [id, yards] of [["4362628", 289], ["15847", 299], ["16800", 480], ["4430807", 144]] as const) {
      const a = parseSeasonAdvanced(advanced[id]);
      expect((a.yardsAfterCatch ?? 0) + (a.yardsAtCatch ?? 0)).toBe(yards);
    }
    const mahomes = parseSeasonAdvanced(advanced["3139477"]);
    expect(mahomes).toMatchObject({ avgDepthOfTarget: null, yardsPerRouteRun: null, yardsAfterCatch: null, passingYardsAfterCatch: 782, sacked: 6, passerRating: 103.1 });
    expect(Object.values(parseSeasonAdvanced(advanced["3953687"])).every((v) => v === null)).toBe(true);
  });
});

describe("fantasy feed for one player", () => {
  const kona = sample("fantasy-kona-player-profile.json");

  it("asks for every week's projection and both seasons' totals", () => {
    const { url, headers } = playerFantasyRequest("4870808", 2026, 7);
    expect(url).toContain("seasons/2026/segments/0/leaguedefaults/3?scoringPeriodId=7&view=kona_player_info");
    const filter = JSON.parse(headers["x-fantasy-filter"]);
    expect(filter.players.filterIds.value).toEqual([4870808]);
    expect(filter.players.filterStatsForTopScoringPeriodIds.additionalValue).toEqual(["002026", "002025", "102026", "1120261", "1120262", "1120263", "1120264", "1120265", "1120266", "1120267"]);
  });

  it("marks a missed game as not played (empty stats, no games-played stat)", () => {
    const love = parsePlayerFantasy(kona, "4870808", 2026, 7)!;
    expect(love.weeks.map((w) => [w.week, w.played])).toEqual([[1, true], [2, true], [3, true], [4, true], [5, true], [6, false]]);
    expect(love.weeks[0].stats).toEqual({ rushAtt: 11, rushYds: 41, rushTd: 1, recYds: 9, rec: 2, targets: 4 });
    // ESPN projected 0 while he was hurt: that's "no projection", not a projection of 0.
    expect(love.projections[6]).toBeUndefined();
    expect(love.projections[1]?.rushAtt).toBeCloseTo(11.6, 1);
    expect(love.info).toMatchObject({ injuryStatus: "QUESTIONABLE", percentOwned: 95.56, projection: null });
    expect(love.info.seasonTotals).toEqual([{ season: 2026, gamesPlayed: 5, stats: expect.objectContaining({ rushAtt: 67, rushYds: 245 }) }]);
  });

  it("reads a D/ST (no injury status) and last season's totals", () => {
    const kc = parsePlayerFantasy(kona, "-16012", 2026, 7)!;
    expect(kc.teamId).toBe("12");
    expect(kc.info.injuryStatus).toBeNull();
    expect(kc.weeks).toHaveLength(5);
    expect(kc.info.seasonTotals.map((t) => [t.season, t.gamesPlayed])).toEqual([[2026, 5], [2025, 17]]);
  });

  it("gives a free agent no team and no games", () => {
    const hopkins = parsePlayerFantasy(kona, "15795", 2026, 7)!;
    expect(hopkins).toMatchObject({ teamId: null, weeks: [] });
  });

  it("merges with the game log: fantasy stats, game-log context, missed games kept", () => {
    const games = mergePlayerSeason("4870808", 2026, parsePlayerFantasy(kona, "4870808", 2026, 7), parseGameLog(sample("athlete-gamelog-trimmed.json")["4870808"]));
    expect(games).toHaveLength(6);
    expect(games[0]).toMatchObject({ week: 1, opponentAbbr: "LAC", home: false, result: "W", played: true, statsSource: "fantasy" });
    expect(games[0].projection).not.toBeNull();
    expect(games[5]).toMatchObject({ week: 6, played: false, opponentAbbr: null, stats: {}, statsSource: null, projection: null });
  });

  it("falls back to the box score when the fantasy feed is down", () => {
    const games = mergePlayerSeason("3139477", 2026, null, parseGameLog(sample("athlete-gamelog-trimmed.json")["3139477"]));
    expect(games).toHaveLength(5);
    expect(games[0]).toMatchObject({ played: true, statsSource: "boxscore", stats: { passYds: 184 } });
  });
});

describe("team pages", () => {
  it("reads a schedule: results, bye week and upcoming games", () => {
    const ari = parseTeamSchedule(sample("team-schedule-trimmed.json")["22"], "22", 2026);
    expect(ari.byeWeek).toBe(14);
    expect(ari.games.find((g) => g.week === 6)).toMatchObject({ gameId: "401873004", opponentAbbr: "LAR", home: false, state: "post", teamScore: 18, opponentScore: 16, result: "W" });
    expect(ari.games.find((g) => g.week === 7)).toMatchObject({ opponentAbbr: "DEN", state: "pre", result: null, teamScore: null });
  });

  it("reads the depth chart: WR1-3 by slot, depth by rank, kickers from special teams", () => {
    const kc = parseDepthChart(sample("depthchart-trimmed.json")["12"], "12");
    expect(kc.formation).toBe("3WR 1TE");
    const spot = (id: string) => kc.spots.filter((s) => s.playerId === id);
    expect(spot("4428331")).toEqual([{ playerId: "4428331", position: "WR", spot: "WR1", depth: 1 }]);
    expect(spot("4683062")[0]).toMatchObject({ spot: "WR2", depth: 1 });
    expect(spot("5082630")[0]).toMatchObject({ spot: "WR3", depth: 1 });
    expect(spot("3139477")).toEqual([{ playerId: "3139477", position: "QB", spot: "QB", depth: 1 }]);
    expect(spot("4362887")[0]).toMatchObject({ spot: "QB", depth: 2 });
    expect(spot("3055899")).toEqual([{ playerId: "3055899", position: "PK", spot: "PK", depth: 1 }]);
    expect(kc.spots.some((s) => s.position === "LT")).toBe(false);
  });
});
