"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { gsap, MOTION, prefersReducedMotion, useGSAP } from "@/lib/motion/gsap";

export interface FloatingNoticeData {
  id: number;
  text: string;
  tone?: "info" | "error";
  action?: { label: string; run: () => void };
}

/**
 * A small message that floats in, then leaves by itself after a few seconds (longer when it has
 * a button). Read out by screen readers.
 */
export function FloatingNotice({
  notice,
  onDismiss,
  placement = "top",
}: {
  notice: FloatingNoticeData | null;
  onDismiss: () => void;
  /** "top": under the header. "inline": wherever it's placed. */
  placement?: "top" | "inline";
}) {
  // The last notice stays on screen while it animates away.
  const [shown, setShown] = useState<FloatingNoticeData | null>(notice);
  if (notice && notice !== shown) setShown(notice);
  const panel = useRef<HTMLDivElement>(null);
  const from = placement === "top" ? -14 : 14;

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(onDismiss, notice.action ? 9_000 : 6_000);
    return () => clearTimeout(timer);
  }, [notice, onDismiss]);

  useGSAP(
    () => {
      const el = panel.current;
      if (!el) return;
      if (notice) {
        if (!prefersReducedMotion()) gsap.fromTo(el, { autoAlpha: 0, y: from, yPercent: 0 }, { autoAlpha: 1, y: 0, duration: MOTION.base, ease: "power2.out" });
        return;
      }
      if (prefersReducedMotion()) return setShown(null);
      gsap.to(el, { autoAlpha: 0, y: from / 2, duration: MOTION.fast, ease: "power1.in", onComplete: () => setShown(null) });
    },
    { dependencies: [notice?.id ?? null] },
  );

  const position =
    placement === "top" ? "fixed inset-x-0 top-[calc(max(env(safe-area-inset-top),0.75rem)+3.75rem)] z-50 px-3" : "w-full";

  return (
    <div className={`pointer-events-none ${position}`} role="status" aria-live="polite">
      {shown && (
        <div
          ref={panel}
          className="pointer-events-auto mx-auto flex max-w-md items-center gap-2 rounded-2xl bg-raised py-1.5 pr-1.5 pl-4 shadow-[0_12px_32px_-8px_rgb(0_0_0/0.7)]"
        >
          <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${shown.tone === "error" ? "bg-negative" : "bg-accent"}`} />
          <p className="flex-1 py-2 text-[14px] leading-snug">
            {shown.tone === "error" && <span className="sr-only">Problem: </span>}
            {shown.text}
          </p>
          {shown.action && (
            <button
              type="button"
              onClick={() => {
                shown.action?.run();
                onDismiss();
              }}
              className="min-h-10 shrink-0 rounded-xl px-3 text-[13px] font-medium hover:bg-well"
            >
              {shown.action.label}
            </button>
          )}
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="grid size-10 shrink-0 place-items-center rounded-xl text-muted hover:bg-well hover:text-ink"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
