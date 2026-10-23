import { INJURY_LABEL } from "@/lib/live/statline";

/** "Q", "O", "IR"… as a small amber or red pill, with the full word for screen readers. */
export function InjuryBadge({ status, long = false }: { status?: string; long?: boolean }) {
  const label = status ? INJURY_LABEL[status] : undefined;
  if (!label) return null;
  return (
    <span
      className={`inline-flex h-[18px] shrink-0 items-center rounded-full px-1.5 text-[11px] leading-none font-semibold ${
        label.tone === "bad" ? "bg-negative-soft text-negative" : "bg-warning-soft text-warning"
      }`}
      title={label.long}
    >
      {long ? label.long : label.short}
      {!long && <span className="sr-only"> ({label.long})</span>}
    </span>
  );
}
