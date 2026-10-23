/**
 * "What should I do right now?": lineup problems you can still fix this week, from the
 * live data the Lineup screen already has (games, byes, injuries, ESPN projections).
 * Only games that haven't started count: a locked spot can't be changed.
 * Pure, so it's tested in decisions.test.ts.
 */
import type { PlayerLive } from "@/lib/live/types";
import { canFill, STARTING_SLOTS, type RosterPlayer, type Slot } from "@/lib/roster/lineup";

export type Urgency = "high" | "medium" | "low";

export interface Decision {
  id: string;
  urgency: Urgency;
  title: string;
  detail: string;
  /** Players to compare in Start/Sit, when a comparison helps. */
  compare?: string[];
}

const SLOT_NAME: Partial<Record<Slot, string>> = { DST: "D/ST", FLEX: "FLEX spot" };
const OUT = new Set(["OUT", "INJURY_RESERVE", "SUSPENSION"]);
/** Smallest projected gain worth bothering someone about. */
const MIN_GAIN = 1.5;

function last(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(" ")}` : name;
}

/** Still changeable: no game yet, or the game hasn't kicked off. Byes count (you can swap them out). */
function open(live?: PlayerLive) {
  return !live?.game || live.game.state === "pre";
}

export function lineupDecisions(roster: RosterPlayer[], live: Map<string, PlayerLive>): Decision[] {
  const decisions: Decision[] = [];
  const starters = roster.filter((p) => p.slot !== "BENCH");
  const bench = roster.filter((p) => p.slot === "BENCH");

  /** Best bench player who could fill `slot` and can still be moved, by projection. */
  const bestBenchFor = (slot: Slot) =>
    bench
      .filter((p) => canFill(slot, p.position) && open(live.get(p.playerId)))
      .map((p) => ({ p, live: live.get(p.playerId) }))
      .filter(({ live: l }) => l && !l.onBye && l.game && !OUT.has(l.injuryStatus ?? ""))
      .sort((a, b) => (b.live?.projection ?? -1) - (a.live?.projection ?? -1))[0];

  // Empty starting spots.
  const filled: Partial<Record<Slot, number>> = {};
  for (const s of starters) filled[s.slot] = (filled[s.slot] ?? 0) + 1;
  const needed: Partial<Record<Slot, number>> = {};
  for (const slot of STARTING_SLOTS) needed[slot] = (needed[slot] ?? 0) + 1;
  for (const slot of Object.keys(needed) as Slot[]) {
    const missing = (needed[slot] ?? 0) - (filled[slot] ?? 0);
    if (missing <= 0) continue;
    const option = bestBenchFor(slot);
    decisions.push({
      id: `empty-${slot}`,
      urgency: "high",
      title: `Your ${SLOT_NAME[slot] ?? slot} ${missing > 1 ? "spots are" : "spot is"} empty`,
      detail: option
        ? `${last(option.p.name)} on your bench can fill it${option.live?.projection != null ? ` (projected ${option.live.projection.toFixed(1)})` : ""}.`
        : "Add a player who can play there, or you'll score 0 in that spot.",
    });
  }

  const upgrades: { starter: RosterPlayer; starterLive: PlayerLive; bench: RosterPlayer; benchLive: PlayerLive; gain: number }[] = [];
  for (const s of starters) {
    const l = live.get(s.playerId);
    if (!l || !open(l)) continue;
    const option = bestBenchFor(s.slot);
    const swap = option ? ` ${last(option.p.name)} could take the spot${option.live?.projection != null ? ` (projected ${option.live.projection.toFixed(1)})` : ""}.` : "";
    if (l.onBye || !l.game) {
      decisions.push({
        id: `bye-${s.playerId}`,
        urgency: "high",
        title: `${last(s.name)} ${l.onBye ? "is on bye" : "has no game"} this week`,
        detail: `He'll score 0 in your lineup.${swap}`,
        compare: option ? [s.playerId, option.p.playerId] : undefined,
      });
    } else if (OUT.has(l.injuryStatus ?? "")) {
      decisions.push({
        id: `out-${s.playerId}`,
        urgency: "high",
        title: `${last(s.name)} is ruled out`,
        detail: `He won't play this week.${swap}`,
        compare: option ? [s.playerId, option.p.playerId] : undefined,
      });
    } else if (l.injuryStatus === "DOUBTFUL") {
      decisions.push({
        id: `doubtful-${s.playerId}`,
        urgency: "medium",
        title: `${last(s.name)} is doubtful`,
        detail: `Doubtful players usually sit out.${swap}`,
        compare: option ? [s.playerId, option.p.playerId] : undefined,
      });
    } else if (l.injuryStatus === "QUESTIONABLE") {
      decisions.push({
        id: `questionable-${s.playerId}`,
        urgency: "low",
        title: `${last(s.name)} is questionable`,
        detail: "Check his status before kickoff.",
      });
    } else if (l.projection != null) {
      // Upgrade candidates are collected and paired up below (one suggestion per player).
      for (const b of bench) {
        const bl = live.get(b.playerId);
        if (!canFill(s.slot, b.position) || !open(bl) || !bl?.game || bl.onBye || OUT.has(bl.injuryStatus ?? "")) continue;
        if (bl.projection == null) continue;
        const gain = bl.projection - l.projection;
        if (gain >= MIN_GAIN) upgrades.push({ starter: s, starterLive: l, bench: b, benchLive: bl, gain });
      }
    }
  }

  // Greedy pairing: the biggest gain first; each starter and each bench player used once.
  const usedStarters = new Set<string>();
  const usedBench = new Set<string>();
  for (const u of upgrades.sort((a, b) => b.gain - a.gain)) {
    if (usedStarters.has(u.starter.playerId) || usedBench.has(u.bench.playerId)) continue;
    usedStarters.add(u.starter.playerId);
    usedBench.add(u.bench.playerId);
    decisions.push({
      id: `upgrade-${u.starter.playerId}-${u.bench.playerId}`,
      urgency: "medium",
      title: `Consider ${last(u.bench.name)} over ${last(u.starter.name)}`,
      detail: `ESPN projects ${last(u.bench.name)} ${u.gain.toFixed(1)} points higher (${(u.benchLive.projection ?? 0).toFixed(1)} vs ${(u.starterLive.projection ?? 0).toFixed(1)}).`,
      compare: [u.starter.playerId, u.bench.playerId],
    });
  }

  const order: Record<Urgency, number> = { high: 0, medium: 1, low: 2 };
  return decisions.sort((a, b) => order[a.urgency] - order[b.urgency]);
}
