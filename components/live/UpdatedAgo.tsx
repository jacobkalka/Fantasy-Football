"use client";

import { LiveDot } from "@/components/ui/bits";
import { agoLabel } from "@/lib/format";
import { useNow } from "@/lib/hooks/useNow";

/** "● Updated 6s ago", turning amber with "Data delayed" when the feed stalls. */
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
      className={`inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.08em] uppercase ${
        stale ? "text-alert" : live ? "text-gain" : "text-muted"
      }`}
      aria-live="polite"
    >
      {live && <LiveDot />}
      {stale ? "Data delayed · " : "Updated "}
      {now && fetchedAt ? agoLabel(age) : "just now"}
    </span>
  );
}
