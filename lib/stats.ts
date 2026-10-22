/**
 * The app's own names for the stats that matter in fantasy football.
 *
 * Every data source (ESPN today, maybe a paid provider later) translates its
 * own field names into these keys, so the scoring engine and the UI never
 * have to know where a number came from.
 *
 * Kicker and team defense (D/ST) keys mirror ESPN's own fantasy stats (see
 * samples/fantasy-league-defaults-scoring.json), so imported leagues map 1:1.
 *
 * Points-allowed and yards-allowed TIERS are 0/1 switches: exactly one tier is
 * 1 at any moment (e.g. dstPa7_13 while the D/ST has allowed 7 to 13 points).
 * When a touchdown moves a defense from 7-13 to 14-17, that play's change is
 * { dstPa: +7, dstPa7_13: -1, dstPa14_17: +1 }, so the tier swap scores like
 * any other stat and adding every play up still gives the final line.
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
  "retTd", // kick or punt return TD (for a D/ST: any return TD by its team)
  "fumRecTd",

  // Kicking. Distance bands are for the kick's distance ("44 yard field goal").
  "fgMade", // all made field goals (the bands below split these up)
  "fgAtt",
  "fgMiss", // missed or blocked, any distance
  "fgMade0_39",
  "fgMade40_49",
  "fgMade50_59",
  "fgMade60", // 60 yards or longer
  "fgMiss0_39",
  "fgMiss40_49",
  "fgMiss50_59",
  "fgMiss60",
  "xpMade", // extra points (PATs)
  "xpAtt",
  "xpMiss", // missed or blocked

  // Team defense and special teams (D/ST)
  "dstSack",
  "dstInt",
  "dstFumRec", // fumbles recovered (not just forced)
  "dstBlk", // blocked punts, field goals and extra points
  "dstSafety",
  "dstIntTd", // interception returned for a TD
  "dstFumTd", // fumble returned for a TD
  "dstBlkTd", // blocked kick returned for a TD
  "dst2ptRet", // two-point try returned by the defense (2 points)
  "dst1ptSafety", // safety on a try (1 point)
  "dstPa", // points allowed, ESPN's way (see lib/providers/espn/stats/dst.ts)
  "dstPa0",
  "dstPa1_6",
  "dstPa7_13",
  "dstPa14_17",
  "dstPa18_21",
  "dstPa22_27",
  "dstPa28_34",
  "dstPa35_45",
  "dstPa46", // 46 or more
  "dstYa", // yards allowed (the opponent's total net yards)
  "dstYa0_99",
  "dstYa100_199",
  "dstYa200_299",
  "dstYa300_349",
  "dstYa350_399",
  "dstYa400_449",
  "dstYa450_499",
  "dstYa500_549",
  "dstYa550", // 550 or more
] as const;

export type StatKey = (typeof STAT_KEYS)[number];

/** A player's numbers: for one play, one game, or one season. Missing keys mean zero. */
export type StatLine = Partial<Record<StatKey, number>>;

export function isStatKey(value: string): value is StatKey {
  return (STAT_KEYS as readonly string[]).includes(value);
}
