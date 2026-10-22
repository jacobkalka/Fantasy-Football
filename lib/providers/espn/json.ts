/**
 * Safe readers for ESPN's JSON. ESPN's API is unofficial and fields come and go,
 * so we never assume a field exists: every read falls back to a sensible empty value.
 */

export type Json = unknown;

export function obj(value: Json): Record<string, Json> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Json>)
    : {};
}

export function arr(value: Json): Json[] {
  return Array.isArray(value) ? value : [];
}

export function str(value: Json, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return fallback;
}

export function num(value: Json, fallback = 0): number {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

export function bool(value: Json): boolean {
  return value === true;
}

/** Follow a path like get(data, "status", "type", "state"). */
export function get(value: Json, ...path: (string | number)[]): Json {
  let current: Json = value;
  for (const key of path) {
    if (typeof key === "number") current = arr(current)[key];
    else current = obj(current)[key];
    if (current === undefined) return undefined;
  }
  return current;
}

/** ESPN colors come as "e31837"; CSS wants "#e31837". */
export function hexColor(value: Json, fallback = "#5a6570"): string {
  const s = str(value).replace(/^#/, "");
  return /^[0-9a-f]{6}$/i.test(s) ? `#${s.toLowerCase()}` : fallback;
}

/** Pull the numeric id out of an ESPN "$ref" link like ".../athletes/4432577?lang=en". */
export function idFromRef(ref: Json, kind: string): string | undefined {
  const match = str(ref).match(new RegExp(`/${kind}/(-?\\d+)`));
  return match?.[1];
}
