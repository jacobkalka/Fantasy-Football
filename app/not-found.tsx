import Link from "next/link";

export default function NotFound() {
  return (
    <div className="glass mt-6 flex flex-col items-start gap-3 p-6">
      <p className="font-mono text-[11px] tracking-[0.1em] text-muted uppercase">404</p>
      <h1 className="font-display text-4xl leading-none font-bold tracking-wide uppercase">Out of bounds</h1>
      <p className="text-[15px] leading-relaxed text-ink-soft">That page doesn&apos;t exist.</p>
      <Link
        href="/"
        className="glass-gain pressable rounded-xl px-5 py-2.5 font-mono text-[12px] font-bold tracking-[0.1em] text-gain uppercase"
      >
        Back to my team
      </Link>
    </div>
  );
}
