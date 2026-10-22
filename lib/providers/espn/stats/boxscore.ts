/**
 * Reads the official per-player box score out of ESPN's game summary
 * (site.api.espn.com .../summary?event=<id>), in our own stat names.
 *
 * Shape (see samples/summary-*-final.json):
 *   boxscore.players[] = one entry per team: { team: { id }, statistics: [...] }
 *   statistics[]       = one category each: passing, rushing, receiving, fumbles...
 *     keys[]           = what each column means, e.g. "completions/passingAttempts"
 *     athletes[]       = { athlete: { id, displayName }, stats: ["24/34", "312", ...] }
 *
 * Note: ESPN's box score has no two-point conversions; those come from the plays.
 *
 * Kickers: the "kicking" category only has made/attempted counts ("1/2"), but
 * fantasy points depend on each field goal's distance. The same summary also
 * carries the game's play-by-play (drives[].plays[].text, e.g. "C.Santos 50
 * yard field goal is GOOD"), so we read the distances from there and match
 * each kick to the kicker by name. Counts always come from the box score;
 * the distance bands come from that text.
 */
import type { PlayerGameLine } from "@/lib/providers/types";
import type { StatKey } from "@/lib/stats";
import { arr, get, obj, str, type Json } from "../json";
import { afterReplayReversal, fieldGoal, fieldGoalBand, isNoPlay, splitTry } from "./play-text";

/**
 * For each box-score category, which ESPN column becomes which of our stats.
 * The same column name can mean different things in different categories
 * ("interceptions" under passing = thrown; under interceptions = caught by a
 * defender), so the map is per category.
 */
const CATEGORY_KEYS: Readonly<Record<string, Readonly<Record<string, StatKey>>>> = {
  passing: {
    completions: "passCmp",
    passingAttempts: "passAtt",
    passingYards: "passYds",
    passingTouchdowns: "passTd",
    interceptions: "passInt",
  },
  rushing: {
    rushingAttempts: "rushAtt",
    rushingYards: "rushYds",
    rushingTouchdowns: "rushTd",
  },
  receiving: {
    receptions: "rec",
    receivingYards: "recYds",
    receivingTouchdowns: "recTd",
    receivingTargets: "targets",
  },
  fumbles: {
    // Only fumbles LOST cost fantasy points ("fumbles" counts every fumble).
    fumblesLost: "fumLost",
  },
  kickReturns: { kickReturnTouchdowns: "retTd" },
  puntReturns: { puntReturnTouchdowns: "retTd" },
  kicking: {
    fieldGoalsMade: "fgMade",
    fieldGoalAttempts: "fgAtt",
    extraPointsMade: "xpMade",
    extraPointAttempts: "xpAtt",
  },
  // Punters score nothing; they're listed so a play's punter can be matched to a team.
  punting: {},
};

/** "312" -> 312, "--" or "" -> undefined. */
function toNumber(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const n = Number(value.trim());
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Official box-score lines keyed by ESPN athlete id. Only players who appear
 * in at least one of the categories above are included (defense-only players
 * aren't). Missing or odd fields are skipped, never thrown on.
 */
export function parseBoxscore(summary: unknown): Record<string, PlayerGameLine> {
  const lines: Record<string, PlayerGameLine> = {};
  const kickerIds = new Set<string>();

  for (const teamBlock of arr(get(summary as Json, "boxscore", "players"))) {
    const teamId = str(get(teamBlock, "team", "id"));

    for (const category of arr(obj(teamBlock).statistics)) {
      const keyMap = CATEGORY_KEYS[str(obj(category).name)];
      if (!keyMap) continue;
      const columns = arr(obj(category).keys).map((k) => str(k));

      for (const row of arr(obj(category).athletes)) {
        const playerId = str(get(row, "athlete", "id"));
        if (!playerId) continue;
        if (str(obj(category).name) === "kicking") kickerIds.add(playerId);
        const line = (lines[playerId] ??= {
          playerId,
          name: str(get(row, "athlete", "displayName")),
          teamId,
          stats: {},
        });

        const values = arr(obj(row).stats).map((v) => str(v));
        columns.forEach((column, i) => {
          // A column like "completions/passingAttempts" holds "24/34".
          const names = column.split("/");
          const parts = (values[i] ?? "").split("/");
          if (parts.length !== names.length) return;
          names.forEach((name, j) => {
            const key = keyMap[name];
            const value = toNumber(parts[j]);
            if (!key || value === undefined || value === 0) return;
            line.stats[key] = (line.stats[key] ?? 0) + value;
          });
        });
      }
    }
  }
  addKickerDetails(lines, kickerIds, summary);
  return lines;
}

/** Misses from made/attempted, and field goals by distance from the summary's play-by-play. */
function addKickerDetails(lines: Record<string, PlayerGameLine>, kickerIds: Set<string>, summary: unknown) {
  const kickers = [...kickerIds].map((id) => lines[id]);
  for (const { stats } of kickers) {
    const fgMiss = (stats.fgAtt ?? 0) - (stats.fgMade ?? 0);
    const xpMiss = (stats.xpAtt ?? 0) - (stats.xpMade ?? 0);
    if (fgMiss > 0) stats.fgMiss = fgMiss;
    if (xpMiss > 0) stats.xpMiss = xpMiss;
  }
  if (kickers.length === 0) return;

  for (const text of summaryPlayTexts(summary)) {
    const { main } = splitTry(afterReplayReversal(text));
    const kick = isNoPlay(main) ? undefined : fieldGoal(main);
    const kicker = kick && kickerNamed(kick.kicker, kickers);
    if (!kick || !kicker) continue;
    const key: StatKey = `${kick.made ? "fgMade" : "fgMiss"}${fieldGoalBand(kick.distance)}`;
    kicker.stats[key] = (kicker.stats[key] ?? 0) + 1;
  }
}

/** Every play description in the summary's drives (finished and current), each once. */
function summaryPlayTexts(summary: unknown): string[] {
  const drives = obj(get(summary as Json, "drives"));
  const texts = new Map<string, string>();
  for (const drive of [...arr(drives.previous), drives.current]) {
    for (const play of arr(obj(drive).plays)) texts.set(str(get(play, "id")), str(get(play, "text")));
  }
  return [...texts.values()];
}

/** "C.Santos" -> the kicker whose name is Cairo Santos (same first letter and last name). */
function kickerNamed(shortName: string, kickers: PlayerGameLine[]): PlayerGameLine | undefined {
  const match = /^([A-Z][a-z]{0,2})\.(.+)$/.exec(shortName);
  if (!match) return kickers.length === 1 ? kickers[0] : undefined;
  const [, initial, last] = match;
  const found = kickers.filter((k) => {
    const name = k.name.replace(/\s+(Jr\.?|Sr\.?|II|III|IV)$/i, "").toLowerCase();
    return name.endsWith(` ${last.toLowerCase()}`) && name.startsWith(initial.toLowerCase());
  });
  return found.length === 1 ? found[0] : undefined;
}
