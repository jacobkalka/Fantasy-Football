/**
 * "Who should I trade for?": searches 1-for-1, 2-for-1 and 1-for-2 packages that
 *  - fix one of your weaknesses (a starting spot below an average team's),
 *  - make YOUR team better overall (rating up by at least MIN_TRADE_GAIN; never just "more raw points"),
 *  - are plausible for the other manager: by trade value they get at least 90% of what they give,
 *    and you don't overpay by more than 30%.
 *
 * We can't see other teams' rosters yet (no league link), so the players to get are "targets to ask
 * about": players most ESPN leagues roster (inside the N × R most-rostered) or that you marked as
 * taken in your league.
 */
import { fmt, xppg } from "./metrics";
import { isLikelyAvailable, leagueModel, marketValueOf, type LeagueModel } from "./model";
import { applyMove, type PlayerBrief } from "./moves";
import { teamCore } from "./rating";
import { resolveRoster, type RosterInput } from "./roster";
import { round1, type LetterGrade } from "./scale";
import { eligible, slotLabel, type LeagueSettings, type StartingSlot } from "./settings";
import { evaluateTradePlayers, marketNote, type TradeEvaluation } from "./trade";
import type { AnalysisPlayer, Universe } from "./universe";
import { weaknessesFor, type Weakness } from "./weaknesses";

/** A suggestion must raise your team rating by at least this much (0-100 scale). */
export const MIN_TRADE_GAIN = 1;
/** They must get at least this share of the trade value they give… */
export const MIN_THEIR_SHARE = 0.9;
/** …and you shouldn't give more than this multiple of what you get. */
export const MAX_OVERPAY = 1.3;
const TARGETS_PER_POSITION = 20;
const PAIR_TARGETS = 12;

export interface TradeSuggestion {
  give: PlayerBrief[];
  get: PlayerBrief[];
  /** Which weakness it fixes, in words. */
  fixes: string;
  ratingBefore: number;
  ratingAfter: number;
  ratingChange: number;
  grade: LetterGrade;
  /** Why the other manager might say yes. */
  balance: string;
  why: string[];
  evaluation: TradeEvaluation;
}

export interface TradeSuggestions {
  suggestions: TradeSuggestion[];
  /** The weaknesses the search tried to fix. */
  targeted: Weakness[];
  note: string;
}

const NOTE =
  "We can't see other teams' rosters yet, so these are targets to ask about: players rostered in most ESPN leagues (or that you marked as taken), so they're probably on another team in yours.";

function balanced(give: number, get: number): boolean {
  return get > 0 && give >= MIN_THEIR_SHARE * get && give <= MAX_OVERPAY * get;
}

function valueList(players: AnalysisPlayer[], model: LeagueModel): string {
  const parts = players.map((p) => `${p.name} ${fmt(marketValueOf(model, p.id))}`);
  const total = players.reduce((s, p) => s + marketValueOf(model, p.id), 0);
  return players.length > 1 ? `${parts.join(" + ")} = ${fmt(total)}` : parts[0];
}

export function tradeSuggestionsFor(
  players: readonly AnalysisPlayer[],
  model: LeagueModel,
  { taken = [], limit = 5 }: { taken?: Iterable<string>; limit?: number } = {},
): TradeSuggestions {
  const takenSet = new Set(taken);
  const onRoster = new Set(players.map((p) => p.id));
  const base = teamCore(players, model);
  const tradeable: StartingSlot[] = ["QB", "RB", "WR", "TE", "FLEX"];
  const targeted = weaknessesFor(players, model).filter(
    (w) => tradeable.includes(w.area as StartingSlot) && w.fix,
  );
  let note = NOTE;
  if (targeted.length === 0) note = `Your starting lineup has no clear weakness, so there's nothing a trade needs to fix. ${NOTE}`;

  const weakSlots = new Set(targeted.map((w) => w.area as StartingSlot));
  const positions = new Set(targeted.flatMap((w) => w.fix!.positions));
  // The worst starter a target must beat at each position to start for you.
  const bar = (pos: AnalysisPlayer["position"]) =>
    Math.min(
      ...base.lineup.filter((s) => weakSlots.has(s.slot) && eligible(s.slot, pos)).map((s) => s.points),
      Infinity,
    );

  const targets = [...positions].flatMap((pos) =>
    model.ranked[pos]
      .filter(
        (p) =>
          !onRoster.has(p.id) &&
          (takenSet.has(p.id) || !isLikelyAvailable(model, p.id)) &&
          marketValueOf(model, p.id) > 0 &&
          xppg(p) > bar(pos),
      )
      .slice(0, TARGETS_PER_POSITION),
  );
  const givers = players.filter((p) => marketValueOf(model, p.id) > 0);
  const value = (list: AnalysisPlayer[]) => list.reduce((s, p) => s + marketValueOf(model, p.id), 0);

  type Candidate = { give: AnalysisPlayer[]; get: AnalysisPlayer[]; gain: number };
  const found: Candidate[] = [];
  const consider = (give: AnalysisPlayer[], get: AnalysisPlayer[]) => {
    if (!balanced(value(give), value(get))) return;
    const move = applyMove(players, get, give, model);
    const gain = move.core.overall - base.overall;
    if (gain < MIN_TRADE_GAIN) return;
    // It has to help at a weak spot, not just somewhere.
    const fixesOne = [...weakSlots].some((slot) => move.core.groupPar[slot] > base.groupPar[slot] + 0.2);
    if (fixesOne) found.push({ give, get, gain });
  };

  for (const t of targets) {
    for (let i = 0; i < givers.length; i++) {
      consider([givers[i]], [t]);
      for (let j = i + 1; j < givers.length; j++) consider([givers[i], givers[j]], [t]);
    }
  }
  const pairPool = [...targets].sort((a, b) => xppg(b) - xppg(a)).slice(0, PAIR_TARGETS);
  for (const g of givers) {
    for (let i = 0; i < pairPool.length; i++) {
      for (let j = i + 1; j < pairPool.length; j++) consider([g], [pairPool[i], pairPool[j]]);
    }
  }

  // Best first; don't repeat the same incoming player or lean on one outgoing player too much.
  found.sort((a, b) => b.gain - a.gain);
  const usedIn = new Set<string>();
  const outCount = new Map<string, number>();
  const picked: Candidate[] = [];
  for (const c of found) {
    if (picked.length >= limit) break;
    if (c.get.some((p) => usedIn.has(p.id))) continue;
    if (c.give.some((p) => (outCount.get(p.id) ?? 0) >= 2)) continue;
    picked.push(c);
    c.get.forEach((p) => usedIn.add(p.id));
    c.give.forEach((p) => outCount.set(p.id, (outCount.get(p.id) ?? 0) + 1));
  }

  const suggestions = picked.map((c): TradeSuggestion => {
    const evaluation = evaluateTradePlayers(players, c.give, c.get, model);
    const fixed = targeted.filter((w) => {
      const slot = w.area as StartingSlot;
      return evaluation.positions.find((p) => p.slot === slot)!.perGameChange > 0.2;
    });
    const fixes = fixed.length
      ? `Fixes your ${fixed.map((w) => `${slotLabel(w.area as StartingSlot)} weakness (${w.priority.toLowerCase()} priority)`).join(" and ")}.`
      : "Improves your lineup.";
    const giveV = value(c.give);
    const getV = value(c.get);
    return {
      give: evaluation.give,
      get: evaluation.get,
      fixes,
      ratingBefore: evaluation.before.overall,
      ratingAfter: evaluation.after.overall,
      ratingChange: evaluation.ratingChange,
      grade: evaluation.grade,
      balance: `Trade value: they get ${valueList(c.give, model)} for ${valueList(c.get, model)}. ${marketNote(round1(giveV), round1(getV))}`,
      why: evaluation.why,
      evaluation,
    };
  });
  if (targeted.length && suggestions.length === 0) {
    note = `No fair 1-for-1, 2-for-1 or 1-for-2 trade fixes your weak spots without hurting your team elsewhere. Try the waiver wire first. ${NOTE}`;
  }
  return { suggestions, targeted, note };
}

/** "Who should I trade for?" `taken`: ids you've marked as taken in your league (good trade targets). */
export function suggestTrades(
  roster: RosterInput,
  universe: Universe,
  settings: LeagueSettings,
  options: { taken?: Iterable<string>; limit?: number } = {},
): TradeSuggestions {
  const model = leagueModel(universe, settings);
  const { players } = resolveRoster(roster, model);
  return tradeSuggestionsFor(players, model, options);
}
