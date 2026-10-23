"use client";

import { AnimatePresence, motion, useDragControls } from "motion/react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useHydrated } from "@/lib/hooks/useHydrated";

/**
 * A glass panel that slides up from the bottom (message options, report,
 * share a play, community rules). Drag it down, tap outside, or press Escape
 * to close. Rendered at the end of the page so it's never clipped by a card.
 */
export function Sheet({
  open,
  onClose,
  label,
  children,
  dismissable = true,
}: {
  open: boolean;
  onClose: () => void;
  /** What a screen reader announces for the panel. */
  label: string;
  children: React.ReactNode;
  /** False for panels that must be answered (the community rules). */
  dismissable?: boolean;
}) {
  const hydrated = useHydrated();
  const drag = useDragControls();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const returnTo = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissable) onClose();
    };
    window.addEventListener("keydown", onKey);
    // Move focus into the panel so keyboard and screen-reader users land in it.
    const focusTimer = setTimeout(() => {
      const first = panel.current?.querySelector<HTMLElement>("[data-autofocus], button, input, textarea, select, a[href]");
      (first ?? panel.current)?.focus();
    }, 50);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(focusTimer);
      returnTo?.focus?.();
    };
  }, [open, onClose, dismissable]);

  if (!hydrated) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[60] flex items-end justify-center" initial="closed" animate="open" exit="closed">
          <motion.button
            type="button"
            aria-label="Close"
            tabIndex={-1}
            className="absolute inset-0 bg-black/55 backdrop-blur-sm"
            variants={{ open: { opacity: 1 }, closed: { opacity: 0 } }}
            onClick={() => dismissable && onClose()}
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            tabIndex={-1}
            className="glass relative max-h-[88dvh] w-full max-w-xl overflow-y-auto rounded-b-none pb-[max(env(safe-area-inset-bottom),1rem)] outline-none"
            variants={{ open: { y: 0 }, closed: { y: "100%" } }}
            transition={{ type: "spring", stiffness: 340, damping: 34 }}
            drag={dismissable ? "y" : false}
            dragControls={drag}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => (info.offset.y > 110 || info.velocity.y > 600) && onClose()}
          >
            <div
              className={`sticky top-0 z-10 flex justify-center pt-3 pb-2 ${dismissable ? "cursor-grab touch-none" : ""}`}
              onPointerDown={(e) => dismissable && drag.start(e)}
            >
              <span className="h-1.5 w-12 rounded-full bg-white/25" aria-hidden="true" />
            </div>
            <div className="px-5 pb-3">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
