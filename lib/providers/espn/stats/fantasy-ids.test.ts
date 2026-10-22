import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { rulesForFormat, scoreStatLine } from "@/lib/scoring";
import { isStatKey } from "@/lib/stats";
import { ESPN_STAT_IDS, fantasyStatsToStatLine } from "./fantasy-ids";

// Real ESPN fantasy ("kona") responses saved in samples/.
const FIXTURES = ["fantasy-kona-player-info.json", "fantasy-kona-player-info-2pt.json"];

type KonaStats = {
  statSourceId: number; // 0 = actual, 1 = projected
  statSplitTypeId: number; // 1 = one game, 0 = season
  scoringPeriodId: number; // week
  externalId: string;
  appliedTotal: number; // ESPN's own PPR points for this line
  stats: Record<string, number>;
};
type KonaPlayer = { player: { id: number; fullName: string; stats: KonaStats[] } };

function loadPlayers(file: string): KonaPlayer[] {
  const url = new URL(`../../../../samples/${file}`, import.meta.url);
  return (JSON.parse(readFileSync(url, "utf8")) as { players: KonaPlayer[] }).players;
}

const PPR = rulesForFormat("ppr");

describe("fantasyStatsToStatLine against ESPN's own PPR totals", () => {
  for (const file of FIXTURES) {
    for (const { player } of loadPlayers(file)) {
      const week6 = player.stats.find(
        (s) => s.statSourceId === 0 && s.statSplitTypeId === 1 && s.scoringPeriodId === 6,
      );

      it(`${player.fullName}: week 6 points match ESPN (${file})`, () => {
        expect(week6).toBeDefined();
        const line = fantasyStatsToStatLine(week6!.stats);
        expect(scoreStatLine(line, PPR).total).toBeCloseTo(week6!.appliedTotal, 2);
      });

      // Every other actual single game in the files too (week 5, last season's week 18...).
      for (const game of player.stats.filter(
        (s) => s.statSourceId === 0 && s.statSplitTypeId === 1 && s.scoringPeriodId !== 6,
      )) {
        it(`${player.fullName}: week ${game.scoringPeriodId} (game ${game.externalId}) matches too`, () => {
          const line = fantasyStatsToStatLine(game.stats);
          expect(scoreStatLine(line, PPR).total).toBeCloseTo(game.appliedTotal, 2);
        });
      }
    }
  }

  it("reads two-point conversions and fumbles lost (Penix and Branch, week 6)", () => {
    const players = loadPlayers("fantasy-kona-player-info-2pt.json");
    const week6 = (name: string) =>
      players
        .find((p) => p.player.fullName === name)!
        .player.stats.find((s) => s.statSourceId === 0 && s.scoringPeriodId === 6)!.stats;

    expect(fantasyStatsToStatLine(week6("Michael Penix Jr."))).toMatchObject({
      passYds: 225,
      passTd: 3,
      pass2pt: 2,
      fumLost: 1,
    });
    // Branch: 2 catches, a 2-pt catch, and 2 fumbles lost (one was a muffed punt).
    expect(fantasyStatsToStatLine(week6("Zachariah Branch"))).toEqual({
      targets: 2,
      rec: 2,
      recYds: 9,
      rec2pt: 1,
      fumLost: 2,
    });
  });
});

describe("kickers and D/STs against ESPN's own week-6 PPR totals", () => {
  // Every kicker and D/ST that played in week 6 (samples/fantasy-kona-k-dst-week6.json).
  const players = loadPlayers("fantasy-kona-k-dst-week6.json");

  it("has all 28 D/STs and 28 kickers", () => {
    expect(players.filter((p) => p.player.id < 0)).toHaveLength(28);
    expect(players.filter((p) => p.player.id > 0)).toHaveLength(28);
  });

  for (const { player } of players) {
    it(`${player.fullName} scores ESPN's ${player.stats[0].appliedTotal}`, () => {
      const line = fantasyStatsToStatLine(player.stats[0].stats);
      expect(scoreStatLine(line, PPR).total).toBeCloseTo(player.stats[0].appliedTotal, 2);
    });
  }

  it("reads tiers as 0/1 switches and keeps the raw totals", () => {
    const chiefs = players.find((p) => p.player.id === -16012)!.player.stats[0].stats;
    expect(fantasyStatsToStatLine(chiefs)).toMatchObject({
      dstPa: 6,
      dstPa1_6: 1,
      dstYa: 259,
      dstYa200_299: 1,
      dstSack: 4,
      dstInt: 1,
      dstFumRec: 1,
    });
  });
});

describe("our presets match ESPN's default league settings", () => {
  // samples/fantasy-league-defaults-scoring.json: ESPN's "FFL PPR Scoring" defaults.
  type Item = { statId: number; points: number; pointsOverrides: Record<string, number> };
  const url = new URL("../../../../samples/fantasy-league-defaults-scoring.json", import.meta.url);
  const items = (JSON.parse(readFileSync(url, "utf8")) as { settings: { scoringSettings: { scoringItems: Item[] } } })
    .settings.scoringSettings.scoringItems;

  it("knows every stat ESPN scores", () => {
    expect(items.length).toBe(46);
    const unknown = items.filter((item) => !ESPN_STAT_IDS[String(item.statId)]);
    expect(unknown).toEqual([]);
  });

  for (const item of items) {
    const key = ESPN_STAT_IDS[String(item.statId)];
    // "16" is ESPN's D/ST lineup slot; D/ST stats only score through that override.
    const espnPoints = item.pointsOverrides["16"] ?? item.points;
    it(`ESPN stat ${item.statId} (${key}) is worth ${espnPoints}`, () => {
      expect(PPR[key] ?? 0).toBe(espnPoints);
    });
  }

  it("scores every other stat 0, like ESPN", () => {
    const scored = new Set(items.map((item) => String(item.statId)));
    const scoredKeys = new Set([...scored].map((id) => ESPN_STAT_IDS[id]));
    for (const key of Object.values(ESPN_STAT_IDS)) {
      if (!scoredKeys.has(key)) expect(PPR[key] ?? 0, key).toBe(0);
    }
  });
});

describe("fantasyStatsToStatLine details", () => {
  it("ignores ids we don't use, like 68 (every fumble, not just lost ones)", () => {
    expect(fantasyStatsToStatLine({ "68": 2, "72": 1, "999": 5 })).toEqual({ fumLost: 1 });
  });

  it("adds kick return TDs (101) and punt return TDs (102) into retTd", () => {
    expect(fantasyStatsToStatLine({ "101": 1, "102": 1 })).toEqual({ retTd: 2 });
  });

  it("leaves out zeros and non-numbers", () => {
    const messy = { "3": 0, "4": Number.NaN, "24": "12" } as unknown as Record<string, number>;
    expect(fantasyStatsToStatLine(messy)).toEqual({});
  });

  it("maps every id to one of our stat keys", () => {
    expect(Object.values(ESPN_STAT_IDS).every(isStatKey)).toBe(true);
  });
});
