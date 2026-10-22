/**
 * ESPN's fantasy feed (the "kona" player-info endpoint) reports stats as a
 * map of numeric ids to numbers, e.g. { "3": 306, "4": 4 } means 306 passing
 * yards and 4 passing touchdowns. This file translates those ids into our own
 * stat names (lib/stats.ts).
 *
 * Every id below was checked against real data in samples/: the box score for
 * the same game, and ESPN's own PPR total ("appliedTotal") for each player.
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
