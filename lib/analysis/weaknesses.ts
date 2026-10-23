/**
 * "Where am I weak?": a ranked list of problems, each with the numbers behind it and what
 * would fix it (a position and a rough target level).
 *
 * Priority:
 * - High: an empty starting spot, or a starting spot 3+ points per game below an average team's.
 * - Medium: 1.5-3 points per game below average, a thin bench behind your starters (depth grade
 *   under 25), or 4+ starters sharing a bye week still to come.
 * - Low: smaller gaps, depth grade 25-40, 3 starters sharing a bye, or a starter out this week.
 * Kickers and D/STs are capped at Medium unless the spot is empty: they're easy to swap from waivers.
 */
import type { Position } from "@/lib/providers/types";
import { fmt, rankOf, xppg } from "./metrics";
import { leagueModel, starterTiers, type LeagueModel } from "./model";
import { anchorsFor, listNames, ratePlayers, statusWord, teamCore, type GradeKey, type TeamCore, type TeamRating } from "./rating";
import { resolveRoster, type RosterInput } from "./roster";
import { positionWord, slotLabel, SLOT_ORDER, withArticle, type LeagueSettings, type StartingSlot } from "./settings";
import { isOut, type AnalysisPlayer, type Universe } from "./universe";

export type Priority = "High" | "Medium" | "Low";
export type WeaknessArea = GradeKey | "BYES" | "INJURIES";

export interface WeaknessFix {
  /** Position to look for ("RB"), or several for FLEX ("RB", "WR", "TE"). */
  positions: Position[];
  /** Rough target: expected points per game rest of season. */
  targetPerGame: number;
  /** "about a top-14 RB" */
  targetRank: string | null;
  text: string;
}

export interface Weakness {
  area: WeaknessArea;
  priority: Priority;
  title: string;
  why: string;
  fix: WeaknessFix | null;
  /** Points per game your lineup would gain by reaching the target (null when it's about risk, not points). */
  gainPerGame: number | null;
}

const PRIORITY_ORDER: Priority[] = ["High", "Medium", "Low"];

function priorityFor(slot: StartingSlot, gap: number): Priority {
  const p: Priority = gap >= 3 ? "High" : gap >= 1.5 ? "Medium" : "Low";
  if ((slot === "K" || slot === "DST") && p === "High") return "Medium";
  return p;
}

/** "about a top-14 RB", from where the target value would rank at that position. */
function targetRank(model: LeagueModel, positions: Position[], target: number): string | null {
  if (positions.length !== 1) return null;
  const pos = positions[0];
  const values = model.ranked[pos].map(xppg);
  const rank = rankOf(target, values);
  if (rank > values.length) return null;
  return `about a top-${Math.max(1, rank)} ${slotLabel(pos)}`;
}

function groupWeakness(
  slot: StartingSlot,
  core: TeamCore,
  model: LeagueModel,
  rating: TeamRating,
): Weakness | null {
  const spots = core.lineup.filter((s) => s.slot === slot);
  if (spots.length === 0) return null;
  const avg = anchorsFor(model).group[slot].avg;
  const gap = avg - core.groupPar[slot];
  const empty = spots.filter((s) => !s.player).length;
  const positions: Position[] = slot === "FLEX" ? ["RB", "WR", "TE"] : [slot];
  const word = slot === "FLEX" ? "RB, WR or TE" : slotLabel(slot);
  const N = model.settings.teams;

  if (empty > 0) {
    const level = slot === "FLEX" ? Math.max(model.waiver.RB, model.waiver.WR, model.waiver.TE) : model.waiver[slot];
    return {
      area: slot,
      priority: "High",
      title: `No ${slot === "FLEX" ? "FLEX player" : positionWord(slot)} to start`,
      why: `${empty === 1 ? "One starting spot is" : `${empty} starting spots are`} empty, so ${empty === 1 ? "it scores" : "they score"} 0 every week.`,
      fix: {
        positions,
        targetPerGame: Math.round(level * 10) / 10,
        targetRank: targetRank(model, positions, level),
        text: `Pick up any ${word}: players likely on waivers in a ${N}-team league project about ${fmt(level)} pts/game.`,
      },
      gainPerGame: Math.round(level * 10) / 10,
    };
  }
  if (gap < 0.3) return null;

  // Aim at your weakest starter here: bring him up to an average starter of the lowest tier
  // (an average RB2 when you start two RBs), and say what would close the whole gap.
  const tiers = starterTiers(model, slot);
  const weakest = [...spots].sort((a, b) => a.points - b.points)[0];
  const lowTier = tiers[tiers.length - 1] ?? weakest.points;
  const target = Math.max(lowTier, weakest.points + 0.5);
  const full = weakest.points + gap;
  const tierName = slot === "FLEX" ? "FLEX starter" : `${slotLabel(slot)}${tiers.length > 1 ? tiers.length : ""}`;
  const grade = rating.grades[slot];
  const waiverBeats = slot !== "FLEX" && model.waiver[slot] > weakest.points + 0.3;
  let fixText = waiverBeats
    ? `${withArticle(word)[0].toUpperCase()}${withArticle(word).slice(1)} who projects ${fmt(target)}+ pts/game. Easy first step: players likely on waivers already project about ${fmt(model.waiver[slot as Position])}.`
    : `Replace ${weakest.player!.name} (${fmt(weakest.points)}) with ${withArticle(word)} who projects ${fmt(target)}+ pts/game rest of season, like an average ${tierName} in a ${N}-team league.`;
  if (full > target + 1) {
    const big = Math.min(full, tiers[0] ?? full);
    fixText += ` Reaching an average team takes ${fmt(gap)} pts/game in all: ${withArticle(word)} at ${fmt(big)}+ (${targetRank(model, positions, big) ?? "a top starter"}) would close ${big >= full - 0.05 ? "all" : "most"} of it.`;
  }
  return {
    area: slot,
    priority: priorityFor(slot, gap),
    title: `${slot === "FLEX" ? "FLEX" : slotLabel(slot)} is below average`,
    why: `${grade.why} That's ${fmt(gap)} pts/game short of an average team in your league.`,
    fix: {
      positions,
      targetPerGame: Math.round(target * 10) / 10,
      targetRank: targetRank(model, positions, target),
      text: fixText,
    },
    gainPerGame: Math.round(gap * 10) / 10,
  };
}

function depthWeakness(core: TeamCore, model: LeagueModel, rating: TeamRating): Weakness | null {
  const score = rating.parts.depth;
  if (score === null || score >= 40 || core.losses.length === 0) return null;
  const worst = [...core.losses].sort((a, b) => b.loss - a.loss)[0];
  const pos = worst.player.position;
  const N = model.settings.teams;
  const backupLevel = xppg(model.ranked[pos][Math.min(model.ranked[pos].length - 1, model.startersAt[pos] + Math.floor(N / 2))] ?? worst.player);
  return {
    area: "DEPTH",
    priority: score < 25 ? "Medium" : "Low",
    title: `Thin behind your starters (${slotLabel(pos)} especially)`,
    why: `${rating.grades.DEPTH.why}`,
    fix: {
      positions: [pos],
      targetPerGame: Math.round(backupLevel * 10) / 10,
      targetRank: targetRank(model, [pos], backupLevel),
      text: `A backup ${slotLabel(pos)} who projects about ${fmt(backupLevel)}+ pts/game (what an average team's top backup looks like).`,
    },
    gainPerGame: null,
  };
}

function byeWeakness(core: TeamCore, model: LeagueModel): Weakness | null {
  const week = model.universe.week;
  const byWeek = new Map<number, AnalysisPlayer[]>();
  for (const spot of core.lineup) {
    const bye = spot.player?.byeWeek;
    if (!spot.player || bye == null || bye < week) continue;
    byWeek.set(bye, [...(byWeek.get(bye) ?? []), spot.player]);
  }
  const [byeWeek, players] = [...byWeek].sort((a, b) => b[1].length - a[1].length || a[0] - b[0])[0] ?? [0, []];
  if (players.length < 3) return null;
  const positions = [...new Set(players.map((p) => p.position))];
  return {
    area: "BYES",
    priority: players.length >= 4 ? "Medium" : "Low",
    title: `${players.length} starters on bye in week ${byeWeek}`,
    why: `${listNames(players.map((p) => p.name))} all have their bye in week ${byeWeek}.`,
    fix: {
      positions,
      targetPerGame: 0,
      targetRank: null,
      text: `Before week ${byeWeek}, have a bench ${positions.map(slotLabel).join(" or ")} whose bye isn't week ${byeWeek}.`,
    },
    gainPerGame: null,
  };
}

function injuryWeakness(core: TeamCore): Weakness | null {
  const out = core.lineup.map((s) => s.player).filter((p): p is AnalysisPlayer => !!p && (isOut(p) || p.injuryStatus === "DOUBTFUL"));
  if (out.length === 0) return null;
  return {
    area: "INJURIES",
    priority: "Low",
    title: `${out.length === 1 ? "A starter is" : `${out.length} starters are`} hurt this week`,
    why: `${listNames(out.map((p) => `${p.name} (${statusWord(p)})`))}. ESPN's rest-of-season projection already expects ${out.length === 1 ? "him" : "them"} back later, so this is short-term.`,
    fix: {
      positions: [...new Set(out.map((p) => p.position))],
      targetPerGame: 0,
      targetRank: null,
      text: "Check this week's lineup: the app starts the best healthy player in each spot.",
    },
    gainPerGame: null,
  };
}

export function weaknessesFor(players: readonly AnalysisPlayer[], model: LeagueModel, rating?: TeamRating): Weakness[] {
  const core = teamCore(players, model);
  const r = rating ?? ratePlayers(players, model);
  const list: Weakness[] = [];
  for (const slot of SLOT_ORDER) {
    const w = groupWeakness(slot, core, model, r);
    if (w) list.push(w);
  }
  for (const w of [depthWeakness(core, model, r), byeWeakness(core, model), injuryWeakness(core)]) if (w) list.push(w);
  return list.sort(
    (a, b) =>
      PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority) ||
      (b.gainPerGame ?? -1) - (a.gainPerGame ?? -1),
  );
}

/** "Where am I weak?" for a roster: ranked High → Low. */
export function findWeaknesses(roster: RosterInput, universe: Universe, settings: LeagueSettings): Weakness[] {
  const model = leagueModel(universe, settings);
  const { players } = resolveRoster(roster, model);
  return weaknessesFor(players, model);
}
