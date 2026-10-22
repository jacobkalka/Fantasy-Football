/** Placeholder for a screen that hasn't been built yet: says what it will do and when. */
export function ComingUp({
  title,
  phase,
  children,
}: {
  title: string;
  phase: number;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h1 className="font-display text-5xl leading-none font-bold tracking-wide uppercase">
        {title}
      </h1>
      <div className="flex flex-col gap-2 border border-line bg-panel p-4">
        <p className="font-mono text-[11px] tracking-[0.08em] text-gain uppercase">
          Arrives in phase {phase}
        </p>
        <div className="flex flex-col gap-2 text-[15px] leading-relaxed text-ink-soft">
          {children}
        </div>
      </div>
    </section>
  );
}
