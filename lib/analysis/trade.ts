/**
 * "Should I make this trade?": judged by how YOUR WHOLE TEAM changes, never player A vs player B.
 *
 * Before and after: best lineups, team rating and every grade. The letter grade comes from the
 * change in team rating (see tradeLetter in scale.ts), one step lower when the trade adds injury
 * risk. Uneven trades are handled: if you'd be over the roster limit, the player whose loss hurts
 * your team least is dropped (and the answer says so); if you'd have an open spot, it says so.
 */
import { availabilityShare, fmt, signed, volatility, xppg } from "./metrics";
import { leagueModel, marketValueOf, type LeagueModel } from "./model";
import { applyMove, brief, type PlayerBrief } from "./moves";
import { listNames, ratePlayers, statusWord, type TeamCore, type TeamRating } from "./rating";
import { resolveRoster, type RosterInput } from "./roster";
import { lowerLetter, round1, tradeLetter, type LetterGrade } from "./scale";
import { slotLabel, SLOT_ORDER, type LeagueSettings, type StartingSlot } from "./settings";
import type { AnalysisPlayer, Universe } from "./universe";

export type Verdict = "improves" | "neutral" | "weakens";

/** Rating change (0-100 points) needed to call a trade better or worse rather than a wash. */
export const NEUTRAL_BAND = 0.5;

export interface PositionImpact {
  slot: StartingSlot;
  before: number | null;
  after: number | null;
  /** Change in points per game over replacement at this spot. */
  perGameChange: number;
}

export interface TradeEvaluation {
  ok: boolean;
  /** Why the trade couldn't be evaluated (player not on your roster…). */
  error: string | null;
  give: PlayerBrief[];
  get: PlayerBrief[];
  /** Dropped to stay under the roster limit. */
  dropped: PlayerBrief[];
  /** Roster spots the trade opens up. */
  openSpots: number;
  before: TeamRating;
  after: TeamRating;
  ratingChange: number;
  points: {
    /** This week's projected starting points. */
    thisWeek: { before: number; after: number; change: number };
    /** Expected starting points per game, rest of season. */
    restOfSeason: { before: number; after: number; change: number };
  };
  positions: PositionImpact[];
  depth: { before: number | null; after: number | null; change: number | null };
  upside: { before: number | null; after: number | null; change: number | null };
  risk: { level: "lower" | "same" | "higher"; notes: string[] };
  market: { give: number; get: number; note: string };
  grade: LetterGrade;
  verdict: Verdict;
  /** One line: "Improves your team: 60.8 → 64.1 (B+)". */
  summary: string;
  /** Plain-English reasons, most important first. */
  why: string[];
}

function byeCluster(core: TeamCore, week: number): { week: number; count: number } {
  const counts = new Map<number, number>();
  for (const spot of core.lineup) {
    const bye = spot.player?.byeWeek;
    if (bye != null && bye >= week) counts.set(bye, (counts.get(bye) ?? 0) + 1);
  }
  const [w, count] = [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0] ?? [0, 0];
  return { week: w, count };
}

const avgOf = (values: (number | null)[]) => {
  const v = values.filter((x): x is number => x !== null);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
};

/** What a trade does to the other side's trade value, in words. */
export function marketNote(give: number, get: number): string {
  const g = fmt(give);
  const r = fmt(get);
  if (give <= 0 && get <= 0) return "Neither side has much trade value here.";
  if (give >= get * 1.15 + 1) return `By trade value you give more than you get (${g} vs ${r}), so they should say yes; you might be able to ask for a little more.`;
  if (get >= give * 1.15 + 1) return `By trade value you get more than you give (${r} vs ${g}), so they may say no unless the trade fills a need for them.`;
  return `Fair by trade value: you give ${g}, you get ${r}.`;
}

function lineupChanges(before: TeamCore, after: TeamCore): string[] {
  const ids = (c: TeamCore) => new Set(c.lineup.map((s) => s.player?.id).filter(Boolean));
  const b = ids(before);
  const a = ids(after);
  const joined = after.lineup.filter((s) => s.player && !b.has(s.player.id));
  const left = before.lineup.filter((s) => s.player && !a.has(s.player.id));
  const out: string[] = [];
  if (joined.length) out.push(`New in your best lineup: ${listNames(joined.map((s) => `${s.player!.name} (${slotLabel(s.slot)}, ${fmt(s.points)})`))}.`);
  if (left.length) out.push(`Leaving it: ${listNames(left.map((s) => `${s.player!.name} (${fmt(s.points)})`))}.`);
  return out;
}

export function evaluateTradePlayers(
  current: readonly AnalysisPlayer[],
  give: readonly AnalysisPlayer[],
  get: readonly AnalysisPlayer[],
  model: LeagueModel,
): TradeEvaluation {
  const week = model.universe.week;
  const move = applyMove(current, get, give, model);
  const beforeRating = ratePlayers(current, model);
  const afterRating = ratePlayers(move.players, model);
  const beforeCore = applyMove(current, [], [], model).core;
  const afterCore = move.core;
  const change = round1(afterCore.overall - beforeCore.overall);

  // Positions: points over replacement per game at each kind of slot.
  const positions: PositionImpact[] = SLOT_ORDER.filter((slot) => model.settings.slots[slot] > 0).map((slot) => ({
    slot,
    before: beforeRating.grades[slot].score,
    after: afterRating.grades[slot].score,
    perGameChange: round1(afterCore.groupPar[slot] - beforeCore.groupPar[slot]),
  }));

  // Risk.
  const riskUp: string[] = [];
  const riskDown: string[] = [];
  for (const p of get) {
    const word = statusWord(p);
    if (word) riskUp.push(`${p.name} is ${word}.`);
    const share = availabilityShare(p);
    if (share !== null && share < 0.85 && !word) riskUp.push(`ESPN expects ${p.name} to miss about ${Math.round((1 - share) * 100)}% of his remaining games.`);
  }
  for (const p of give) {
    const word = statusWord(p);
    if (word) riskDown.push(`You'd move ${p.name}, who is ${word}.`);
  }
  const volIn = avgOf(get.map(volatility));
  const volOut = avgOf(give.map(volatility));
  if (volIn !== null && volOut !== null) {
    if (volIn > volOut + 0.1) riskUp.push(`Week to week, what you get swings more (about ±${Math.round(volIn * 100)}% vs ±${Math.round(volOut * 100)}%).`);
    else if (volOut > volIn + 0.1) riskDown.push(`Week to week, what you get is steadier (about ±${Math.round(volIn * 100)}% vs ±${Math.round(volOut * 100)}%).`);
  }
  const byeBefore = byeCluster(beforeCore, week);
  const byeAfter = byeCluster(afterCore, week);
  if (byeAfter.count >= 3 && byeAfter.count > byeBefore.count) riskUp.push(`${byeAfter.count} of your starters would share the week ${byeAfter.week} bye.`);
  else if (byeBefore.count >= 3 && byeAfter.count < byeBefore.count) riskDown.push(`Fewer starters share a bye week (${byeBefore.count} → ${byeAfter.count}).`);
  const riskLevel = riskUp.length > riskDown.length ? "higher" : riskDown.length > riskUp.length ? "lower" : "same";

  // Grade and verdict.
  const injuredIncoming = get.some((p) => statusWord(p) && p.injuryStatus !== "QUESTIONABLE" && p.injuryStatus !== "DAY_TO_DAY");
  let grade = tradeLetter(change);
  if (riskLevel === "higher" && (injuredIncoming || riskUp.length >= 2)) grade = lowerLetter(grade);
  const verdict: Verdict = change >= NEUTRAL_BAND ? "improves" : change <= -NEUTRAL_BAND ? "weakens" : "neutral";

  const giveValue = round1(give.reduce((s, p) => s + marketValueOf(model, p.id), 0));
  const getValue = round1(get.reduce((s, p) => s + marketValueOf(model, p.id), 0));

  const ros = {
    before: round1(beforeCore.pointsPerGame),
    after: round1(afterCore.pointsPerGame),
    change: round1(afterCore.pointsPerGame - beforeCore.pointsPerGame),
  };
  const thisWeek = {
    before: beforeRating.thisWeek.points,
    after: afterRating.thisWeek.points,
    change: round1(afterRating.thisWeek.points - beforeRating.thisWeek.points),
  };

  // Why, most important first.
  const why: string[] = [];
  const verdictWords = { improves: "makes your team better", neutral: "barely changes your team", weakens: "makes your team worse" }[verdict];
  why.push(`This trade ${verdictWords}: team rating ${beforeRating.overall} → ${afterRating.overall} (${signed(change)}). Your best lineup's expected points per game go ${fmt(ros.before)} → ${fmt(ros.after)} (${signed(ros.change)}).`);
  const moved = [...positions].filter((p) => Math.abs(p.perGameChange) >= 0.3).sort((a, b) => Math.abs(b.perGameChange) - Math.abs(a.perGameChange));
  if (moved.length) {
    why.push(
      `Biggest changes: ${moved
        .slice(0, 3)
        .map((p) => `${slotLabel(p.slot)} ${signed(p.perGameChange)} pts/game`)
        .join(", ")}.`,
    );
  }
  why.push(...lineupChanges(beforeCore, afterCore));
  const rawIn = get.reduce((s, p) => s + xppg(p), 0);
  const rawOut = give.reduce((s, p) => s + xppg(p), 0);
  if (rawIn > rawOut + 0.5 && verdict !== "improves") {
    why.push(
      `${listNames(get.map((p) => p.name))} ${get.length > 1 ? "project" : "projects"} more points per game than ${listNames(give.map((p) => p.name))} (${fmt(rawIn)} vs ${fmt(rawOut)}), but that doesn't help you: what matters is who would start for you and who would fill the spots you give up.`,
    );
  } else if (rawOut > rawIn + 0.5 && verdict === "improves") {
    why.push(`You give up more raw points (${fmt(rawOut)} vs ${fmt(rawIn)} per game), but they land where your lineup needs them.`);
  }
  if (afterRating.parts.depth !== null && beforeRating.parts.depth !== null && Math.abs(afterRating.parts.depth - beforeRating.parts.depth) >= 5) {
    why.push(`Depth ${afterRating.parts.depth > beforeRating.parts.depth ? "improves" : "drops"}: ${beforeRating.parts.depth} → ${afterRating.parts.depth}.`);
  }
  if (move.dropped.length) {
    why.push(`You'd have too many players, so you'd drop ${listNames(move.dropped.map((p) => `${p.name} (${fmt(xppg(p))} pts/game)`))}: the ${move.dropped.length > 1 ? "players" : "player"} your team misses least.`);
  }
  if (move.openSpots) why.push(`You'd have ${move.openSpots} open roster spot${move.openSpots > 1 ? "s" : ""} to fill from waivers (not counted in the new rating).`);
  why.push(...riskUp.map((r) => `Risk: ${r}`), ...riskDown.map((r) => `Less risk: ${r}`));
  if (Math.abs(thisWeek.change) >= 0.5) why.push(`This week: your projected lineup changes by ${signed(thisWeek.change)} points.`);
  why.push(marketNote(giveValue, getValue));

  const summary = `${verdict === "improves" ? "Improves" : verdict === "weakens" ? "Weakens" : "Doesn't really change"} your team: ${beforeRating.overall} → ${afterRating.overall} (grade ${grade}).`;

  return {
    ok: true,
    error: null,
    give: give.map((p) => brief(p, model)),
    get: get.map((p) => brief(p, model)),
    dropped: move.dropped.map((p) => brief(p, model)),
    openSpots: move.openSpots,
    before: beforeRating,
    after: afterRating,
    ratingChange: change,
    points: { thisWeek, restOfSeason: ros },
    positions,
    depth: {
      before: beforeRating.parts.depth,
      after: afterRating.parts.depth,
      change: beforeRating.parts.depth === null || afterRating.parts.depth === null ? null : round1(afterRating.parts.depth - beforeRating.parts.depth),
    },
    upside: {
      before: beforeRating.grades.UPSIDE.score,
      after: afterRating.grades.UPSIDE.score,
      change:
        beforeRating.grades.UPSIDE.score === null || afterRating.grades.UPSIDE.score === null
          ? null
          : round1(afterRating.grades.UPSIDE.score - beforeRating.grades.UPSIDE.score),
    },
    risk: { level: riskLevel, notes: [...riskUp, ...riskDown] },
    market: { give: giveValue, get: getValue, note: marketNote(giveValue, getValue) },
    grade,
    verdict,
    summary,
    why,
  };
}

/** "Should I make this trade?" `give` must be on your roster; `get` must not be. */
export function evaluateTrade(
  roster: RosterInput,
  give: readonly string[],
  get: readonly string[],
  universe: Universe,
  settings: LeagueSettings,
): TradeEvaluation {
  const model = leagueModel(universe, settings);
  const { players } = resolveRoster(roster, model);
  const onRoster = new Set(players.map((p) => p.id));
  const giveIds = [...new Set(give)];
  const getIds = [...new Set(get)];
  let error: string | null = null;
  if (giveIds.length === 0 || getIds.length === 0) error = "Pick at least one player to give and one to get.";
  else if (giveIds.some((id) => !onRoster.has(id))) error = "Every player you give has to be on your roster.";
  else if (getIds.some((id) => onRoster.has(id))) error = "You already have one of the players you'd get.";
  else if (getIds.some((id) => !model.byId.has(id))) error = "One of the players you'd get isn't in ESPN's player list, so he can't be judged.";
  const givePlayers = players.filter((p) => giveIds.includes(p.id));
  const getPlayers = getIds.map((id) => model.byId.get(id)).filter((p): p is AnalysisPlayer => !!p);
  if (error) {
    const rating = ratePlayers(players, model);
    return {
      ...evaluateTradePlayers(players, [], [], model),
      ok: false,
      error,
      before: rating,
      after: rating,
      summary: error,
      why: [error],
    };
  }
  return evaluateTradePlayers(players, givePlayers, getPlayers, model);
}
