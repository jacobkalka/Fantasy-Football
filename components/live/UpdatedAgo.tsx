"use client";

import { LiveDot } from "@/components/ui/bits";
import { agoLabel } from "@/lib/format";
import { useNow } from "@/lib/hooks/useNow";
import { useOnline } from "@/lib/hooks/useOnline";
import { dataAgeMs, freshness, type Stamps } from "@/lib/sync/freshness";

/**
 * "● Live · Updated 8s ago". Says "Delayed" only with evidence: games are live and the newest
 * data is genuinely old (lib/sync/freshness.ts). Offline says offline.
 */
export function UpdatedAgo({
  stamps,
  receivedAt,
  live,
  error = null,
  className = "",
}: {
  stamps?: Stamps;
  receivedAt: number;
  live?: boolean;
  error?: string | null;
  className?: string;
}) {
  const now = useNow(1000);
  const online = useOnline();
  const age = dataAgeMs(stamps, receivedAt, now);
  const status = freshness({ hasData: receivedAt > 0, ageMs: age, live: Boolean(live), error, online });
  const ago = age === null ? "just now" : agoLabel(age);
  const tone =
    status === "live"
      ? "text-live"
      : status === "delayed" || status === "error"
        ? "text-warning"
        : status === "offline"
          ? "text-muted"
          : "text-faint";
  const text =
    status === "live"
      ? `Live · Updated ${ago}`
      : status === "delayed"
        ? `Delayed · Last updated ${ago}`
        : status === "offline"
          ? `Offline · Last updated ${ago}`
          : status === "loading"
            ? "Loading…"
            : status === "error"
              ? "Can't reach ESPN"
              : `Updated ${ago}`;
  return (
    <span
      className={`tabular inline-flex items-center gap-1.5 text-[12px] font-medium ${tone} ${className}`}
      role="status"
      aria-live="polite"
      data-status={status}
    >
      {(status === "live" || status === "delayed") && <LiveDot />}
      {now ? text : status === "loading" ? "Loading…" : "Updated just now"}
    </span>
  );
}
