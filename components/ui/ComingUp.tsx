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
      <div className="card flex flex-col gap-2 p-4">
        <p className="text-[13px] text-muted">
          Arrives in phase {phase}
        </p>
        <div className="flex flex-col gap-2 text-[15px] leading-relaxed text-muted">
          {children}
        </div>
      </div>
    </section>
  );
}
