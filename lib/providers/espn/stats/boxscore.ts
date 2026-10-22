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
 */
import type { PlayerGameLine } from "@/lib/providers/types";
import type { StatKey } from "@/lib/stats";
import { arr, get, obj, str, type Json } from "../json";

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

  for (const teamBlock of arr(get(summary as Json, "boxscore", "players"))) {
    const teamId = str(get(teamBlock, "team", "id"));

    for (const category of arr(obj(teamBlock).statistics)) {
      const keyMap = CATEGORY_KEYS[str(obj(category).name)];
      if (!keyMap) continue;
      const columns = arr(obj(category).keys).map((k) => str(k));

      for (const row of arr(obj(category).athletes)) {
        const playerId = str(get(row, "athlete", "id"));
        if (!playerId) continue;
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
  return lines;
}
