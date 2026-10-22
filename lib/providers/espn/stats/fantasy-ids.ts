/**
 * ESPN's fantasy feed (the "kona" player-info endpoint) reports stats as a
 * map of numeric ids to numbers, e.g. { "3": 306, "4": 4 } means 306 passing
 * yards and 4 passing touchdowns. This file translates those ids into our own
 * stat names (lib/stats.ts).
 *
 * Every id below was checked against real data in samples/: the box score for
 * the same game, and ESPN's own PPR total ("appliedTotal") for each player,
 * kicker and D/ST. The same ids are used for projections.
 */
import type { StatKey, StatLine } from "@/lib/stats";

/** ESPN fantasy stat id -> our stat name. Ids not listed here are ignored. */
export const ESPN_STAT_IDS: Readonly<Record<string, StatKey>> = Object.freeze({
  "0": "passAtt",
  "1": "passCmp",
  "3": "passYds",
  "4": "passTd",
  "19": "pass2pt",
  "20": "passInt",
  "23": "rushAtt",
  "24": "rushYds",
  "25": "rushTd",
  "26": "rush2pt",
  "42": "recYds",
  "43": "recTd",
  "44": "rec2pt",
  "53": "rec",
  "58": "targets",
  // 72 is fumbles LOST. (68 is every fumble, even ones the team got back,
  // which ESPN doesn't take points off for, so we don't use it.)
  "72": "fumLost",
  // Kick return TD and punt return TD both count as a "return TD" for us.
  "101": "retTd",
  "102": "retTd",
  // Fumble recovered for a TD (e.g. a lineman falls on a teammate's fumble in
  // the end zone). Lower confidence: no sample has one yet, so this id comes
  // from ESPN's published stat list rather than from checking real data.
  "63": "fumRecTd",

  // Kickers (checked against every kicker's week-6 points: samples/fantasy-kona-k-dst-week6.json).
  // 74/75/76 ("50+ yards") are skipped on purpose: they repeat 198 + 201 (50-59 and 60+).
  "83": "fgMade",
  "84": "fgAtt",
  "85": "fgMiss",
  "80": "fgMade0_39",
  "77": "fgMade40_49",
  "198": "fgMade50_59",
  "201": "fgMade60",
  "82": "fgMiss0_39",
  "79": "fgMiss40_49",
  "200": "fgMiss50_59",
  "203": "fgMiss60",
  "86": "xpMade",
  "87": "xpAtt",
  "88": "xpMiss",

  // Team defense / special teams (checked against every D/ST's week-6 points).
  // 94 and 105 (total defensive TDs) are skipped: they repeat 93 + 103 + 104.
  "99": "dstSack",
  "95": "dstInt",
  "96": "dstFumRec",
  "97": "dstBlk",
  "98": "dstSafety",
  "103": "dstIntTd",
  "104": "dstFumTd",
  "93": "dstBlkTd",
  // 206 and 209 never happened in our samples; ESPN's help page and the
  // default points (2 and 1) match a 2-pt return and a 1-pt safety.
  "206": "dst2ptRet",
  "209": "dst1ptSafety",
  "120": "dstPa",
  "89": "dstPa0",
  "90": "dstPa1_6",
  "91": "dstPa7_13",
  "92": "dstPa14_17",
  "121": "dstPa18_21",
  "122": "dstPa22_27",
  "123": "dstPa28_34",
  "124": "dstPa35_45",
  "125": "dstPa46",
  "127": "dstYa",
  "128": "dstYa0_99",
  "129": "dstYa100_199",
  "130": "dstYa200_299",
  "131": "dstYa300_349",
  "132": "dstYa350_399",
  "133": "dstYa400_449",
  "134": "dstYa450_499",
  "135": "dstYa500_549",
  "136": "dstYa550",
});

/**
 * Converts one ESPN fantasy stats map ({ "3": 306, ... }) into a StatLine.
 * Unknown ids and non-numbers are skipped; stats that add up to 0 are left out
 * (a missing stat means zero).
 */
export function fantasyStatsToStatLine(stats: Record<string, number>): StatLine {
  const line: StatLine = {};
  for (const [id, value] of Object.entries(stats ?? {})) {
    const key = ESPN_STAT_IDS[id];
    if (!key || typeof value !== "number" || !Number.isFinite(value)) continue;
    line[key] = (line[key] ?? 0) + value; // add, because two ids can share one key
  }
  for (const key of Object.keys(line) as StatKey[]) {
    if (line[key] === 0) delete line[key];
  }
  return line;
}
