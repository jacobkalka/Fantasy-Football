/** Small shared pieces of UI. */
export { Skeleton } from "./States";

export function LiveDot({ className = "" }: { className?: string }) {
  return (
    <span
      className={`live-dot inline-block size-2 shrink-0 rounded-full bg-current ${className}`}
      aria-hidden="true"
    />
  );
}

/** A section's heading inside a screen: sentence case, 16px, with an optional action on the right. */
export function SectionLabel({
  children,
  action,
  className = "",
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 pb-3 ${className}`}>
      <h2 className="text-[16px] leading-6 font-semibold">{children}</h2>
      {action}
    </div>
  );
}

/**
 * The screen's title (its one h1) with an optional line under it that says something
 * about the data (the week, the finding), and optional actions on the right.
 */
export function PageTitle({
  children,
  kicker,
  sub,
  actions,
}: {
  children: React.ReactNode;
  /** Older name for `sub`. */
  kicker?: React.ReactNode;
  sub?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const line = sub ?? kicker;
  return (
    <div className="flex items-end justify-between gap-4 pt-2 pb-5 lg:pt-6">
      <div className="min-w-0">
        <h1 className="text-[24px] leading-8 font-semibold tracking-[-0.015em] lg:text-[28px] lg:leading-9">
          {children}
        </h1>
        {line && <p className="mt-1 text-[14px] leading-5 text-muted">{line}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/** A friendly message for empty or broken states, never a blank screen. */
export function Notice({
  title,
  children,
  tone = "info",
}: {
  title: string;
  children?: React.ReactNode;
  tone?: "info" | "warn";
}) {
  return (
    <div className="card flex flex-col gap-1 p-5">
      <p className={`text-[15px] leading-6 font-medium ${tone === "warn" ? "text-warning" : "text-ink"}`}>{title}</p>
      {children && <div className="text-[14px] leading-5 text-muted">{children}</div>}
    </div>
  );
}
