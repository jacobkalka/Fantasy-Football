/**
 * "Who should I pick up?": players who are probably free in your league, ranked by how much
 * they improve YOUR roster (not by raw points).
 *
 * "Likely available": a league of N teams with R-man rosters has about N × R players on teams.
 * Anyone outside ESPN's N × R most-rostered players is probably free in a league your size. We
 * can't see your league, so it's an estimate; players you mark as taken are skipped.
 *
 * Order: a new starter at one of your weak spots first, then any new starter, then a backup at a
 * thin spot, then other backups; within each group, the biggest rating gain first (at most 3 per
 * position, so one weak spot doesn't fill the whole list). Every reason
 * comes from real numbers; a reason whose data is missing is left out.
 */
import type { Position } from "@/lib/providers/types";
import { fmt, recentPerGame, seasonPerGame, signed, usageTrend, xppg } from "./metrics";
import { isLikelyAvailable, leagueModel, type LeagueModel } from "./model";
import { applyMove, brief, type PlayerBrief } from "./moves";
import { statusWord, teamCore, type TeamCore } from "./rating";
import { resolveRoster, type RosterInput } from "./roster";
import { round1 } from "./scale";
import { eligible, slotLabel, type LeagueSettings, type StartingSlot } from "./settings";
import type { AnalysisPlayer, Universe } from "./universe";
import { weaknessesFor, type Weakness } from "./weaknesses";

/** Only this many likely-available players per position are tried (best projections first). */
const CANDIDATES_PER_POSITION = 25;
/** Smallest rating gain worth suggesting. */
const MIN_GAIN = 0.05;
/** At most this many suggestions at one position, so one weak spot doesn't fill the whole list. */
const MAX_PER_POSITION = 3;

export interface Pickup {
  player: PlayerBrief;
  /** "starter": he'd be in your best lineup. "depth": he'd be a useful backup. */
  kind: "starter" | "depth";
  /** True when he helps at a spot listed in your weaknesses. */
  atWeakSpot: boolean;
  /** Where he'd play in your best rest-of-season lineup. */
  spot: StartingSlot | "BENCH";
  /** Who he'd push out of your lineup (starter) or who is your best backup there now (depth). */
  compared: PlayerBrief | null;
  /** Who you'd drop to make room (roster full). */
  drop: PlayerBrief | null;
  ratingBefore: number;
  ratingAfter: number;
  ratingChange: number;
  reasons: string[];
  /** Why we think he's available. */
  availability: string;
}

export interface PickupSuggestions {
  pickups: Pickup[];
  /** How "likely available" was decided, in words. */
  method: string;
}

function weakPositions(weaknesses: Weakness[]): { start: Set<Position>; depth: Set<Position> } {
  const start = new Set<Position>();
  const depth = new Set<Position>();
  for (const w of weaknesses) {
    if (!w.fix) continue;
    if (w.area === "DEPTH") w.fix.positions.forEach((p) => depth.add(p));
    else if (w.area !== "BYES" && w.area !== "INJURIES" && w.area !== "BENCH") w.fix.positions.forEach((p) => start.add(p));
  }
  return { start, depth };
}

function reasonsFor(
  candidate: AnalysisPlayer,
  kind: Pickup["kind"],
  compared: AnalysisPlayer | null,
  spot: StartingSlot | "BENCH",
): string[] {
  const reasons: string[] = [];
  const mine = compared ? `${compared.name} (${fmt(xppg(compared))})` : null;
  if (kind === "starter") {
    reasons.push(
      mine
        ? `Projects ${fmt(xppg(candidate))} pts/game rest of season vs ${mine}, who he'd replace in your lineup${spot !== "BENCH" ? ` at ${slotLabel(spot)}` : ""}.`
        : `Projects ${fmt(xppg(candidate))} pts/game rest of season and fills an empty starting spot.`,
    );
  } else {
    reasons.push(
      mine
        ? `Projects ${fmt(xppg(candidate))} pts/game vs ${mine}, your best backup ${slotLabel(candidate.position)} now.`
        : `Projects ${fmt(xppg(candidate))} pts/game, and you have no backup ${slotLabel(candidate.position)}.`,
    );
  }
  const recent = recentPerGame(candidate);
  const season = seasonPerGame(candidate);
  if (recent !== null && season !== null && recent >= season * 1.15 && recent - season >= 2) {
    reasons.push(`Hot lately: ${fmt(recent)} pts/game over his last 3 games vs ${fmt(season)} for the season.`);
  }
  const usage = usageTrend(candidate);
  if (usage && usage.recent >= usage.season * 1.15 && usage.recent - usage.season >= 1.5) {
    const what = candidate.position === "QB" ? "passes + carries" : "targets + carries";
    reasons.push(`More work: ${fmt(usage.recent)} ${what} a game over his last 3 vs ${fmt(usage.season)} for the season.`);
  }
  if (candidate.percentOwnedChange !== null && candidate.percentOwnedChange >= 1) {
    reasons.push(`Other managers are adding him: ${signed(candidate.percentOwnedChange)}% rostered on ESPN recently.`);
  }
  const word = statusWord(candidate);
  if (word) reasons.push(`Heads-up: he's ${word}.`);
  return reasons;
}

function availabilityText(p: AnalysisPlayer, model: LeagueModel): string {
  const rank = model.ownershipRank.get(p.id);
  const owned = p.percentOwned === null ? "an unknown share of" : `${fmt(p.percentOwned)}% of`;
  return `Rostered in ${owned} ESPN leagues${rank ? ` (#${rank} most rostered)` : ""}: outside the ${model.likelyRosteredCount} players a ${model.settings.teams}-team league usually rosters, so he's probably available. Mark him as taken if he isn't.`;
}

export function pickupsFor(
  players: readonly AnalysisPlayer[],
  model: LeagueModel,
  {
    taken = [],
    limit = 10,
    knownRosters = false,
  }: {
    taken?: Iterable<string>;
    limit?: number;
    /** `taken` is every player on another team in a connected league: exact, not an estimate. */
    knownRosters?: boolean;
  } = {},
): PickupSuggestions {
  const takenSet = new Set(taken);
  const available = (id: string) => (knownRosters ? !takenSet.has(id) : isLikelyAvailable(model, id, takenSet));
  const onRoster = new Set(players.map((p) => p.id));
  const base = teamCore(players, model);
  const weak = weakPositions(weaknessesFor(players, model));

  const pool = Object.values(model.ranked).flatMap((list) =>
    list
      .filter((p) => !onRoster.has(p.id) && available(p.id) && xppg(p) > 0)
      .slice(0, CANDIDATES_PER_POSITION),
  );

  // Quick check before the full re-rating: he must beat a starter he could replace,
  // or your best backup at his position (or you have none).
  const couldHelp = (c: AnalysisPlayer) => {
    const v = xppg(c);
    if (base.lineup.some((s) => eligible(s.slot, c.position) && (!s.player || s.points < v))) return true;
    const backup = bestBackup(base, c.position);
    return !backup || xppg(backup) < v;
  };

  const results: { bucket: number; pickup: Pickup }[] = [];
  for (const candidate of pool) {
    if (!couldHelp(candidate)) continue;
    const move = applyMove(players, [candidate], [], model);
    const gain = move.core.overall - base.overall;
    if (gain < MIN_GAIN) continue;
    const spotEntry = move.core.lineup.find((s) => s.player?.id === candidate.id);
    const kind: Pickup["kind"] = spotEntry ? "starter" : "depth";
    const spot = spotEntry?.slot ?? "BENCH";
    const compared = kind === "starter" ? pushedOut(base, move.core) : bestBackup(base, candidate.position);
    const atWeakSpot =
      kind === "starter"
        ? weak.start.has(candidate.position) && (spot === candidate.position || (spot === "FLEX" && eligible("FLEX", candidate.position)))
        : weak.depth.has(candidate.position) || weak.start.has(candidate.position);
    const bucket = kind === "starter" ? (atWeakSpot ? 0 : 1) : atWeakSpot ? 2 : 3;
    results.push({
      bucket,
      pickup: {
        player: brief(candidate, model),
        kind,
        atWeakSpot,
        spot,
        compared: compared ? brief(compared, model) : null,
        drop: move.dropped[0] ? brief(move.dropped[0], model) : null,
        ratingBefore: round1(base.overall),
        ratingAfter: round1(move.core.overall),
        ratingChange: round1(gain),
        reasons: [
          ...reasonsFor(candidate, kind, compared, spot),
          ...(move.dropped[0] ? [`To make room you'd drop ${move.dropped[0].name}, the player your team misses least.`] : []),
        ],
        availability: knownRosters ? "Not on any team in your league (from ESPN)." : availabilityText(candidate, model),

      },
    });
  }
  results.sort(
    (a, b) =>
      a.bucket - b.bucket ||
      b.pickup.ratingChange - a.pickup.ratingChange ||
      a.pickup.player.id.localeCompare(b.pickup.player.id),
  );
  const perPosition = new Map<Position, number>();
  const pickups: Pickup[] = [];
  for (const { pickup } of results) {
    const n = perPosition.get(pickup.player.position) ?? 0;
    if (n >= MAX_PER_POSITION || pickups.length >= limit) continue;
    perPosition.set(pickup.player.position, n + 1);
    pickups.push(pickup);
  }
  return {
    pickups,
    method: knownRosters
      ? "Available = not on any team in your ESPN league right now (from the league's rosters)."
      : `"Likely available" means outside ESPN's ${model.likelyRosteredCount} most-rostered players (${model.settings.teams} teams × ${model.likelyRosteredCount / model.settings.teams} roster spots). Players you mark as taken are skipped.`,
  };
}

/** The starter who left the lineup when the new player joined. */
function pushedOut(before: TeamCore, after: TeamCore): AnalysisPlayer | null {
  const now = new Set(after.lineup.map((s) => s.player?.id));
  return before.lineup.find((s) => s.player && !now.has(s.player.id))?.player ?? null;
}

function bestBackup(core: TeamCore, position: Position): AnalysisPlayer | null {
  return core.bench.filter((p) => p.position === position).sort((a, b) => xppg(b) - xppg(a))[0] ?? null;
}

/** "Who should I pick up?" `taken`: player ids you've marked as taken in your league. */
export function suggestPickups(
  roster: RosterInput,
  universe: Universe,
  settings: LeagueSettings,
  options: { taken?: Iterable<string>; limit?: number; knownRosters?: boolean } = {},
): PickupSuggestions {
  const model = leagueModel(universe, settings);
  const { players } = resolveRoster(roster, model);
  return pickupsFor(players, model, options);
}
