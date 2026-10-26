/** Formatting helpers shared by the screens. */

export function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** "Q3", "OT", "2OT". */
export function periodLabel(period: number) {
  if (period <= 0) return "";
  if (period <= 4) return `Q${period}`;
  return period === 5 ? "OT" : `${period - 4}OT`;
}

/** "Sun 1:00 PM" in the viewer's own time zone. */
export function kickoffLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
}

/** "Sunday, Oct 25" in the viewer's own time zone. */
export function dayLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

/** "6s ago", "3m ago", "2h ago". */
export function agoLabel(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

/**
 * Fantasy points for display: two decimals ("12.47"). Points are kept exact (to the cent) in
 * the data layer and only formatted here, so every screen shows the same number.
 */
export function pts(value: number | null | undefined, empty = "–"): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return empty;
  return (Math.abs(value) < 0.005 ? 0 : value).toFixed(2);
}

/** Signed points: "+3.20", "−1.04", "0.00". */
export function signedPts(value: number): string {
  if (Math.abs(value) < 0.005) return "0.00";
  return `${value > 0 ? "+" : "−"}${Math.abs(value).toFixed(2)}`;
}

/** "WR5", "D/ST3". */
export function posRank(position: string, rank: number | null | undefined): string {
  if (!rank) return "–";
  return `${position === "DST" ? "D/ST" : position}${rank}`;
}

/** "52%" from 0-1. */
export function pct(share: number | null | undefined): string {
  return share === null || share === undefined ? "–" : `${Math.round(share * 100)}%`;
}
