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
      <h1 className="text-5xl leading-none font-bold">
        {title}
      </h1>
      <div className="flex flex-col gap-2 border border-line bg-panel p-4">
        <p className="text-[12px] text-gain">
          Arrives in phase {phase}
        </p>
        <div className="flex flex-col gap-2 text-[15px] leading-relaxed text-ink-soft">
          {children}
        </div>
      </div>
    </section>
  );
}
