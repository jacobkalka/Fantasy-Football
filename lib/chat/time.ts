/** Time labels for chat messages, in the viewer's own time zone. */

/** "3:41 PM" */
export function messageTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** A key that's the same for every message sent on the same local day. */
export function dayKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

/** "Today", "Yesterday", or "Sun, Oct 25". */
export function dayLabel(iso: string, now: Date): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(date)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/** Messages from the same person within this window are grouped under one name. */
export const GROUP_WINDOW_MS = 5 * 60_000;

/** "just now", "5 min ago", "3 h ago", "Yesterday", "Oct 12": how long since, for list rows and thread summaries. */
export function sinceLabel(iso: string, now: number): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then) || !now) return "";
  const minutes = Math.floor((now - then) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  if (hours < 48) return "Yesterday";
  return new Date(then).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** The same, shorter, for the right edge of a list row: "now", "5m", "3h", "2d". */
export function shortSince(iso: string | null, now: number): string {
  if (!iso || !now) return "";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const minutes = Math.floor((now - then) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
