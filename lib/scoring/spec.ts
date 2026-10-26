/**
 * Which scoring a team uses: one of the three presets, or its league's own rules
 * (DECISIONS.md, "Scoring"). The rules travel to the server as a short, readable query
 * parameter ("passTd:6,rec:0.5") so every endpoint scores a team exactly like its league.
 * They're public league settings, not secrets.
 */
import { isStatKey, type StatKey } from "@/lib/stats";
import { rulesForFormat, SCORING_FORMATS, type ScoringFormat, type ScoringRules } from "./rules";

const MAX_RULES = 90;
const MAX_POINTS = 100;

/** Keep only known stats with sane, non-zero values. null when nothing usable is left. */
export function cleanRules(raw: unknown): ScoringRules | null {
  if (typeof raw !== "object" || raw === null) return null;
  const out: ScoringRules = {};
  let n = 0;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isStatKey(key) || typeof value !== "number" || !Number.isFinite(value)) continue;
    if (Math.abs(value) > MAX_POINTS || value === 0) continue;
    out[key] = value;
    if (++n >= MAX_RULES) break;
  }
  return n > 0 ? out : null;
}

/** "passTd:6,rec:0.5": sorted so the same rules always make the same URL (and share a cache entry). */
export function encodeRules(rules: ScoringRules): string {
  return (Object.entries(rules) as [StatKey, number][])
    .filter(([, v]) => v !== 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${Number(v.toPrecision(6))}`)
    .join(",");
}

export function parseRules(text: string | null | undefined): ScoringRules | null {
  if (!text || text.length > 2000) return null;
  const raw: Record<string, number> = {};
  for (const pair of text.split(",")) {
    const [key, value] = pair.split(":");
    if (key && value !== undefined) raw[key] = Number(value);
  }
  return cleanRules(raw);
}

export interface ScoringSpec {
  format: ScoringFormat;
  /** The league's own rules; null = the format's preset. */
  rules: ScoringRules | null;
}

/** The exact rules to score with. */
export function rulesOf(spec: ScoringSpec): Readonly<ScoringRules> {
  return spec.rules ?? rulesForFormat(spec.format);
}

/** Query string for an endpoint: "format=ppr" or "format=ppr&rules=…". */
export function specQuery(spec: ScoringSpec): string {
  return spec.rules ? `format=${spec.format}&rules=${encodeURIComponent(encodeRules(spec.rules))}` : `format=${spec.format}`;
}

/** Reads `format` and `rules` from a request's query string. */
export function specFromParams(params: URLSearchParams): ScoringSpec {
  const f = params.get("format") as ScoringFormat;
  const format = SCORING_FORMATS.includes(f) ? f : "ppr";
  return { format, rules: parseRules(params.get("rules")) };
}

/** "PPR", "Half PPR", "Standard", or "League scoring (PPR)" for custom rules. */
export function specLabel(spec: ScoringSpec): string {
  const base = { standard: "Standard", half: "Half PPR", ppr: "PPR" }[spec.format];
  return spec.rules ? `League scoring · ${base}` : base;
}

/** The preset whose reception value is closest, for anything that only understands presets. */
export function nearestFormat(rules: ScoringRules | null, fallback: ScoringFormat = "ppr"): ScoringFormat {
  if (!rules) return fallback;
  const rec = rules.rec ?? 0;
  return rec >= 0.75 ? "ppr" : rec >= 0.25 ? "half" : "standard";
}
