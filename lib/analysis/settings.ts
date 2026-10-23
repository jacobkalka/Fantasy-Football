/**
 * League settings for the analysis engine: how many teams, how points are scored, and
 * which lineup slots each team starts. Defaults match lib/roster/lineup.ts (ESPN's default
 * lineup: QB, 2 RB, 2 WR, TE, FLEX, K, D/ST, and the rest of a 16-man roster on the bench).
 */
import type { Position } from "@/lib/providers/types";
import { canFill, MAX_ROSTER, STARTING_SLOTS, type Slot } from "@/lib/roster/lineup";
import { SCORING_FORMATS, type ScoringFormat } from "@/lib/scoring";

export type StartingSlot = Exclude<Slot, "BENCH">;

/** Same sizes as the app's league-size setting (lib/settings/store.ts). */
export const LEAGUE_SIZES = [8, 10, 12, 14, 16] as const;
export type LeagueSize = (typeof LEAGUE_SIZES)[number];

export const POSITIONS: readonly Position[] = ["QB", "RB", "WR", "TE", "K", "DST"];
/** Lineup order, as the Team screen shows it. */
export const SLOT_ORDER: readonly StartingSlot[] = ["QB", "RB", "WR", "TE", "FLEX", "K", "DST"];

export interface LeagueSettings {
  teams: LeagueSize;
  format: ScoringFormat;
  /** Starting slots per team. */
  slots: Readonly<Record<StartingSlot, number>>;
  /** Bench spots per team. */
  bench: number;
}

function defaultSlots(): Record<StartingSlot, number> {
  const slots = { QB: 0, RB: 0, WR: 0, TE: 0, FLEX: 0, K: 0, DST: 0 };
  for (const slot of STARTING_SLOTS) slots[slot] += 1;
  return slots;
}

export const DEFAULT_LEAGUE: Readonly<LeagueSettings> = Object.freeze({
  teams: 12,
  format: "ppr",
  slots: Object.freeze(defaultSlots()),
  bench: MAX_ROSTER - STARTING_SLOTS.length,
});

/** Fills in anything missing and fixes impossible values, so analysis never sees nonsense. */
export function leagueSettings(partial: Partial<LeagueSettings> = {}): LeagueSettings {
  const teams = (LEAGUE_SIZES as readonly number[]).includes(partial.teams ?? -1)
    ? (partial.teams as LeagueSize)
    : DEFAULT_LEAGUE.teams;
  const format = (SCORING_FORMATS as readonly string[]).includes(partial.format ?? "")
    ? (partial.format as ScoringFormat)
    : DEFAULT_LEAGUE.format;
  const slots = { ...DEFAULT_LEAGUE.slots };
  for (const slot of SLOT_ORDER) {
    const n = partial.slots?.[slot];
    if (typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 4) slots[slot] = n;
  }
  const bench =
    typeof partial.bench === "number" && Number.isInteger(partial.bench) && partial.bench >= 0 && partial.bench <= 15
      ? partial.bench
      : DEFAULT_LEAGUE.bench;
  return { teams, format, slots, bench };
}

/** Every starting slot, in lineup order (RB, RB for two running backs). */
export function slotList(settings: LeagueSettings): StartingSlot[] {
  return SLOT_ORDER.flatMap((slot) => Array<StartingSlot>(settings.slots[slot]).fill(slot));
}

export function starterCount(settings: LeagueSettings): number {
  return slotList(settings).length;
}

export function rosterSize(settings: LeagueSettings): number {
  return starterCount(settings) + settings.bench;
}

/** About how many players are on a team in the whole league (teams × roster size). */
export function leagueRostered(settings: LeagueSettings): number {
  return settings.teams * rosterSize(settings);
}

export function eligible(slot: StartingSlot, position: Position): boolean {
  return canFill(slot, position);
}

/** "RB", "D/ST", "FLEX (RB/WR/TE)". */
export function slotLabel(slot: StartingSlot | Position): string {
  if (slot === "DST") return "D/ST";
  return slot;
}

/** "running back", "kicker"… for sentences. */
export function positionWord(position: Position | StartingSlot, plural = false): string {
  const words: Record<Position | StartingSlot, [string, string]> = {
    QB: ["quarterback", "quarterbacks"],
    RB: ["running back", "running backs"],
    WR: ["wide receiver", "wide receivers"],
    TE: ["tight end", "tight ends"],
    K: ["kicker", "kickers"],
    DST: ["defense (D/ST)", "defenses (D/ST)"],
    FLEX: ["FLEX player", "FLEX players"],
  };
  return words[position][plural ? 1 : 0];
}

/** "an RB", "a WR", "an RB, WR or TE". */
export function withArticle(label: string): string {
  return `${/^(RB|[AEIOU])/.test(label) ? "an" : "a"} ${label}`;
}
