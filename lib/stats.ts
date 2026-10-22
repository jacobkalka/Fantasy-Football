/**
 * The app's own names for the stats that matter in fantasy football.
 *
 * Every data source (ESPN today, maybe a paid provider later) translates its
 * own field names into these keys, so the scoring engine and the UI never
 * have to know where a number came from.
 *
 * Kicker and defense (D/ST) keys get added in a later phase.
 */
export const STAT_KEYS = [
  // Passing
  "passAtt",
  "passCmp",
  "passYds",
  "passTd",
  "passInt",
  "pass2pt",
  // Rushing
  "rushAtt",
  "rushYds",
  "rushTd",
  "rush2pt",
  // Receiving
  "targets",
  "rec",
  "recYds",
  "recTd",
  "rec2pt",
  // Ball security and returns
  "fumLost",
  "retTd",
  "fumRecTd",
] as const;

export type StatKey = (typeof STAT_KEYS)[number];

/** A player's numbers: for one play, one game, or one season. Missing keys mean zero. */
export type StatLine = Partial<Record<StatKey, number>>;

export function isStatKey(value: string): value is StatKey {
  return (STAT_KEYS as readonly string[]).includes(value);
}
