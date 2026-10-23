"use client";

import { LiveDot } from "@/components/ui/bits";
import { agoLabel } from "@/lib/format";
import { useNow } from "@/lib/hooks/useNow";

/** "● Live · updated 6s ago", turning amber with "Data delayed" when the feed stalls. */
export function UpdatedAgo({
  fetchedAt,
  delayed,
  live,
}: {
  fetchedAt?: string;
  delayed?: boolean;
  live?: boolean;
}) {
  const now = useNow(1000);
  const age = fetchedAt && now ? now - new Date(fetchedAt).getTime() : 0;
  const stale = delayed || (live && age > 60_000);
  return (
    <span
      className={`tabular inline-flex items-center gap-1.5 text-[12px] ${ stale ? "text-warning" : live ? "text-positive" : "text-faint" }`}
      aria-live="polite"
    >
      {live && !stale && <LiveDot />}
      {stale ? "Data delayed · " : live ? "Live · updated " : "Updated "}
      {now && fetchedAt ? agoLabel(age) : "just now"}
    </span>
  );
}
