/** Reading and checking /api/startsit's query string. Pure, so it's easy to test. */
import { SCORING_FORMATS, type ScoringFormat, type ScoringRules } from "@/lib/scoring";
import { parseRules } from "@/lib/scoring/spec";

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;

export type StartSitQuery =
  | { ok: true; ids: string[]; format: ScoringFormat; rules: ScoringRules | null; explain: boolean }
  | { ok: false; error: string };

/** `?ids=4362628,4426515&format=ppr[&rules=…][&explain=1]` (rules: a league's own scoring, lib/scoring/spec.ts) */
export function parseStartSitQuery(params: URLSearchParams): StartSitQuery {
  const raw = (params.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (raw.some((id) => !/^\d{1,12}$/.test(id))) {
    return { ok: false, error: "Player ids must be numbers (kickers and defenses aren't supported yet)." };
  }
  const ids = [...new Set(raw)];
  if (ids.length < MIN_PLAYERS) return { ok: false, error: "Pick at least two different players to compare." };
  if (ids.length > MAX_PLAYERS) return { ok: false, error: `Compare at most ${MAX_PLAYERS} players at a time.` };

  const formatParam = params.get("format");
  if (formatParam !== null && !(SCORING_FORMATS as readonly string[]).includes(formatParam)) {
    return { ok: false, error: "Scoring format must be standard, half or ppr." };
  }
  const format = (formatParam ?? "ppr") as ScoringFormat;
  return { ok: true, ids, format, rules: parseRules(params.get("rules")), explain: params.get("explain") === "1" };
}
