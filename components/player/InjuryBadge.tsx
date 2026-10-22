import { INJURY_LABEL } from "@/lib/live/statline";

/** "Q", "O", "IR"... in amber or red, with the full word for screen readers. */
export function InjuryBadge({ status, long = false }: { status?: string; long?: boolean }) {
  const label = status ? INJURY_LABEL[status] : undefined;
  if (!label) return null;
  return (
    <span
      className={`inline-flex items-center rounded-md px-1.5 py-px font-mono text-[10px] font-bold tracking-wide ring-1 ${
        label.tone === "bad" ? "bg-redzone/15 text-redzone ring-redzone/40" : "bg-alert/15 text-alert ring-alert/40"
      }`}
      title={label.long}
    >
      {long ? label.long : label.short}
      {!long && <span className="sr-only"> ({label.long})</span>}
    </span>
  );
}
