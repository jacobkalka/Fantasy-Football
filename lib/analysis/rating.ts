/**
 * Team rating (0-100) with a grade for every part of the team and a plain-English "why".
 *
 * Methodology (also returned as RATING_METHOD so the app can show it):
 *
 * OVERALL = 85% STARTING LINEUP + 15% DEPTH.
 *
 * STARTING LINEUP: take your best rest-of-season lineup (ESPN's rest-of-season projection per
 * remaining team game, so expected missed games already count) and add up each starter's points
 * per game above replacement level for his slot ("PAR"). Then place that on a scale built from
 * the whole league: 0 = a lineup of replacement-level players, 50 = an average team in a league
 * your size (each slot filled with the average of that tier: QB1-QB12, RB1-RB12 and RB13-RB24…),
 * 100 = the best player at every slot. Straight lines in between.
 *
 * DEPTH: for each QB/RB/WR/TE starter, what you'd lose if he missed a game, after your bench (or a
 * waiver pickup) fills in. Depth = the share of those points your bench saves compared with only
 * having waiver pickups. 0 = bench no better than waivers, 50 = an average team's bench
 * (backups from the ranks right after the starters, as many as teams usually roster),
 * 100 = backups as good as your starters. Kickers and D/STs are streamed, so they don't count.
 *
 * Shown but NOT in the overall number: position grades (same anchors for one spot), BENCH (how far
 * your bench players are above waiver level), UPSIDE and CONSISTENCY (week-to-week results, 3+
 * games, percentiles among starters at the same position), AVAILABILITY (share of your best
 * healthy lineup's games ESPN expects them to play). Injuries already lower the overall through
 * ESPN's rest-of-season projection, so counting them again would double-count.
 */
import type { Position } from "@/lib/providers/types";
import { fillSlots, optimalLineup, type Lineup, type LineupSpot } from "./lineup";
import {
  availabilityShare,
  ceiling,
  fmt,
  MIN_GAMES,
  projectedRate,
  seasonPerGame,
  signed,
  volatility,
  xppg,
} from "./metrics";
import { leagueModel, type LeagueModel } from "./model";
import { resolveRoster, type MissingPlayer, type RosterInput } from "./roster";
import { anchored, gradeLabel, round1, type GradeLabel } from "./scale";
import {
  POSITIONS,
  positionWord,
  slotLabel,
  slotList,
  SLOT_ORDER,
  type LeagueSettings,
  type StartingSlot,
} from "./settings";
import type { AnalysisPlayer, Universe } from "./universe";

export const RATING_WEIGHTS = { STARTERS: 0.85, DEPTH: 0.15 } as const;

export const RATING_METHOD: readonly string[] = [
  "Overall (0-100) = 85% starting lineup + 15% depth.",
  "Starting lineup: your best rest-of-season lineup's expected points per game above replacement level (the players ranked just past the league's starters at each position). 0 = a lineup of replacement-level players, 50 = an average team in a league your size, 100 = the best player at every spot.",
  "Depth: when a QB, RB, WR or TE starter misses a game, the share of his points (over a waiver pickup) your bench gets back. 0 = bench no better than waivers, 50 = an average team's bench, 100 = backups as good as your starters. Kickers and defenses are streamed, so they don't count.",
  "Position grades (QB to D/ST and FLEX) use the same 0 / 50 / 100 anchors for that spot.",
  "Bench, Upside, Consistency and Availability are shown for context and don't change the overall number. ESPN's rest-of-season projection already counts the games a player is expected to miss.",
  "Upside = the average of each starter's two best games. Consistency = how little his weekly points swing. Both are percentiles among starters at his position (50 = typical) and need 3+ games.",
  "Projections are ESPN's rest-of-season projections, scored in your league's format by this app.",
];

export type GradeKey = StartingSlot | "BENCH" | "DEPTH" | "UPSIDE" | "CONSISTENCY" | "AVAILABILITY";
export const GRADE_KEYS: readonly GradeKey[] = [
  ...SLOT_ORDER,
  "BENCH",
  "DEPTH",
  "UPSIDE",
  "CONSISTENCY",
  "AVAILABILITY",
];

export interface Grade {
  key: GradeKey;
  title: string;
  /** 0-100 (50 = an average team in your league); null when it can't be measured yet. */
  score: number | null;
  label: GradeLabel | null;
  why: string;
  /** True for the parts that make up the overall number. */
  inOverall: boolean;
}

/** What one starter missing a game would cost, after the bench (or a waiver pickup) fills in. */
export interface StarterLoss {
  player: AnalysisPlayer;
  slot: StartingSlot;
  /** His points per game over a waiver pickup at his slot. */
  stake: number;
  /** Points per game the lineup actually loses without him. */
  loss: number;
  /** Who'd take his place (null = a waiver pickup). */
  cover: AnalysisPlayer | null;
}

/** The numbers behind a rating, cheap enough to compute thousands of times in a trade search. */
export interface TeamCore {
  players: AnalysisPlayer[];
  /** Best rest-of-season lineup, in slot order. */
  lineup: LineupSpot[];
  /** Points over replacement per game for each lineup spot (same order). */
  slotPar: number[];
  groupPar: Record<StartingSlot, number>;
  startersPar: number;
  pointsPerGame: number;
  bench: AnalysisPlayer[];
  /** Bench players' points per game over waiver level at their position (0 if below). */
  benchOver: { player: AnalysisPlayer; over: number }[];
  benchValue: number;
  /** Null when no starter has anything to protect. */
  coverage: number | null;
  losses: StarterLoss[];
  startersScore: number;
  depthScore: number | null;
  overall: number;
}

export interface TeamRating {
  /** 0-100, one decimal. 50 = an average team in a league your size. */
  overall: number;
  label: GradeLabel;
  /** The two parts the overall is built from (0-100 each) and their weights. */
  parts: { starters: number; depth: number | null; weights: typeof RATING_WEIGHTS };
  grades: Record<GradeKey, Grade>;
  restOfSeason: {
    lineup: Lineup;
    /** Expected points per game from your best lineup, rest of season. */
    pointsPerGame: number;
    /** Same, above replacement level. */
    overReplacement: number;
  };
  thisWeek: { week: number; lineup: Lineup; points: number };
  /** Roster players we couldn't analyze, and why. */
  missing: MissingPlayer[];
  notes: string[];
  method: readonly string[];
}

const DEPTH_SLOTS: readonly StartingSlot[] = ["QB", "RB", "WR", "TE", "FLEX"];

// ---------------------------------------------------------------------------------------------
// Core numbers
// ---------------------------------------------------------------------------------------------

function replacementFor(model: LeagueModel, slot: StartingSlot): number {
  return slot === "FLEX" ? model.replacement.FLEX : model.replacement[slot];
}

function waiverFloor(model: LeagueModel, slot: StartingSlot): number {
  if (slot === "FLEX") return Math.max(model.waiver.RB, model.waiver.WR, model.waiver.TE);
  return model.waiver[slot];
}

const emptyGroups = (): Record<StartingSlot, number> => ({ QB: 0, RB: 0, WR: 0, TE: 0, FLEX: 0, K: 0, DST: 0 });

export function teamCore(players: readonly AnalysisPlayer[], model: LeagueModel): TeamCore {
  const slots = slotList(model.settings);
  const lineup = fillSlots(players, slots, xppg);
  const slotPar = lineup.map((spot) => spot.points - replacementFor(model, spot.slot));
  const groupPar = emptyGroups();
  lineup.forEach((spot, i) => (groupPar[spot.slot] += slotPar[i]));
  const startersPar = slotPar.reduce((s, v) => s + v, 0);
  const pointsPerGame = lineup.reduce((s, spot) => s + spot.points, 0);

  const starting = new Set(lineup.map((s) => s.player?.id).filter(Boolean));
  const bench = players.filter((p) => !starting.has(p.id));
  const benchOver = bench
    .map((player) => ({ player, over: Math.max(0, xppg(player) - model.waiver[player.position]) }))
    .sort((a, b) => b.over - a.over);
  const benchValue = benchOver.reduce((s, b) => s + b.over, 0);

  // Depth: knock out each QB/RB/WR/TE starter in turn and refill with floors at waiver level.
  const floor = (slot: StartingSlot) => waiverFloor(model, slot);
  const floored = fillSlots(players, slots, xppg, floor);
  const flooredTotal = floored.reduce((s, spot) => s + spot.points, 0);
  const losses: StarterLoss[] = [];
  lineup.forEach((spot) => {
    if (!spot.player || !DEPTH_SLOTS.includes(spot.slot)) return;
    const stake = spot.points - floor(spot.slot);
    if (stake <= 0) return;
    const without = players.filter((p) => p.id !== spot.player!.id);
    const refilled = fillSlots(without, slots, xppg, floor);
    const loss = Math.max(0, flooredTotal - refilled.reduce((s, x) => s + x.points, 0));
    const before = new Set(floored.map((s) => s.player?.id));
    const cover = refilled.find((s) => s.player && !before.has(s.player.id))?.player ?? null;
    losses.push({ player: spot.player, slot: spot.slot, stake, loss: Math.min(loss, stake), cover });
  });
  const totalStake = losses.reduce((s, l) => s + l.stake, 0);
  const coverage = totalStake > 0 ? 1 - losses.reduce((s, l) => s + l.loss, 0) / totalStake : null;

  const a = anchorsFor(model);
  const startersScore = anchored(startersPar, 0, a.starters.avg, a.starters.best);
  const depthScore = coverage === null ? null : anchored(coverage, 0, a.coverage, 1);
  const overall =
    depthScore === null
      ? startersScore
      : RATING_WEIGHTS.STARTERS * startersScore + RATING_WEIGHTS.DEPTH * depthScore;

  return {
    players: [...players],
    lineup,
    slotPar,
    groupPar,
    startersPar,
    pointsPerGame,
    bench,
    benchOver,
    benchValue,
    coverage,
    losses,
    startersScore,
    depthScore,
    overall,
  };
}

// ---------------------------------------------------------------------------------------------
// League anchors: an average team and the best possible team for this league size
// ---------------------------------------------------------------------------------------------

export interface Anchors {
  starters: { avg: number; best: number };
  group: Record<StartingSlot, { avg: number; best: number }>;
  coverage: number;
  bench: { avg: number; best: number };
  /** Starter-caliber players at each position: ceilings and swings, sorted ascending. */
  ceilings: Record<Position, number[]>;
  swings: Record<Position, number[]>;
  /** Share of games ESPN expects a typical league starter to play. */
  availability: number;
}

const anchorCache = new WeakMap<LeagueModel, Anchors>();

function synthetic(id: string, position: Position, value: number): AnalysisPlayer {
  return {
    id,
    name: id,
    position,
    teamId: null,
    headshot: null,
    injuryStatus: "ACTIVE",
    byeWeek: null,
    percentOwned: null,
    percentOwnedChange: null,
    percentStarted: null,
    weekProjection: null,
    games: [],
    seasonPoints: 0,
    ros: { points: value, games: 1, teamGames: 1 },
    rosNote: null,
  };
}

const avgOf = (list: readonly AnalysisPlayer[]) =>
  list.length ? list.reduce((s, p) => s + xppg(p), 0) / list.length : 0;

/** Raw numbers for anchors (no anchors needed, so no recursion). */
function rawParts(players: AnalysisPlayer[], model: LeagueModel) {
  const slots = slotList(model.settings);
  const lineup = fillSlots(players, slots, xppg);
  const groupPar = emptyGroups();
  let startersPar = 0;
  for (const spot of lineup) {
    const par = spot.points - replacementFor(model, spot.slot);
    groupPar[spot.slot] += par;
    startersPar += par;
  }
  const starting = new Set(lineup.map((s) => s.player?.id));
  const bench = players.filter((p) => !starting.has(p.id));
  const benchValue = bench.reduce((s, p) => s + Math.max(0, xppg(p) - model.waiver[p.position]), 0);
  const floor = (slot: StartingSlot) => waiverFloor(model, slot);
  const flooredTotal = fillSlots(players, slots, xppg, floor).reduce((s, x) => s + x.points, 0);
  let stake = 0;
  let loss = 0;
  for (const spot of lineup) {
    if (!spot.player || !DEPTH_SLOTS.includes(spot.slot)) continue;
    const st = spot.points - floor(spot.slot);
    if (st <= 0) continue;
    const without = players.filter((p) => p.id !== spot.player!.id);
    const refilled = fillSlots(without, slots, xppg, floor).reduce((s, x) => s + x.points, 0);
    stake += st;
    loss += Math.min(st, Math.max(0, flooredTotal - refilled));
  }
  return { groupPar, startersPar, benchValue, coverage: stake > 0 ? 1 - loss / stake : 0 };
}

export function anchorsFor(model: LeagueModel): Anchors {
  const cached = anchorCache.get(model);
  if (cached) return cached;
  const { settings, ranked, startersAt } = model;
  const N = settings.teams;

  // The average team: each starting tier's average player, then backups from the ranks
  // right after the league's starters, as many per position as teams usually roster.
  const average: AnalysisPlayer[] = [];
  for (const pos of POSITIONS) {
    for (let j = 0; j < settings.slots[pos]; j++) {
      average.push(synthetic(`avg-${pos}-${j}`, pos, avgOf(ranked[pos].slice(j * N, (j + 1) * N))));
    }
  }
  const flexPool = (["RB", "WR", "TE"] as const)
    .flatMap((pos) => ranked[pos].slice(N * settings.slots[pos], startersAt[pos]))
    .sort((a, b) => xppg(b) - xppg(a));
  for (let f = 0; f < settings.slots.FLEX; f++) {
    const tier = flexPool.slice(f * N, (f + 1) * N);
    const counts = new Map<Position, number>();
    for (const p of tier) counts.set(p.position, (counts.get(p.position) ?? 0) + 1);
    const pos = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "WR";
    average.push(synthetic(`avg-FLEX-${f}`, pos, avgOf(tier)));
  }
  const backups: AnalysisPlayer[] = [];
  for (const pos of POSITIONS) {
    const count = Math.min(3, Math.max(0, Math.round((model.rosteredAt[pos] - startersAt[pos]) / N)));
    for (let j = 0; j < count; j++) {
      const tier = ranked[pos].slice(startersAt[pos] + j * N, startersAt[pos] + (j + 1) * N);
      if (tier.length) backups.push(synthetic(`avg-bench-${pos}-${j}`, pos, avgOf(tier)));
    }
  }
  backups.sort((a, b) => xppg(b) - xppg(a));
  average.push(...backups.slice(0, settings.bench));

  // The best possible team: the top players at every slot.
  const best: AnalysisPlayer[] = POSITIONS.flatMap((pos) => ranked[pos].slice(0, settings.slots[pos] + 1));
  const avg = rawParts(average, model);
  const top = rawParts(best, model);

  // Best plausible bench: the most valuable players who aren't league starters.
  const benchBest = POSITIONS.flatMap((pos) => ranked[pos].slice(startersAt[pos]))
    .map((p) => Math.max(0, xppg(p) - model.waiver[p.position]))
    .sort((a, b) => b - a)
    .slice(0, settings.bench)
    .reduce((s, v) => s + v, 0);

  const ceilings = {} as Record<Position, number[]>;
  const swings = {} as Record<Position, number[]>;
  let shareSum = 0;
  let shareWeight = 0;
  for (const pos of POSITIONS) {
    const starters = ranked[pos].slice(0, Math.max(1, startersAt[pos]));
    ceilings[pos] = starters.map(ceiling).filter((v): v is number => v !== null).sort((a, b) => a - b);
    swings[pos] = starters.map(volatility).filter((v): v is number => v !== null).sort((a, b) => a - b);
    const healthy = [...model.universe.players.filter((p) => p.position === pos && p.ros)]
      .sort((a, b) => (healthyRate(b) ?? 0) - (healthyRate(a) ?? 0))
      .slice(0, Math.max(1, startersAt[pos]));
    for (const p of healthy) {
      const rate = healthyRate(p) ?? 0;
      shareSum += rate * (availabilityShare(p) ?? 1);
      shareWeight += rate;
    }
  }

  const group = {} as Record<StartingSlot, { avg: number; best: number }>;
  for (const slot of SLOT_ORDER) group[slot] = { avg: avg.groupPar[slot], best: top.groupPar[slot] };
  const anchors: Anchors = {
    starters: { avg: avg.startersPar, best: top.startersPar },
    group,
    coverage: avg.coverage,
    bench: { avg: avg.benchValue, best: Math.max(benchBest, avg.benchValue) },
    ceilings,
    swings,
    availability: shareWeight > 0 ? shareSum / shareWeight : 1,
  };
  anchorCache.set(model, anchors);
  return anchors;
}

/** Points per game when he plays: ESPN's rate, or (if ESPN projects no more games) what he scored. */
function healthyRate(p: AnalysisPlayer): number | null {
  return projectedRate(p) ?? (p.ros && p.ros.games === 0 ? seasonPerGame(p) : null);
}

// ---------------------------------------------------------------------------------------------
// Grades and words
// ---------------------------------------------------------------------------------------------

/** "A, B and C" */
export function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function percentile(value: number, sortedAsc: readonly number[], higherIsBetter: boolean): number | null {
  if (sortedAsc.length === 0) return null;
  let below = 0;
  let equal = 0;
  for (const v of sortedAsc) {
    if (v < value) below++;
    else if (v === value) equal++;
  }
  const share = (below + equal / 2) / sortedAsc.length;
  return 100 * (higherIsBetter ? share : 1 - share);
}

function grade(key: GradeKey, title: string, score: number | null, why: string, inOverall = false): Grade {
  return {
    key,
    title,
    score: score === null ? null : round1(score),
    label: score === null ? null : gradeLabel(score),
    why,
    inOverall,
  };
}

const STATUS_WORDS: Partial<Record<AnalysisPlayer["injuryStatus"], string>> = {
  QUESTIONABLE: "questionable",
  DOUBTFUL: "doubtful",
  OUT: "out",
  INJURY_RESERVE: "on injured reserve",
  SUSPENSION: "suspended",
  DAY_TO_DAY: "day-to-day",
};

export function statusWord(p: AnalysisPlayer): string | null {
  return STATUS_WORDS[p.injuryStatus] ?? null;
}

function groupGrade(slot: StartingSlot, core: TeamCore, model: LeagueModel, anchors: Anchors): Grade {
  const spots = core.lineup.filter((s) => s.slot === slot);
  const title = slot === "FLEX" ? "FLEX" : slotLabel(slot);
  if (spots.length === 0) return grade(slot, title, null, `Your league doesn't start a ${slotLabel(slot)}.`);
  const par = core.groupPar[slot];
  const { avg, best } = anchors.group[slot];
  const score = anchored(par, 0, avg, best);
  const empty = spots.filter((s) => !s.player).length;
  const who = spots
    .filter((s) => s.player)
    .map((s) => `${s.player!.name} ${fmt(s.points)}${slot === "FLEX" ? ` (${s.player!.position})` : ""}`);
  const word = slot === "FLEX" ? "FLEX" : positionWord(slot, spots.length > 1);
  let why: string;
  if (who.length === 0) {
    why = `You have no ${positionWord(slot)} to start, so this spot scores 0. Even a waiver pickup would help.`;
  } else {
    why =
      `${listNames(who)} pts/game: ${signed(par)} over replacement-level ${word}` +
      ` (an average team in a ${model.settings.teams}-team league: ${signed(avg)}; the best possible: ${signed(best)}).`;
    if (empty) why += ` ${empty === 1 ? "One spot is" : `${empty} spots are`} empty.`;
  }
  return grade(slot, title, score, why);
}

function benchGrade(core: TeamCore, anchors: Anchors): Grade {
  if (core.bench.length === 0) return grade("BENCH", "Bench", 0, "You have no bench players.");
  const score = anchored(core.benchValue, 0, anchors.bench.avg, anchors.bench.best);
  const useful = core.benchOver.filter((b) => b.over >= 0.05).slice(0, 3);
  const best = useful.length
    ? ` Most useful: ${listNames(useful.map((b) => `${b.player.name} (${signed(b.over)})`))}.`
    : " None of them projects better than what's likely on waivers.";
  return grade(
    "BENCH",
    "Bench",
    score,
    `Your bench adds ${fmt(core.benchValue)} pts/game above waiver-level players (average team: ${fmt(anchors.bench.avg)}).${best}`,
  );
}

function depthGrade(core: TeamCore, anchors: Anchors): Grade {
  if (core.coverage === null || core.depthScore === null) {
    return grade("DEPTH", "Depth", null, "No starter projects better than a waiver pickup, so there's nothing to back up.", true);
  }
  const worst = [...core.losses].sort((a, b) => b.loss - a.loss)[0];
  const coverWord = worst.cover ? `${worst.cover.name} would step in` : "you'd need a waiver pickup";
  return grade(
    "DEPTH",
    "Depth",
    core.depthScore,
    `When a starter misses a game, your bench saves ${Math.round(core.coverage * 100)}% of the points a waiver pickup would lose (average team: ${Math.round(anchors.coverage * 100)}%).` +
      ` Biggest risk: if ${worst.player.name} is out you lose ${fmt(worst.loss)} pts/game (${coverWord}).`,
    true,
  );
}

function weekToWeekGrades(core: TeamCore, model: LeagueModel, anchors: Anchors): [Grade, Grade] {
  const starters = core.lineup.map((s) => s.player).filter((p): p is AnalysisPlayer => p !== null);
  const needed = Math.ceil(core.lineup.length / 2);
  const rows = starters
    .map((p) => ({
      p,
      ceil: ceiling(p),
      swing: volatility(p),
    }))
    .filter((r) => r.ceil !== null && r.swing !== null) as { p: AnalysisPlayer; ceil: number; swing: number }[];
  if (rows.length < needed || model.universe.throughWeek < MIN_GAMES) {
    const why = `Not enough games yet: needs ${MIN_GAMES}+ games from at least ${needed} of your starters (${rows.length} so far).`;
    return [grade("UPSIDE", "Upside", null, why), grade("CONSISTENCY", "Consistency", null, why)];
  }
  const ups = rows.map((r) => percentile(r.ceil, anchors.ceilings[r.p.position], true) ?? 50);
  const steady = rows.map((r) => percentile(r.swing, anchors.swings[r.p.position], false) ?? 50);
  const avg = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
  const byCeil = [...rows].sort((a, b) => b.ceil - a.ceil);
  const bySwing = [...rows].sort((a, b) => a.swing - b.swing);
  const upside = grade(
    "UPSIDE",
    "Upside",
    avg(ups),
    `Your starters' two best games average ${fmt(avg(rows.map((r) => r.ceil)))} pts. Biggest ceiling: ${byCeil[0].p.name} (${fmt(byCeil[0].ceil)}); smallest: ${byCeil[byCeil.length - 1].p.name} (${fmt(byCeil[byCeil.length - 1].ceil)}). 50 = typical for starters at the same positions.`,
  );
  const consistency = grade(
    "CONSISTENCY",
    "Consistency",
    avg(steady),
    `Steadiest: ${bySwing[0].p.name} (weekly points swing about ±${Math.round(bySwing[0].swing * 100)}% of his average). Most up-and-down: ${bySwing[bySwing.length - 1].p.name} (±${Math.round(bySwing[bySwing.length - 1].swing * 100)}%). 50 = typical for starters at the same positions.`,
  );
  return [upside, consistency];
}

function availabilityGrade(core: TeamCore, model: LeagueModel, anchors: Anchors): Grade {
  // The lineup you'd field if everyone were healthy, and how much of it ESPN expects to play.
  const healthyLineup = fillSlots(core.players, slotList(model.settings), (p) => healthyRate(p));
  let expected = 0;
  let full = 0;
  for (const spot of healthyLineup) {
    if (!spot.player) continue;
    const share = availabilityShare(spot.player);
    if (share === null) continue;
    full += spot.points;
    expected += spot.points * share;
  }
  const flagged = core.players
    .filter((p) => statusWord(p) && healthyLineup.some((s) => s.player?.id === p.id))
    .map((p) => `${p.name} (${statusWord(p)})`);
  if (full <= 0) return grade("AVAILABILITY", "Availability", null, "No projections for your lineup yet.");
  const share = expected / full;
  // 0 = 15 points below typical (like losing your whole lineup for 1 in 7 games).
  const zero = Math.max(0, anchors.availability - 0.15);
  const why =
    `ESPN expects your best healthy lineup to play ${Math.round(share * 100)}% of its remaining games (typical: ${Math.round(anchors.availability * 100)}%).` +
    (flagged.length ? ` Injury report: ${listNames(flagged)}.` : " Nobody in it is on the injury report.");
  return grade("AVAILABILITY", "Availability", anchored(share, zero, anchors.availability, 1), why);
}

// ---------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------

/** Rates already-resolved players (used by trades and pickups). */
export function ratePlayers(
  players: readonly AnalysisPlayer[],
  model: LeagueModel,
  missing: MissingPlayer[] = [],
): TeamRating {
  const core = teamCore(players, model);
  const anchors = anchorsFor(model);
  const { universe, settings } = model;
  const grades = {} as Record<GradeKey, Grade>;
  for (const slot of SLOT_ORDER) grades[slot] = groupGrade(slot, core, model, anchors);
  grades.BENCH = benchGrade(core, anchors);
  grades.DEPTH = depthGrade(core, anchors);
  [grades.UPSIDE, grades.CONSISTENCY] = weekToWeekGrades(core, model, anchors);
  grades.AVAILABILITY = availabilityGrade(core, model, anchors);

  const rosLineup = optimalLineup(players, settings, "ros", universe.week);
  const weekLineup = optimalLineup(players, settings, "week", universe.week);
  const notes: string[] = [
    `Rest-of-season numbers are ESPN projections from week ${universe.week} on, scored in ${universe.format === "ppr" ? "PPR" : universe.format === "half" ? "half-PPR" : "standard"}.`,
  ];
  if (universe.throughWeek > 0) notes.push(`Season results cover weeks 1-${universe.throughWeek}.`);
  for (const p of players) if (p.rosNote) notes.push(`${p.name}: ${p.rosNote}`);

  return {
    overall: round1(core.overall),
    label: gradeLabel(core.overall),
    parts: {
      starters: round1(core.startersScore),
      depth: core.depthScore === null ? null : round1(core.depthScore),
      weights: RATING_WEIGHTS,
    },
    grades,
    restOfSeason: {
      lineup: rosLineup,
      pointsPerGame: round1(core.pointsPerGame),
      overReplacement: round1(core.startersPar),
    },
    thisWeek: { week: universe.week, lineup: weekLineup, points: round1(weekLineup.total) },
    missing,
    notes,
    method: RATING_METHOD,
  };
}

/** "Is my team good?": a 0-100 rating with a graded, explained breakdown. */
export function rateTeam(roster: RosterInput, universe: Universe, settings: LeagueSettings): TeamRating {
  const model = leagueModel(universe, settings);
  const { players, missing } = resolveRoster(roster, model);
  return ratePlayers(players, model, missing);
}

/** The anchors behind the grades, for tests and the methodology screen. */
export function ratingAnchors(universe: Universe, settings: LeagueSettings) {
  const a = anchorsFor(leagueModel(universe, settings));
  return { starters: a.starters, group: a.group, coverage: a.coverage, bench: a.bench, availability: a.availability };
}
