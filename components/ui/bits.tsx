/** Small shared pieces of UI. */

export function LiveDot({ className = "" }: { className?: string }) {
  return (
    <span
      className={`live-dot inline-block size-2 shrink-0 rounded-full bg-current ${className}`}
      aria-hidden="true"
    />
  );
}

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
    <div
      className={`flex items-center justify-between px-1 pb-2 font-mono text-[11px] tracking-[0.1em] text-muted uppercase ${className}`}
    >
      <h2>{children}</h2>
      {action}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton rounded-xl ${className}`} aria-hidden="true" />;
}

export function PageTitle({ children, kicker }: { children: React.ReactNode; kicker?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 px-1 pt-2 pb-4">
      {kicker && (
        <p className="font-mono text-[11px] tracking-[0.12em] text-gain uppercase">{kicker}</p>
      )}
      <h1 className="font-display text-5xl leading-[0.9] font-bold tracking-wide uppercase text-ink-strong [text-shadow:0_2px_24px_rgb(200_255_46/0.15)]">
        {children}
      </h1>
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
    <div className="glass flex flex-col gap-1.5 p-5">
      <p
        className={`font-mono text-[11px] tracking-[0.1em] uppercase ${tone === "warn" ? "text-alert" : "text-sky"}`}
      >
        {title}
      </p>
      {children && <div className="text-[15px] leading-relaxed text-ink-soft">{children}</div>}
    </div>
  );
}
