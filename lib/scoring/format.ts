/**
 * Display strings for the play feed, like "+9.4" and "+7.4 yds, +6 TD, +1 reception".
 */
import type { StatKey } from "@/lib/stats";
import { roundPoints, type ScoringPart } from "./score";

// The real minus sign (U+2212). It's as wide as "+", so numbers line up.
const MINUS = "−";

/** "+9.4", "−2.0", or "0.0". Always one decimal. */
export function formatPoints(points: number): string {
  const rounded = roundPoints(points, 1);
  if (rounded === 0) return "0.0"; // also covers tiny values like 0.04 and -0.04
  const sign = rounded > 0 ? "+" : MINUS;
  return sign + Math.abs(rounded).toFixed(1);
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
};

// Singular when the stat is exactly 1 (or -1 for a correction), plural otherwise.
function labelFor(part: ScoringPart): string {
  const label = LABELS[part.key];
  return Math.abs(part.amount) === 1 ? label.one : label.many;
}
