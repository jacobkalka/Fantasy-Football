/** Reading and checking /api/startsit's query string. Pure, so it's easy to test. */
import { SCORING_FORMATS, type ScoringFormat } from "@/lib/scoring";

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;

export type StartSitQuery =
  | { ok: true; ids: string[]; format: ScoringFormat; explain: boolean }
  | { ok: false; error: string };

/** `?ids=4362628,4426515&format=ppr[&explain=1]` */
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
  return { ok: true, ids, format, explain: params.get("explain") === "1" };
}
