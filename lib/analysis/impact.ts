/**
 * "Would this player improve my team?": adds him to your roster (dropping the player your team
 * misses least if you're full), then compares your team rating and best lineups before and after.
 * For a player already on your team, it shows what he's worth to you instead.
 */
import { fmt, signed, xppg } from "./metrics";
import { leagueModel } from "./model";
import { applyMove, brief, type PlayerBrief } from "./moves";
import { listNames, ratePlayers, statusWord, teamCore } from "./rating";
import { resolveRoster, type RosterInput } from "./roster";
import { round1 } from "./scale";
import { slotLabel, type LeagueSettings, type StartingSlot } from "./settings";
import { NEUTRAL_BAND } from "./trade";
import type { Universe } from "./universe";

export interface PlayerImpact {
  /** Null when the id isn't in ESPN's player list. */
  player: PlayerBrief | null;
  onRoster: boolean;
  /** Where he'd play: best rest-of-season lineup and this week's. */
  spot: { restOfSeason: StartingSlot | "BENCH"; thisWeek: StartingSlot | "BENCH" } | null;
  /** Who he'd push out of your best lineup. */
  replaces: PlayerBrief | null;
  /** Who you'd drop to make room. */
  drop: PlayerBrief | null;
  ratingBefore: number;
  ratingAfter: number;
  ratingChange: number;
  verdict: "improves" | "no real change" | "weakens";
  /** One-sentence answer. */
  answer: string;
  why: string[];
}

export function playerImpact(
  playerId: string,
  roster: RosterInput,
  universe: Universe,
  settings: LeagueSettings,
): PlayerImpact {
  const model = leagueModel(universe, settings);
  const { players } = resolveRoster(roster, model);
  const base = teamCore(players, model);
  const before = round1(base.overall);
  const player = model.byId.get(playerId);
  if (!player) {
    return {
      player: null,
      onRoster: false,
      spot: null,
      replaces: null,
      drop: null,
      ratingBefore: before,
      ratingAfter: before,
      ratingChange: 0,
      verdict: "no real change",
      answer: "We don't have ESPN projections for this player, so we can't tell.",
      why: ["He isn't among ESPN's 650 most-rostered players."],
    };
  }
  const onRoster = players.some((p) => p.id === playerId);
  const move = onRoster ? null : applyMove(players, [player], [], model);
  const withHim = move ? move.players : players;
  const withoutHim = players.filter((p) => p.id !== playerId);
  const afterCore = move ? move.core : teamCore(withoutHim, model);
  const rating = ratePlayers(withHim, model);
  const rosSpot = rating.restOfSeason.lineup.starters.find((s) => s.player?.id === playerId)?.slot ?? "BENCH";
  const weekSpot = rating.thisWeek.lineup.starters.find((s) => s.player?.id === playerId)?.slot ?? "BENCH";
  const reference = onRoster ? afterCore : base; // lineup without him
  const withCore = onRoster ? base : afterCore;
  const inLineup = new Set(withCore.lineup.map((s) => s.player?.id));
  const replaced = reference.lineup.find((s) => s.player && !inLineup.has(s.player.id) && s.player.id !== playerId)?.player ?? null;

  const why: string[] = [];
  const ppg = `${fmt(xppg(player))} pts/game rest of season`;
  const word = statusWord(player);
  if (onRoster) {
    const cost = round1(base.overall - afterCore.overall);
    why.push(`He projects ${ppg}.`);
    why.push(
      rosSpot === "BENCH"
        ? `He's on your bench in your best lineup; without him your rating would change by ${signed(-cost)}.`
        : `He starts for you at ${slotLabel(rosSpot)}. Without him your rating would drop ${fmt(cost)} points${replaced ? ` and ${replaced.name} would start instead` : ""}.`,
    );
    if (word) why.push(`He's ${word}.`);
    return {
      player: brief(player, model),
      onRoster: true,
      spot: { restOfSeason: rosSpot, thisWeek: weekSpot },
      replaces: null,
      drop: null,
      ratingBefore: before,
      ratingAfter: before,
      ratingChange: 0,
      verdict: "no real change",
      answer: `He's already on your team (worth ${fmt(cost)} rating points to you).`,
      why,
    };
  }

  const change = round1(afterCore.overall - base.overall);
  const verdict = change >= NEUTRAL_BAND ? "improves" : change <= -NEUTRAL_BAND ? "weakens" : "no real change";
  why.push(`He projects ${ppg}.`);
  if (rosSpot === "BENCH") {
    why.push(`He wouldn't crack your best lineup: your starters who could play there project more.`);
  } else {
    why.push(`He'd start at ${slotLabel(rosSpot)}${replaced ? ` instead of ${replaced.name} (${fmt(xppg(replaced))})` : ""}.`);
  }
  if (weekSpot !== "BENCH") why.push(`This week he'd start at ${slotLabel(weekSpot)}.`);
  if (move?.dropped.length) why.push(`Your roster is full, so you'd drop ${listNames(move.dropped.map((p) => p.name))} (the player your team misses least).`);
  if (word) why.push(`He's ${word}.`);
  const depthBefore = base.depthScore;
  const depthAfter = afterCore.depthScore;
  if (depthBefore !== null && depthAfter !== null && Math.abs(depthAfter - depthBefore) >= 3) {
    why.push(`Depth ${depthAfter > depthBefore ? "improves" : "drops"}: ${Math.round(depthBefore)} → ${Math.round(depthAfter)}.`);
  }
  const answer =
    verdict === "improves"
      ? `Yes: your team rating goes ${before} → ${round1(afterCore.overall)} (${signed(change)}).`
      : verdict === "weakens"
        ? `No: your team rating would drop ${before} → ${round1(afterCore.overall)}.`
        : `Barely: your team rating would go ${before} → ${round1(afterCore.overall)} (${signed(change)}).`;
  return {
    player: brief(player, model),
    onRoster: false,
    spot: { restOfSeason: rosSpot, thisWeek: weekSpot },
    replaces: replaced ? brief(replaced, model) : null,
    drop: move?.dropped[0] ? brief(move.dropped[0], model) : null,
    ratingBefore: before,
    ratingAfter: round1(afterCore.overall),
    ratingChange: change,
    verdict,
    answer,
    why,
  };
}
