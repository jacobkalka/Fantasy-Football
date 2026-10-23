/**
 * Team links: your roster packed into a URL so you can open it on another phone or
 * browser without an account (every website address keeps its own saved data, so a
 * team saved on one device or address doesn't appear on another by itself).
 * Only player ids, slots, the name and the scoring go in the link; names and photos
 * are looked up again when it's opened.
 */
import type { ScoringFormat } from "@/lib/scoring";
import type { Roster, Slot } from "./lineup";

const SLOTS: Slot[] = ["QB", "RB", "WR", "TE", "FLEX", "K", "DST", "BENCH"];
const FORMATS: ScoringFormat[] = ["standard", "half", "ppr"];

export interface SharedTeam {
  name: string;
  format: ScoringFormat;
  players: { playerId: string; slot: Slot }[];
}

function toBase64Url(text: string) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(code: string) {
  const binary = atob(code.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

export function encodeTeam(roster: Roster): string {
  return toBase64Url(
    JSON.stringify({
      v: 1,
      n: roster.name,
      f: FORMATS.indexOf(roster.format),
      p: roster.players.map((p) => [p.playerId, SLOTS.indexOf(p.slot)]),
    }),
  );
}

/** Null if the code is damaged or from a version we don't understand. */
export function decodeTeam(code: string): SharedTeam | null {
  try {
    const raw = JSON.parse(fromBase64Url(code)) as { v?: number; n?: unknown; f?: unknown; p?: unknown };
    if (raw.v !== 1 || !Array.isArray(raw.p)) return null;
    const players = raw.p
      .filter((x): x is [string, number] => Array.isArray(x) && typeof x[0] === "string" && typeof x[1] === "number")
      .slice(0, 16)
      .map(([playerId, slot]) => ({ playerId, slot: SLOTS[slot] ?? "BENCH" }));
    return {
      name: typeof raw.n === "string" ? raw.n.slice(0, 40) : "My Team",
      format: FORMATS[typeof raw.f === "number" ? raw.f : 2] ?? "ppr",
      players,
    };
  } catch {
    return null;
  }
}
