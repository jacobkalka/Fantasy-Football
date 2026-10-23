/**
 * Every threshold player research uses, in one place, with what it means.
 * These are fixed rules of thumb (stated, not tuned to data), so a label or a
 * sentence can always say exactly why it appeared.
 */
import type { Position } from "@/lib/providers/types";
import type { ScoringFormat } from "@/lib/scoring";
import type { WeekThresholds } from "./types";

/**
 * Weekly fantasy-point lines, per position and format.
 * useful ≈ a starter-level week in a 12-team league (about QB12 / RB24 / WR24 / TE12 / K12 / DST12),
 * boom ≈ a top-5 week at the position, bust = a week that sinks a lineup.
 * Receptions matter for RB/WR/TE, so their lines drop in half-PPR and standard.
 */
export const WEEK_THRESHOLDS: Readonly<Record<Position, Readonly<Record<ScoringFormat, WeekThresholds>>>> = {
  QB: { ppr: { bust: 10, useful: 17, boom: 25 }, half: { bust: 10, useful: 17, boom: 25 }, standard: { bust: 10, useful: 17, boom: 25 } },
  RB: { ppr: { bust: 6, useful: 12, boom: 20 }, half: { bust: 5, useful: 10.5, boom: 18 }, standard: { bust: 4.5, useful: 9, boom: 16 } },
  WR: { ppr: { bust: 6, useful: 12, boom: 20 }, half: { bust: 5, useful: 10.5, boom: 18 }, standard: { bust: 4, useful: 8.5, boom: 16 } },
  TE: { ppr: { bust: 4, useful: 9, boom: 15 }, half: { bust: 3.5, useful: 8, boom: 13.5 }, standard: { bust: 3, useful: 6.5, boom: 12 } },
  K: { ppr: { bust: 4, useful: 8, boom: 12 }, half: { bust: 4, useful: 8, boom: 12 }, standard: { bust: 4, useful: 8, boom: 12 } },
  DST: { ppr: { bust: 2, useful: 7, boom: 12 }, half: { bust: 2, useful: 7, boom: 12 }, standard: { bust: 2, useful: 7, boom: 12 } },
};

/** How formats are named in sentences. */
export const FORMAT_LABEL: Readonly<Record<ScoringFormat, string>> = { ppr: "PPR", half: "half-PPR", standard: "standard" };

/** Sample sizes. Below these, numbers are shown but not judged. */
export const SAMPLE = {
  /** Games before a season average means anything ("not enough games yet" below this). */
  minGames: 3,
  /** Games before last-3 trends are reported (with 3 or fewer, last 3 IS the season). */
  minGamesForTrend: 4,
  /** Games before consistency labels (steady, boom-or-bust). */
  minGamesForConsistency: 4,
  /** Games before "beat his projection X of Y" is reported. */
  minProjectedGames: 4,
} as const;

/** Variation (stdDev ÷ average) lines. */
export const VARIATION = { steady: 0.35, volatile: 0.65 } as const;

/** Last 3 vs season: up if 20%+ higher, down if 20%+ lower. */
export const TREND_CHANGE = 0.2;

/** Share of fantasy points from touchdowns: 40%+ is TD-dependent, 15% or less is volume-driven. */
export const TD_SHARE = { dependent: 0.4, volume: 0.15 } as const;

/**
 * Comparing this season's rates with his own career before this season.
 * `career` / `season` are the minimum volume for each side; `hot` / `cold` the
 * ratio that counts as clearly above / below his norm; within ±`near` he's "in line".
 */
export const VS_CAREER = {
  tdPerTarget: { career: 100, season: 20, hot: 1.5, cold: 0.5, near: 0.2 },
  tdPerCarry: { career: 150, season: 40, hot: 1.5, cold: 0.5, near: 0.2 },
  tdPerAttempt: { career: 300, season: 80, hot: 1.5, cold: 0.5, near: 0.2 },
  yardsPerTarget: { career: 100, season: 20, hot: 1.2, cold: 0.8, near: 0.1 },
  yardsPerCarry: { career: 150, season: 40, hot: 1.2, cold: 0.8, near: 0.1 },
  yardsPerAttempt: { career: 300, season: 80, hot: 1.15, cold: 0.85, near: 0.07 },
  fgPct: { career: 30, season: 8, hot: 1.08, cold: 0.9, near: 0.04 },
} as const;

/**
 * Role and tendency labels. Each is earned only by the stated rule; `rule` is
 * shown next to the label so it's never a black box.
 */
export const LABEL_RULES = {
  rookie: { label: "Rookie", rule: "first NFL season" },
  injured: { label: "Injured", rule: "ESPN fantasy status Out, Doubtful, Injured Reserve or Suspended" },
  depthStarter: { label: "Starter", rule: "first at his spot on ESPN's depth chart" },
  depthBackup: { label: "Backup", rule: "second or lower at his spot on ESPN's depth chart" },
  steady: { label: "Steady scorer", rule: `variation under ${VARIATION.steady} over ${SAMPLE.minGamesForConsistency}+ games` },
  boomBust: { label: "Boom-or-bust", rule: `2+ boom and 2+ bust weeks, or variation ${VARIATION.volatile}+, over 5+ games` },
  tdDependent: { label: "Touchdown-dependent", rule: `${TD_SHARE.dependent * 100}%+ of fantasy points from touchdowns (3+ games)` },
  targetEarner: { label: "High-volume target earner", rule: "8+ targets a game (WR) or 7+ (TE/RB)" },
  lowVolume: { label: "Low target volume", rule: "under 4 targets a game (WR/TE, 3+ games)" },
  downfield: { label: "Downfield threat", rule: "average depth of target 13+ yards (15+ targets), or 15+ yards a catch (15+ catches) when depth isn't published" },
  yac: { label: "Yards-after-catch creator", rule: "6+ yards after the catch per reception (15+ catches)" },
  possession: { label: "Possession receiver", rule: "catches 72%+ of targets with depth of target under 9 yards (20+ targets)" },
  routeEfficient: { label: "Efficient per route", rule: "2.2+ yards per route run (20+ targets)" },
  redZoneTarget: { label: "Red-zone target", rule: "0.8+ red-zone catches a game (3+ games)" },
  workhorse: { label: "Workhorse back", rule: "20+ carries and targets a game" },
  leadBack: { label: "Lead back", rule: "14-19.9 carries and targets a game" },
  committee: { label: "Shares the backfield", rule: "8-13.9 carries and targets a game" },
  limitedRole: { label: "Limited role", rule: "under 8 carries and targets a game (3+ games)" },
  receivingBack: { label: "Pass-catching back", rule: "4+ targets a game (RB)" },
  goalLine: { label: "Red-zone runner", rule: "2.5+ red-zone carries a game (RB, 3+ games)" },
  efficientRunner: { label: "Efficient runner", rule: "5.0+ yards a carry (40+ carries)" },
  inefficientRunner: { label: "Inefficient runner", rule: "under 3.5 yards a carry (40+ carries)" },
  dualThreat: { label: "Dual-threat QB", rule: "6+ runs or 30+ rushing yards a game" },
  volumePasser: { label: "High-volume passer", rule: "37+ pass attempts a game" },
  efficientPasser: { label: "Efficient passer", rule: "8.0+ yards per attempt (100+ attempts)" },
  turnoverProne: { label: "Turnover-prone", rule: "interceptions on 3%+ of attempts (100+ attempts)" },
  sackProne: { label: "Takes a lot of sacks", rule: "sacked on 9%+ of dropbacks (100+ dropbacks)" },
  bigLeg: { label: "Big leg", rule: "3+ field goals made from 50+ this season" },
  busyKicker: { label: "High-volume kicker", rule: "2.5+ field-goal attempts a game" },
  accurateKicker: { label: "Accurate kicker", rule: "90%+ on field goals (10+ attempts)" },
  shakyKicker: { label: "Shaky kicker", rule: "under 75% on field goals (10+ attempts)" },
  passRush: { label: "Pass rush", rule: "3+ sacks a game" },
  ballHawks: { label: "Ball hawks", rule: "1.5+ takeaways a game" },
  stingy: { label: "Stingy defense", rule: "17 or fewer points allowed a game (ESPN fantasy points-allowed)" },
  leaky: { label: "Leaky defense", rule: "27+ points allowed a game (ESPN fantasy points-allowed)" },
} as const;

export type LabelId = keyof typeof LABEL_RULES;
