import Link from "next/link";

export default function NotFound() {
  return (
    <div className="glass mt-6 flex flex-col items-start gap-3 p-6">
      <p className="text-[12px] text-muted">404</p>
      <h1 className="text-[28px] leading-9 font-semibold">Out of bounds</h1>
      <p className="text-[15px] leading-relaxed text-ink-soft">That page doesn&apos;t exist.</p>
      <Link
        href="/"
        className="glass-gain pressable rounded-xl px-5 py-2.5 text-[12px] font-bold text-gain"
      >
        Back to my team
      </Link>
    </div>
  );
}
