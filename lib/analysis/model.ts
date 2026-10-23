/**
 * The league model: what "replacement level", "likely on waivers" and "trade value" mean
 * for one league size and scoring format, built from the whole player universe.
 *
 * - Starters league-wide: teams × slots at each position. FLEX slots go to the best running
 *   backs, receivers and tight ends left after their own slots, so each position gets a FLEX share.
 * - Replacement level (per position): the average expected points per game of the 3 players
 *   ranked just past the league's starters. "Points over replacement" (PAR) is measured from it.
 * - Likely rostered: in a league of N teams with R-man rosters about N × R players are on a team.
 *   We take the N × R most-rostered players on ESPN as "likely rostered"; everyone past that is
 *   "likely available". It's an estimate (we can't see your league), and the app lets you mark
 *   players who are taken.
 * - Waiver level (per position): the average of the 3 best likely-available players.
 * - Trade (market) value: rest-of-season points above waiver level, on a curve (power 1.5) so one
 *   star is worth more than two average players, scaled so the most valuable player = 100.
 */
import type { Position } from "@/lib/providers/types";
import { xppg } from "./metrics";
import { leagueRostered, POSITIONS, type LeagueSettings } from "./settings";
import type { AnalysisPlayer, Universe } from "./universe";

/** Players averaged for replacement and waiver levels. */
export const LEVEL_WINDOW = 3;
/** Power applied to value above waiver level (1 = straight line; higher favors stars). */
export const VALUE_CURVE = 1.5;

const FLEX_POSITIONS: readonly Position[] = ["RB", "WR", "TE"];

export interface LeagueModel {
  settings: LeagueSettings;
  universe: Universe;
  byId: ReadonlyMap<string, AnalysisPlayer>;
  /** Players with an ESPN rest-of-season projection, best expected points per game first. */
  ranked: Readonly<Record<Position, readonly AnalysisPlayer[]>>;
  /** League-wide starters at each position, FLEX share included. */
  startersAt: Readonly<Record<Position, number>>;
  /** How many FLEX starters league-wide are running backs, receivers, tight ends. */
  flexShare: Readonly<Record<Position, number>>;
  replacement: Readonly<Record<Position | "FLEX", number>>;
  waiver: Readonly<Record<Position, number>>;
  /** 1 = most rostered on ESPN. */
  ownershipRank: ReadonlyMap<string, number>;
  /** teams × roster size: how many players are on a team in a league like yours. */
  likelyRosteredCount: number;
  /** Of the likely-rostered players, how many play each position. */
  rosteredAt: Readonly<Record<Position, number>>;
  /** 0-100 trade value per player id. */
  marketValue: ReadonlyMap<string, number>;
}

function mean(values: number[]): number {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}

const perPosition = <T>(make: (p: Position) => T) =>
  Object.fromEntries(POSITIONS.map((p) => [p, make(p)])) as Record<Position, T>;

function buildModel(universe: Universe, settings: LeagueSettings): LeagueModel {
  const N = settings.teams;
  const byId = new Map(universe.players.map((p) => [p.id, p]));
  const sortByValue = (list: AnalysisPlayer[]) =>
    list.sort((a, b) => xppg(b) - xppg(a) || a.id.localeCompare(b.id));
  const ranked = perPosition((pos) => sortByValue(universe.players.filter((p) => p.position === pos && p.ros)));

  // FLEX: the best leftover RB/WR/TE after each position's own slots.
  const flexPool = sortByValue(FLEX_POSITIONS.flatMap((pos) => ranked[pos].slice(N * settings.slots[pos])));
  const flexStarters = flexPool.slice(0, N * settings.slots.FLEX);
  const flexShare = perPosition((pos) => flexStarters.filter((p) => p.position === pos).length);
  const startersAt = perPosition((pos) => N * settings.slots[pos] + flexShare[pos]);

  const level = (list: readonly AnalysisPlayer[], from: number) => mean(list.slice(from, from + LEVEL_WINDOW).map(xppg));
  const replacement = {
    ...perPosition((pos) => level(ranked[pos], startersAt[pos])),
    FLEX: level(flexPool, flexStarters.length),
  };

  const byOwnership = [...universe.players].sort(
    (a, b) => (b.percentOwned ?? -1) - (a.percentOwned ?? -1) || a.id.localeCompare(b.id),
  );
  const ownershipRank = new Map(byOwnership.map((p, i) => [p.id, i + 1]));
  const likelyRosteredCount = leagueRostered(settings);
  const likelyAvailable = (p: AnalysisPlayer) => (ownershipRank.get(p.id) ?? Infinity) > likelyRosteredCount;
  const waiver = perPosition((pos) => level(ranked[pos].filter(likelyAvailable), 0));
  const rosteredAt = perPosition(
    (pos) => byOwnership.slice(0, likelyRosteredCount).filter((p) => p.position === pos).length,
  );

  const aboveWaiver = new Map(
    universe.players.map((p) => [p.id, Math.max(0, xppg(p) - waiver[p.position]) * (p.ros?.teamGames ?? 0)]),
  );
  const top = Math.max(1e-9, ...aboveWaiver.values());
  const marketValue = new Map(
    [...aboveWaiver].map(([id, v]) => [id, Math.round(1000 * (v / top) ** VALUE_CURVE) / 10]),
  );

  return {
    settings,
    universe,
    byId,
    ranked,
    startersAt,
    flexShare,
    replacement,
    waiver,
    ownershipRank,
    likelyRosteredCount,
    rosteredAt,
    marketValue,
  };
}

const cache = new WeakMap<Universe, Map<string, LeagueModel>>();

/** The model for this universe and league (built once, then reused). */
export function leagueModel(universe: Universe, settings: LeagueSettings): LeagueModel {
  const key = JSON.stringify([settings.teams, settings.slots, settings.bench]);
  let byKey = cache.get(universe);
  if (!byKey) cache.set(universe, (byKey = new Map()));
  let model = byKey.get(key);
  if (!model) byKey.set(key, (model = buildModel(universe, { ...settings, format: universe.format })));
  return model;
}

/** True when he's outside the N × R most-rostered players on ESPN (and not marked as taken). */
export function isLikelyAvailable(model: LeagueModel, playerId: string, taken?: ReadonlySet<string>): boolean {
  if (taken?.has(playerId)) return false;
  return (model.ownershipRank.get(playerId) ?? Infinity) > model.likelyRosteredCount;
}

export function marketValueOf(model: LeagueModel, playerId: string): number {
  return model.marketValue.get(playerId) ?? 0;
}

/** "RB14": where his expected points per game rank at his position (null without a projection). */
export function positionRank(model: LeagueModel, p: AnalysisPlayer): number | null {
  const index = model.ranked[p.position].findIndex((x) => x.id === p.id);
  return index >= 0 ? index + 1 : null;
}

/**
 * What an average starter at each tier of a slot projects (expected points per game):
 * for RB in a 12-team league, [average of RB1-RB12, average of RB13-RB24]; for FLEX, the
 * average FLEX starter. Used for weakness targets.
 */
export function starterTiers(model: LeagueModel, slot: Position | "FLEX"): number[] {
  const { settings, ranked, startersAt } = model;
  const N = settings.teams;
  const avg = (list: readonly AnalysisPlayer[]) => (list.length ? mean(list.map(xppg)) : 0);
  if (slot === "FLEX") {
    const pool = FLEX_POSITIONS.flatMap((pos) => ranked[pos].slice(N * settings.slots[pos], startersAt[pos])).sort(
      (a, b) => xppg(b) - xppg(a),
    );
    return Array.from({ length: settings.slots.FLEX }, (_, f) => avg(pool.slice(f * N, (f + 1) * N)));
  }
  return Array.from({ length: settings.slots[slot] }, (_, j) => avg(ranked[slot].slice(j * N, (j + 1) * N)));
}
