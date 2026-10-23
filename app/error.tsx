"use client";

import { useEffect } from "react";

/** Shown if a screen crashes: a calm message and a retry, never a blank page. */
export default function ErrorScreen({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="glass mt-6 flex flex-col items-start gap-3 p-6">
      <p className="text-[12px] text-alert">Something went wrong</p>
      <h1 className="text-[28px] leading-9 font-semibold">Fumble</h1>
      <p className="text-[15px] leading-relaxed text-ink-soft">
        This screen hit a problem. Your team is saved on this device, so nothing is lost.
      </p>
      <button
        type="button"
        onClick={reset}
        className="glass-gain pressable rounded-xl px-5 py-2.5 text-[12px] font-bold text-gain"
      >
        Try again
      </button>
    </div>
  );
}
