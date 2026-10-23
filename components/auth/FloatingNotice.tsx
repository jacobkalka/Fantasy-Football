"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";

export interface FloatingNoticeData {
  id: number;
  text: string;
  tone?: "info" | "error";
  action?: { label: string; run: () => void };
}

/**
 * A small glass message that floats in, then leaves by itself after a few
 * seconds (longer when it has a button). Read out by screen readers.
 */
export function FloatingNotice({
  notice,
  onDismiss,
  placement = "top",
}: {
  notice: FloatingNoticeData | null;
  onDismiss: () => void;
  /** "top": under the header. "inline": wherever it's placed (e.g. stacked above the chat box). */
  placement?: "top" | "inline";
}) {
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(onDismiss, notice.action ? 9_000 : 6_000);
    return () => clearTimeout(timer);
  }, [notice, onDismiss]);

  const from = placement === "top" ? -14 : 14;
  const position =
    placement === "top" ? "fixed inset-x-0 top-[calc(max(env(safe-area-inset-top),0.75rem)+3.75rem)] z-50 px-3" : "w-full";

  return (
    <div className={`pointer-events-none ${position}`} role="status" aria-live="polite">
      <AnimatePresence>
        {notice && (
          <motion.div
            key={notice.id}
            initial={{ opacity: 0, y: from, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: from / 2, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            className="pointer-events-auto mx-auto flex max-w-md items-center gap-2 rounded-2xl border border-white/12 bg-panel/95 py-1.5 pr-1.5 pl-4 shadow-[inset_0_1px_0_rgb(255_255_255/0.16),0_18px_40px_-12px_rgb(0_0_0/0.9)] backdrop-blur-xl"
          >
            <span
              aria-hidden="true"
              className={`size-2 shrink-0 rounded-full ${notice.tone === "error" ? "bg-alert" : "bg-gain"}`}
            />
            <p className="flex-1 py-2 text-[13.5px] leading-snug text-ink">
              {notice.tone === "error" && <span className="sr-only">Problem: </span>}
              {notice.text}
            </p>
            {notice.action && (
              <button
                type="button"
                onClick={() => {
                  notice.action?.run();
                  onDismiss();
                }}
                className="min-h-11 shrink-0 rounded-xl px-3 text-[12px] font-bold text-gain hover:bg-white/5"
              >
                {notice.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss"
              className="flex size-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-white/5 hover:text-ink"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
