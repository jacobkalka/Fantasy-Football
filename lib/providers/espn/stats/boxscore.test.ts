import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { StatLine } from "@/lib/stats";
import { parseBoxscore } from "./boxscore";
import { fantasyStatsToStatLine } from "./fantasy-ids";

function load(file: string): unknown {
  return JSON.parse(readFileSync(new URL(`../../../../samples/${file}`, import.meta.url), "utf8"));
}

// HOU 34 - JAX 31 and CHI 31 - ATL 23, both final, week 6.
const HOU_JAX = parseBoxscore(load("summary-401872996-final.json"));
const CHI_ATL = parseBoxscore(load("summary-401872999-final.json"));

describe("parseBoxscore", () => {
  it("reads a passer's line, splitting '30/36' into completions and attempts", () => {
    expect(CHI_ATL["4431611"]).toEqual({
      playerId: "4431611",
      name: "Caleb Williams",
      teamId: "3",
      // Passing yards are the player's gross yards (the team total subtracts sacks).
      stats: { passCmp: 30, passAtt: 36, passYds: 305, passTd: 1, rushAtt: 4, rushYds: 3 },
    });
  });

  it("merges categories and reads fumbles lost (a muffed punt counts as one)", () => {
    expect(CHI_ATL["4870612"].stats).toEqual({ rec: 2, recYds: 9, targets: 2, fumLost: 2 });
  });

  it("keeps targets for a player with no catches", () => {
    expect(CHI_ATL["3917914"].stats).toEqual({ targets: 4 });
  });

  it("handles negative yards", () => {
    expect(CHI_ATL["4430807"].stats).toMatchObject({ rec: 2, recYds: -8 });
  });

  it("doesn't count a defender's interception as a thrown one", () => {
    // Travis Hunter caught an interception for JAX (and also played receiver).
    expect(HOU_JAX["4685415"].stats.passInt).toBeUndefined();
    expect(HOU_JAX["4685415"].stats).toMatchObject({ rec: 4, recYds: 59, recTd: 1 });
  });

  it("includes kick and punt returners", () => {
    expect(HOU_JAX["2576336"]).toMatchObject({ name: "Ameer Abdullah", teamId: "30", stats: {} });
  });

  it("matches ESPN's fantasy feed for the same players (which also has 2-pt conversions)", () => {
    const files = ["fantasy-kona-player-info.json", "fantasy-kona-player-info-2pt.json"];
    const boxes = { "401872996": HOU_JAX, "401872999": CHI_ATL } as Record<string, typeof HOU_JAX>;
    let checked = 0;
    for (const file of files) {
      const { players } = load(file) as {
        players: { player: { id: number; stats: { statSourceId: number; scoringPeriodId: number; externalId: string; stats: Record<string, number> }[] } }[];
      };
      for (const { player } of players) {
        const week6 = player.stats.find((s) => s.statSourceId === 0 && s.scoringPeriodId === 6)!;
        const fantasy: StatLine = fantasyStatsToStatLine(week6.stats);
        // The box score has no two-point conversions; everything else should agree.
        delete fantasy.pass2pt;
        delete fantasy.rush2pt;
        delete fantasy.rec2pt;
        expect(boxes[week6.externalId][String(player.id)].stats).toEqual(fantasy);
        checked++;
      }
    }
    expect(checked).toBe(10);
  });

  it("reads kickers: counts from the box score, distances from the summary's play-by-play", () => {
    // Cairo Santos: 1/2 field goals (made from 50, missed from 56), 4/4 extra points.
    expect(CHI_ATL["17427"]).toMatchObject({
      name: "Cairo Santos",
      teamId: "3",
      stats: { fgMade: 1, fgAtt: 2, fgMiss: 1, fgMade50_59: 1, fgMiss50_59: 1, xpMade: 4, xpAtt: 4 },
    });
    // Ka'imi Fairbairn: 25 and 49 yards.
    expect(HOU_JAX["2971573"].stats).toEqual({ fgMade: 2, fgAtt: 2, fgMade0_39: 1, fgMade40_49: 1, xpMade: 4, xpAtt: 4 });
  });

  it("kicker lines match ESPN's fantasy feed for every kicker in both games", () => {
    const { players } = load("fantasy-kona-k-dst-week6.json") as {
      players: { player: { id: number; stats: { externalId: string; stats: Record<string, number> }[] } }[];
    };
    const boxes = { "401872996": HOU_JAX, "401872999": CHI_ATL } as Record<string, typeof HOU_JAX>;
    let checked = 0;
    for (const { player } of players) {
      const game = boxes[player.stats[0].externalId];
      if (!game || player.id < 0) continue;
      expect(game[String(player.id)].stats).toEqual(fantasyStatsToStatLine(player.stats[0].stats));
      checked++;
    }
    expect(checked).toBe(4);
  });

  it("lists punters (no stats) so their plays can be matched to a team", () => {
    expect(CHI_ATL["4686889"]).toMatchObject({ name: "Tory Taylor", teamId: "3", stats: {} });
  });

  it("never throws on missing or odd data", () => {
    expect(parseBoxscore(undefined)).toEqual({});
    expect(parseBoxscore({ boxscore: { players: "nope" } })).toEqual({});
    const odd = parseBoxscore({
      boxscore: {
        players: [
          {
            team: { id: "1" },
            statistics: [
              { name: "passing", keys: ["completions/passingAttempts", "passingYards"], athletes: [{ athlete: { id: "9" }, stats: ["--", "12"] }] },
              { name: "receiving", keys: ["receptions"], athletes: [{ athlete: {}, stats: ["3"] }, null] },
              { name: "mystery", keys: ["x"], athletes: [{ athlete: { id: "8" }, stats: ["1"] }] },
            ],
          },
        ],
      },
    });
    expect(odd).toEqual({ "9": { playerId: "9", name: "", teamId: "1", stats: { passYds: 12 } } });
  });
});
