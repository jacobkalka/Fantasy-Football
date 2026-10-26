/**
 * Display strings for the play feed, like "+9.4" and "+7.4 yds, +6 TD, +1 reception".
 */
import type { StatKey } from "@/lib/stats";
import { roundPoints, type ScoringPart } from "./score";

// The real minus sign (U+2212). It's as wide as "+", so numbers line up.
const MINUS = "−";

/** "+9.40", "−2.00", or "0.00". Always two decimals (DECISIONS.md, "Precision"). */
export function formatPoints(points: number): string {
  const rounded = roundPoints(points, 2);
  if (rounded === 0) return "0.00"; // also covers float noise like 0.001
  const sign = rounded > 0 ? "+" : MINUS;
  return sign + Math.abs(rounded).toFixed(2);
}

/** "+7.4 yds, +6 TD, +1 reception". Keeps the order of `parts` (scoreStatLine already sorts them). */
export function formatBreakdown(parts: readonly ScoringPart[]): string {
  return parts
    .map((part) => `${formatPartPoints(part.points)} ${labelFor(part)}`)
    .join(", ");
}

// "+6", "+7.4", "+2.96", "−2": signed, up to 2 decimals, no trailing zeros.
// We keep 2 decimals (not 1) so passing yards stay honest: 74 yds = +2.96, 1 yd = +0.04.
function formatPartPoints(points: number): string {
  const rounded = roundPoints(points);
  if (rounded === 0) return "0";
  const sign = rounded > 0 ? "+" : MINUS;
  return sign + String(Math.abs(rounded));
}

type Label = { one: string; many: string };

// Same word whether it's 1 or many.
const same = (word: string): Label => ({ one: word, many: word });

// Every stat needs a label; TypeScript will complain here if a new key is added to lib/stats.ts.
const LABELS: Record<StatKey, Label> = {
  passYds: same("yds"),
  rushYds: same("yds"),
  recYds: same("yds"),
  passTd: same("TD"),
  rushTd: same("TD"),
  recTd: same("TD"),
  retTd: same("TD"),
  fumRecTd: same("TD"),
  pass2pt: same("2-pt"),
  rush2pt: same("2-pt"),
  rec2pt: same("2-pt"),
  passInt: same("INT"),
  fumLost: { one: "fumble lost", many: "fumbles lost" },
  rec: { one: "reception", many: "receptions" },
  passAtt: { one: "pass attempt", many: "pass attempts" },
  passCmp: { one: "completion", many: "completions" },
  rushAtt: { one: "carry", many: "carries" },
  targets: { one: "target", many: "targets" },
  // Kicking: "+4 FG 40-49", "+1 PAT", "−1 missed FG"
  fgMade: { one: "FG", many: "FGs" },
  fgAtt: { one: "FG attempt", many: "FG attempts" },
  fgMiss: { one: "missed FG", many: "missed FGs" },
  fgMade0_39: same("FG 0-39"),
  fgMade40_49: same("FG 40-49"),
  fgMade50_59: same("FG 50-59"),
  fgMade60: same("FG 60+"),
  fgMiss0_39: same("missed FG 0-39"),
  fgMiss40_49: same("missed FG 40-49"),
  fgMiss50_59: same("missed FG 50-59"),
  fgMiss60: same("missed FG 60+"),
  xpMade: same("PAT"),
  xpAtt: { one: "PAT attempt", many: "PAT attempts" },
  xpMiss: same("missed PAT"),
  // Defense / special teams: "+1 sack", "+2 INT", "−2 pts allowed 14-17"
  dstSack: { one: "sack", many: "sacks" },
  dstInt: same("INT"),
  dstFumRec: { one: "fumble recovery", many: "fumble recoveries" },
  dstBlk: { one: "blocked kick", many: "blocked kicks" },
  dstSafety: { one: "safety", many: "safeties" },
  dstIntTd: same("INT TD"),
  dstFumTd: same("fumble TD"),
  dstBlkTd: same("blocked kick TD"),
  dst2ptRet: same("2-pt return"),
  dst1ptSafety: same("1-pt safety"),
  dstPa: same("pts allowed"),
  dstPa0: same("pts allowed 0"),
  dstPa1_6: same("pts allowed 1-6"),
  dstPa7_13: same("pts allowed 7-13"),
  dstPa14_17: same("pts allowed 14-17"),
  dstPa18_21: same("pts allowed 18-21"),
  dstPa22_27: same("pts allowed 22-27"),
  dstPa28_34: same("pts allowed 28-34"),
  dstPa35_45: same("pts allowed 35-45"),
  dstPa46: same("pts allowed 46+"),
  dstYa: same("yds allowed"),
  dstYa0_99: same("yds allowed 0-99"),
  dstYa100_199: same("yds allowed 100-199"),
  dstYa200_299: same("yds allowed 200-299"),
  dstYa300_349: same("yds allowed 300-349"),
  dstYa350_399: same("yds allowed 350-399"),
  dstYa400_449: same("yds allowed 400-449"),
  dstYa450_499: same("yds allowed 450-499"),
  dstYa500_549: same("yds allowed 500-549"),
  dstYa550: same("yds allowed 550+"),
};

// Singular when the stat is exactly 1 (or -1 for a correction), plural otherwise.
function labelFor(part: ScoringPart): string {
  const label = LABELS[part.key];
  return Math.abs(part.amount) === 1 ? label.one : label.many;
}
