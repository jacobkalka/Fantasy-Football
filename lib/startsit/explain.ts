/**
 * The optional AI explanation: what we send to Claude, and how we check what comes
 * back. The math has already decided; Claude only puts it into friendly words.
 * Pure (no network), so it's tested in explain.test.ts. The call itself is in ai.ts.
 */
import { roundPoints } from "@/lib/scoring";
import { shortName } from "./model";
import type { Confidence, StartSitResult } from "./types";

/** Exactly the facts Claude may use. No ids, no timestamps: identical decisions share one cached explanation. */
export interface ExplainPayload {
  week: number;
  scoring: string;
  pick: string;
  over: string;
  confidence: Confidence;
  chancePercent: number;
  players: {
    name: string;
    position: string;
    team: string | null;
    opponent: string | null;
    home: boolean | null;
    status: "playing" | "bye" | "no game" | "out";
    espnProjection: number | null;
    modelScore: number;
    floor: number;
    ceiling: number;
    injury: string | null;
  }[];
  reasons: string[];
  notes: string[];
}

const SCORING: Record<StartSitResult["format"], string> = { standard: "standard", half: "half-PPR", ppr: "PPR" };
const STATUS = { bye: "bye", "no-game": "no game", out: "out" } as const;
const one = (n: number) => roundPoints(n, 1);

/** Null when there's nothing to explain (no recommendation). */
export function explainPayload(result: StartSitResult): ExplainPayload | null {
  const rec = result.recommendation;
  if (!rec) return null;
  const byId = new Map(result.players.map((p) => [p.playerId, p]));
  const pick = byId.get(rec.startId);
  const over = byId.get(rec.overId);
  if (!pick || !over) return null;
  return {
    week: result.week,
    scoring: SCORING[result.format],
    pick: pick.name,
    over: over.name,
    confidence: rec.confidence,
    chancePercent: Math.round(rec.chance * 100),
    players: result.players.map((p) => ({
      name: p.name,
      position: p.position,
      team: p.teamAbbr,
      opponent: p.game?.opponentAbbr ?? null,
      home: p.game ? p.game.isHome : null,
      status: p.unavailable ? STATUS[p.unavailable] : "playing",
      espnProjection: p.projection === null ? null : one(p.projection),
      modelScore: one(p.score),
      floor: one(p.floor),
      ceiling: one(p.ceiling),
      injury: p.injuryStatus && p.injuryStatus !== "ACTIVE" ? p.injuryStatus.toLowerCase().replace(/_/g, " ") : null,
    })),
    reasons: rec.reasons.map((r) => r.text),
    notes: rec.notes,
  };
}

export const SYSTEM_PROMPT = [
  "You explain a fantasy football start/sit decision to a casual fan who is new to fantasy football.",
  "A rules-based model has already made the decision. Your only job is to explain it.",
  "Rules:",
  '- Write 2 or 3 short, friendly sentences in plain English. No lists, headings, markdown or emoji.',
  '- Recommend starting the player named in "pick" and no one else.',
  "- Use only the facts in the JSON. Copy any number exactly as it is written there. Don't calculate new numbers, percentages or stats, and don't mention injuries, weather, news or history that the JSON doesn't contain.",
  "- Say the confidence level (Lean, Solid or Strong). If it is Lean, say it's a close call.",
].join("\n");

export function userPrompt(payload: ExplainPayload): string {
  return `Explain this decision:\n<decision>\n${JSON.stringify(payload, null, 1)}\n</decision>`;
}

const NUMBER = /\d+(?:\.\d+)?/g;

/**
 * True when every number in Claude's text also appears in the facts we sent
 * (so it can't slip in a made-up stat) and it names the right player.
 */
export function isGrounded(text: string, payload: ExplainPayload): boolean {
  const allowed = new Set((JSON.stringify(payload).match(NUMBER) ?? []).map(Number));
  const used = (text.match(NUMBER) ?? []).map(Number);
  if (!used.every((n) => allowed.has(n))) return false;
  const lastName = payload.pick.trim().split(/\s+/).slice(1).join(" ") || payload.pick;
  return text.includes(lastName) || text.includes(shortName(payload.pick));
}

/** Pulls the answer out of a Messages API response body; null if it isn't a clean, finished answer. */
export function readClaudeText(body: unknown): string | null {
  const message = body as { stop_reason?: string; content?: { type?: string; text?: string }[] } | null;
  // "refusal", "max_tokens" and anything unexpected all fall back to the rules-based reasons.
  if (!message || message.stop_reason !== "end_turn" || !Array.isArray(message.content)) return null;
  const text = message.content
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("")
    .trim();
  return text && text.length <= 700 ? text : null;
}
