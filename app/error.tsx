"use client";

import { useEffect } from "react";

/** Shown if a screen crashes: a calm message and a retry, never a blank page. */
export default function ErrorScreen({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="glass mt-6 flex flex-col items-start gap-3 p-6">
      <p className="font-mono text-[11px] tracking-[0.1em] text-alert uppercase">Something went wrong</p>
      <h1 className="font-display text-4xl leading-none font-bold tracking-wide uppercase">Fumble</h1>
      <p className="text-[15px] leading-relaxed text-ink-soft">
        This screen hit a problem. Your team is saved on this device, so nothing is lost.
      </p>
      <button
        type="button"
        onClick={reset}
        className="glass-gain pressable rounded-xl px-5 py-2.5 font-mono text-[12px] font-bold tracking-[0.1em] text-gain uppercase"
      >
        Try again
      </button>
    </div>
  );
}
