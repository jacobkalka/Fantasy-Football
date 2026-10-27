import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card mt-6 flex flex-col items-start gap-3 p-6">
      <p className="text-[12px] text-muted">404</p>
      <h1 className="text-[28px] leading-9 font-semibold">Out of bounds</h1>
      <p className="text-[15px] leading-relaxed text-muted">That page doesn&apos;t exist.</p>
      <Link
        href="/"
        className="pressable inline-flex h-11 items-center rounded-full bg-ink px-5 text-[15px] font-medium text-black"
      >
        Back to my team
      </Link>
    </div>
  );
}
