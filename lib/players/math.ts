/** Small number helpers for player research. Pure. */
import type { Metric } from "./types";

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

export function mean(values: number[]): number | null {
  return values.length ? sum(values) / values.length : null;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Population standard deviation: how far a typical week sits from his average. */
export function stdDev(values: number[]): number | null {
  const m = mean(values);
  if (m === null) return null;
  return Math.sqrt(sum(values.map((v) => (v - m) ** 2)) / values.length);
}

/** a ÷ b, or null when b is 0 (no volume, no rate). */
export function ratio(a: number, b: number): number | null {
  return b > 0 ? a / b : null;
}

/** Rounds for storage, never returning -0. */
export function round(value: number, digits = 1): number {
  const f = 10 ** digits;
  const r = Math.round(value * f) / f;
  return Object.is(r, -0) ? 0 : r;
}

/** "8.1", or "—" when unknown. */
export function fixed(value: number | null, digits = 1): string {
  return value === null ? "—" : round(value, digits).toFixed(digits);
}

/** 0.643 -> "64%" (or "6.4%" with digits = 1). */
export function percent(value: number | null, digits = 0): string {
  return value === null ? "—" : `${round(value * 100, digits).toFixed(digits)}%`;
}

export function metric(id: string, label: string, value: number | null, display: string, basis?: string): Metric {
  return basis ? { id, label, value: value === null ? null : round(value, 3), display, basis } : { id, label, value: value === null ? null : round(value, 3), display };
}

const ORDINALS = ["th", "st", "nd", "rd"];
/** 1 -> "1st", 22 -> "22nd", 13 -> "13th". */
export function ordinal(n: number): string {
  const v = n % 100;
  return `${n}${ORDINALS[(v - 20) % 10] ?? ORDINALS[v] ?? ORDINALS[0]}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-11-25T00:00:00.000+00:00" -> "Nov 25" (the date as written, no time-zone shift). */
export function shortDate(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}` : null;
}
