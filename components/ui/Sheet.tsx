"use client";

import { useCallback, useEffect, useId, useRef } from "react";
import { gsap, MOTION, prefersReducedMotion } from "@/lib/motion/gsap";
import { Icon } from "./Icon";

/**
 * A dialog that slides up from the bottom on a phone and appears in the middle on a
 * wider screen. Built on the native <dialog>, so focus stays inside it, Escape closes
 * it, and screen readers announce it. The page behind can't scroll while it's open,
 * and never shifts sideways (html reserves the scrollbar's space).
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  hideTitle = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  /** Pinned actions at the bottom (stays visible while the body scrolls). */
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  /** Keep the title for screen readers but don't show it (when the body has its own header). */
  hideTitle?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  const titleId = useId();
  const descriptionId = useId();

  const isPhone = () => window.matchMedia("(max-width: 639px)").matches;
  const reduce = () => prefersReducedMotion();

  const animateClose = useCallback(() => {
    const dialog = dialogRef.current;
    const panel = panelRef.current;
    if (!dialog?.open || closing.current) return;
    closing.current = true;
    const done = () => {
      closing.current = false;
      dialog.close();
    };
    if (!panel || reduce()) return done();
    gsap.to(panel, {
      ...(isPhone() ? { yPercent: 100 } : { autoAlpha: 0, scale: 0.98 }),
      duration: MOTION.base,
      ease: "power2.in",
      onComplete: done,
    });
    gsap.to(dialog, { "--backdrop": 0, duration: MOTION.base });
  }, []);

  // Open and close follow the `open` prop.
  useEffect(() => {
    const dialog = dialogRef.current;
    const panel = panelRef.current;
    if (!dialog || !panel) return;
    if (open && !dialog.open) {
      dialog.showModal();
      document.documentElement.style.overflow = "hidden";
      if (reduce()) {
        gsap.set(panel, { clearProps: "all" });
        gsap.set(dialog, { "--backdrop": 1 });
      } else if (isPhone()) {
        gsap.fromTo(panel, { yPercent: 100 }, { yPercent: 0, duration: MOTION.slow, ease: "power3.out" });
        gsap.fromTo(dialog, { "--backdrop": 0 }, { "--backdrop": 1, duration: MOTION.slow });
      } else {
        gsap.fromTo(
          panel,
          { autoAlpha: 0, scale: 0.98, y: 8 },
          { autoAlpha: 1, scale: 1, y: 0, duration: MOTION.base, clearProps: "transform" },
        );
        gsap.fromTo(dialog, { "--backdrop": 0 }, { "--backdrop": 1, duration: MOTION.base });
      }
    } else if (!open && dialog.open) {
      animateClose();
    }
  }, [open, animateClose]);

  // Whatever closes the dialog (Escape, our button, the parent), restore page scrolling and tell the parent.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onCancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    const onClosed = () => {
      document.documentElement.style.overflow = "";
      if (panelRef.current) gsap.set(panelRef.current, { clearProps: "all" });
      if (open) onClose();
    };
    dialog.addEventListener("cancel", onCancel);
    dialog.addEventListener("close", onClosed);
    return () => {
      dialog.removeEventListener("cancel", onCancel);
      dialog.removeEventListener("close", onClosed);
    };
  }, [onClose, open]);

  // Never leave the page locked if the sheet unmounts while open.
  useEffect(
    () => () => {
      document.documentElement.style.overflow = "";
    },
    [],
  );

  const widths = { sm: "sm:max-w-[420px]", md: "sm:max-w-[560px]", lg: "sm:max-w-[760px]" };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClick={(event) => {
        // A tap on the dimmed area outside the panel closes it.
        if (event.target === dialogRef.current) onClose();
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none bg-transparent p-0 text-ink backdrop:bg-transparent open:flex open:items-end sm:open:items-center sm:open:justify-center"
      style={{ background: "rgb(0 0 0 / calc(var(--backdrop, 0) * 0.62))" }}
    >
      <div
        ref={panelRef}
        className={`flex max-h-[calc(100dvh-var(--safe-top)-24px)] w-full flex-col overflow-hidden rounded-t-[24px] bg-surface shadow-[0_-8px_40px_rgb(0_0_0/0.6)] sm:max-h-[min(86dvh,860px)] sm:rounded-[24px] ${widths[size]}`}
      >
        <div className="flex items-start gap-3 px-5 pt-3 pb-2 sm:pt-5">
          <div className="min-w-0 flex-1">
            {/* The grab handle tells phone users this is a sheet they can dismiss. */}
            <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-well sm:hidden" aria-hidden="true" />
            <h2 id={titleId} className={hideTitle ? "sr-only" : "text-[18px] leading-6 font-semibold"}>
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1 text-[14px] text-muted">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="pressable -mr-2 grid size-10 shrink-0 place-items-center rounded-full text-muted hover:bg-raised hover:text-ink sm:-mt-1"
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
        {footer && (
          <div className="border-t border-line px-5 pt-3 pb-[max(var(--safe-bottom),16px)]">{footer}</div>
        )}
        {!footer && <div className="pb-[var(--safe-bottom)] sm:pb-0" aria-hidden="true" />}
      </div>
    </dialog>
  );
}
