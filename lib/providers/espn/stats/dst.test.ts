import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseDrives, parseSummaryGame, parseTeamStats } from "@/lib/providers/espn/summary";
import type { AttributedPlay, Game, GameDetail, Play, PlayerGameLine } from "@/lib/providers/types";
import { addStatLines, rulesForFormat, scoreStatLine } from "@/lib/scoring";
import type { StatLine } from "@/lib/stats";
import { parseBoxscore } from "./boxscore";
import {
  defensePlayDeltas,
  defenseStatLine,
  dstPlayerId,
  dstTeamId,
  pointsAllowedTier,
  yardsAllowedTier,
  type DefenseGame,
} from "./dst";
import { fantasyStatsToStatLine } from "./fantasy-ids";
import { deltasForPlay, parseCorePlays } from "./plays";

function load(file: string): unknown {
  return JSON.parse(readFileSync(new URL(`../../../../samples/${file}`, import.meta.url), "utf8"));
}

function realGame(gameId: string): GameDetail {
  const summary = load(`summary-${gameId}-final.json`);
  return {
    game: parseSummaryGame(summary),
    drives: parseDrives(summary),
    plays: parseCorePlays(load(`core-plays-${gameId}.json`), gameId),
    boxscore: parseBoxscore(summary),
    teamStats: parseTeamStats(summary),
    winProbability: [],
  };
}

const PPR = rulesForFormat("ppr");

describe("D/ST ids and tiers", () => {
  it("converts between team ids and ESPN's D/ST ids", () => {
    expect(dstPlayerId("12")).toBe("-16012");
    expect(dstPlayerId("3")).toBe("-16003");
    expect(dstTeamId("-16034")).toBe("34");
    expect(dstTeamId("4431611")).toBeNull();
  });

  it("puts points allowed in ESPN's tiers", () => {
    const cases: [number, string][] = [
      [0, "dstPa0"], [1, "dstPa1_6"], [6, "dstPa1_6"], [7, "dstPa7_13"], [13, "dstPa7_13"],
      [14, "dstPa14_17"], [17, "dstPa14_17"], [18, "dstPa18_21"], [21, "dstPa18_21"],
      [22, "dstPa22_27"], [27, "dstPa22_27"], [28, "dstPa28_34"], [34, "dstPa28_34"],
      [35, "dstPa35_45"], [45, "dstPa35_45"], [46, "dstPa46"], [70, "dstPa46"],
    ];
    for (const [points, tier] of cases) expect(pointsAllowedTier(points), String(points)).toBe(tier);
  });

  it("puts yards allowed in ESPN's tiers (a negative start counts as 0-99)", () => {
    const cases: [number, string][] = [
      [-8, "dstYa0_99"], [99, "dstYa0_99"], [100, "dstYa100_199"], [199, "dstYa100_199"],
      [200, "dstYa200_299"], [299, "dstYa200_299"], [300, "dstYa300_349"], [349, "dstYa300_349"],
      [350, "dstYa350_399"], [399, "dstYa350_399"], [400, "dstYa400_449"], [449, "dstYa400_449"],
      [450, "dstYa450_499"], [499, "dstYa450_499"], [500, "dstYa500_549"], [549, "dstYa500_549"],
      [550, "dstYa550"],
    ];
    for (const [yards, tier] of cases) expect(yardsAllowedTier(yards), String(yards)).toBe(tier);
  });
});

describe("D/ST lines on real week-6 games match ESPN exactly", () => {
  // ESPN's own week-6 D/ST lines: samples/fantasy-kona-k-dst-week6.json.
  const { players } = load("fantasy-kona-k-dst-week6.json") as {
    players: { player: { id: number; fullName: string; stats: { externalId: string; appliedTotal: number; stats: Record<string, number> }[] } }[];
  };
  const games = { "401872996": realGame("401872996"), "401872999": realGame("401872999") } as Record<string, GameDetail>;

  for (const { player } of players.filter((p) => p.player.id < 0)) {
    const espn = player.stats[0];
    const game = games[espn.externalId];
    if (!game) continue;
    const teamId = dstTeamId(String(player.id))!;

    it(`${player.fullName}: same stats and ${espn.appliedTotal} points`, () => {
      const line = defenseStatLine(game, teamId);
      expect(line).toEqual(fantasyStatsToStatLine(espn.stats));
      expect(scoreStatLine(line, PPR).total).toBeCloseTo(espn.appliedTotal, 2);
    });

    it(`${player.fullName}: the plays add up to the official line`, () => {
      const sum = defensePlayDeltas(game, teamId).reduce<StatLine>((s, d) => addStatLines(s, d.stats), {});
      expect(sum).toEqual(defenseStatLine(game, teamId));
    });
  }

  it("starts at 10 points on the opening kickoff, then moves tiers as the game goes", () => {
    const bears = defensePlayDeltas(games["401872999"], "3");
    expect(bears[0].play.type).toBe("Kickoff");
    expect(bears[0].stats).toEqual({ dstPa0: 1, dstYa0_99: 1 });
    expect(scoreStatLine(bears[0].stats, PPR).total).toBe(10);

    // Atlanta's first touchdown (with the extra point) ends the shutout: 0 -> 7 points
    // allowed, so the 0 tier (worth 5) switches off and 7-13 (worth 3) switches on.
    const firstScore = bears.find((d) => d.stats.dstPa0 === -1)!;
    expect(firstScore.stats).toMatchObject({ dstPa: 7, dstPa0: -1, dstPa7_13: 1 });
    expect(firstScore.play.scoring).toBe(true);
    expect(scoreStatLine({ dstPa0: -1, dstPa7_13: 1 }, PPR).total).toBe(-2);
  });

  it("credits sacks and fumble recoveries (a muffed punt included) to the right defense", () => {
    const bears = defensePlayDeltas(games["401872999"], "3");
    const muff = bears.find((d) => d.play.type === "Muffed Punt Recovery (Opponent)")!;
    expect(muff.stats).toMatchObject({ dstFumRec: 1 });
    const falcons = defensePlayDeltas(games["401872999"], "1");
    expect(falcons.some((d) => d.play.type === "Muffed Punt Recovery (Opponent)" && d.stats.dstFumRec)).toBe(false);
  });

  it("is empty before kickoff, and for a team not in the game", () => {
    const pre = { ...games["401872999"], plays: [], game: { ...games["401872999"].game, state: "pre" } } as GameDetail;
    expect(defenseStatLine(pre, "3")).toEqual({});
    expect(defensePlayDeltas(games["401872999"], "99")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Rules that week 6 didn't exercise, with REAL plays from weeks 1-5 (games not
// saved in samples/), each in a tiny game: the opening kickoff, then the play.
// ---------------------------------------------------------------------------

function playOf(type: string, text: string, roles: [string, string][], extra: Partial<Play> = {}): AttributedPlay {
  const play: Play = {
    id: `${type}-${text.length}`, gameId: "g", sequence: 2, period: 1, clock: "10:00", type, text,
    yards: 0, scoring: false, scoreValue: 0, awayScore: 0, homeScore: 0, isPenalty: false, isTurnover: false,
    participants: roles.map(([role, playerId]) => ({ role, playerId })), ...extra,
  };
  return { ...play, deltas: deltasForPlay(play) };
}

const KICKOFF = playOf("Kickoff", "K.Kicker kicks 65 yards from X 35 to end zone, Touchback.", [], { sequence: 1 });

function tinyGame(
  home: [id: string, score: number],
  away: [id: string, score: number],
  players: Record<string, string>, // player id -> team id
  plays: AttributedPlay[],
  boxStats: Record<string, StatLine> = {}, // official box-score numbers, where a test needs them
): DefenseGame {
  const boxscore: Record<string, PlayerGameLine> = {};
  for (const [playerId, teamId] of Object.entries(players)) {
    boxscore[playerId] = { playerId, name: "", teamId, stats: boxStats[playerId] ?? {} };
  }
  const game = { state: "post", home: { team: { id: home[0] }, score: home[1] }, away: { team: { id: away[0] }, score: away[1] } } as unknown as Game;
  return { game, plays: [KICKOFF, ...plays], boxscore };
}

describe("D/ST rules from real plays", () => {
  it("a pick-six: +INT and +INT TD for the defense; its 6 don't count against the other D/ST (week 1, 401872658)", () => {
    const pick6 = playOf("Interception Return Touchdown", "(Shotgun) C.Rush pass short right intended for Bi.Robinson INTERCEPTED by T.Watt at ATL 35. T.Watt for 35 yards, TOUCHDOWN. C.Boswell extra point is GOOD, Center-C.Kuntz, Holder-C.Johnston.", [
      ["passer", "2972515"], ["passDefender", "3045282"], ["returner", "3045282"], ["scorer", "3045282"], ["kicker", "17372"], ["patScorer", "17372"], ["other", "4430807"],
    ], { teamId: "23", scoring: true, scoreValue: 6 });
    const game = tinyGame(["23", 7], ["1", 0], { "2972515": "1", "17372": "23" }, [pick6], { "2972515": { passInt: 1 } });

    expect(defenseStatLine(game, "23")).toMatchObject({ dstInt: 1, dstIntTd: 1 });
    // Atlanta allowed 7 on the scoreboard, but only the extra point counts: 1 point allowed.
    expect(defenseStatLine(game, "1")).toMatchObject({ dstPa: 1, dstPa1_6: 1 });
  });

  it("a fumble return TD is excluded the same way (week 5, 401872987)", () => {
    const fumbleTd = playOf("Fumble Return Touchdown", "(Shotgun) K.Murray pass short left to M.Price to NO 12 for 7 yards (M.Emerson; P.Werner). FUMBLES (M.Emerson), RECOVERED by NO-J.Sanker at NO 13. J.Sanker for 87 yards, TOUCHDOWN. D.Carlson extra point is No Good, Wide Left, Center-C.Adomitis, Holder-R.Wright.", [
      ["passer", "3917315"], ["receiver", "4430656"], ["kicker", "3051909"], ["forcedBy", "4429568"], ["recoverer", "4683813"], ["patScorer", "3051909"], ["scorer", "4683813"],
    ], { teamId: "18", scoring: true, scoreValue: 6 });
    const game = tinyGame(["18", 6], ["16", 0], { "3917315": "16", "4430656": "16", "3051909": "18" }, [fumbleTd]);

    expect(defenseStatLine(game, "18")).toMatchObject({ dstFumRec: 1, dstFumTd: 1 });
    expect(defenseStatLine(game, "16")).toMatchObject({ dstPa0: 1 });
    expect(defenseStatLine(game, "16").dstPa).toBeUndefined(); // 0
  });

  it("a safety: +2 for the defense, and not counted against the other D/ST (week 2, 401872941)", () => {
    const safety = playOf("Pass Incompletion", "Team Safety", [
      ["passer", "4038941"], ["receiver", "4362477"], ["receiver", "4362477"], ["penalized", "4683487"],
    ], { teamId: "13", scoring: true, scoreValue: 2 });
    const game = tinyGame(["24", 0], ["13", 2], { "4038941": "24" }, [safety]);

    expect(defenseStatLine(game, "13")).toMatchObject({ dstSafety: 1 });
    expect(defenseStatLine(game, "24")).toMatchObject({ dstPa0: 1 });
  });

  it("a punt return TD is a return TD for the returning team and DOES count against the kicking team (week 3, 401872959)", () => {
    const returnTd = playOf("Punt Return Touchdown", "R.Dixon punts 41 yards to MIN 14, Center-E.Deckers. M.Price for 86 yards, TOUCHDOWN.PENALTY on MIN, Unsportsmanlike Conduct, 15 yards, enforced between downs. W.Reichard extra point is GOOD, Center-A.DePaola, Holder-J.Hekker.", [
      ["kicker", "4567104"], ["punter", "2577619"], ["patScorer", "4567104"], ["returner", "4430656"], ["scorer", "4430656"],
    ], { teamId: "16", scoring: true, scoreValue: 6 });
    const game = tinyGame(["27", 0], ["16", 7], { "2577619": "27", "4430656": "16", "4567104": "16" }, [returnTd]);

    expect(defenseStatLine(game, "16")).toMatchObject({ retTd: 1 });
    expect(defenseStatLine(game, "27")).toMatchObject({ dstPa: 7, dstPa7_13: 1 });
  });

  it("a sack nobody is credited with isn't a D/ST sack, but the fumble recovery counts (week 2, 401872933)", () => {
    const sack = playOf("Sack Opp Fumble Recovery", "(Shotgun) J.Strand sacked at ATL 47 for -6 yards. FUMBLES, RECOVERED by CAR-A.Hall at ATL 46.", [
      ["passer", "5344782"], ["fumbler", "5344782"], ["recoverer", "4602967"],
    ], { teamId: "29" });
    const game = tinyGame(["1", 0], ["29", 0], { "5344782": "1" }, [sack]);

    const carolina = defenseStatLine(game, "29");
    expect(carolina.dstSack).toBeUndefined();
    expect(carolina.dstFumRec).toBe(1);
  });
});
