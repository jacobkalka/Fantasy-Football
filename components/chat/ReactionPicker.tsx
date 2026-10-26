"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { REACTION_LABELS, REACTIONS, type Reaction } from "@/lib/chat/types";
import { gsap, MOTION, prefersReducedMotion } from "@/lib/motion/gsap";

const WIDTH = 9 * 36 + 8;

/**
 * The curated reactions in a small panel by the button that opened it. Closes on a pick,
 * Escape, a tap elsewhere, or scrolling. Arrow keys move between reactions.
 */
export function ReactionPicker({
  onPick,
  mine,
  trigger,
}: {
  onPick: (emoji: Reaction) => void;
  mine: Reaction[];
  trigger: (open: (event: React.MouseEvent<HTMLElement>) => void) => React.ReactNode;
}) {
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  const open = (event: React.MouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const left = Math.max(8, Math.min(window.innerWidth - WIDTH - 8, rect.right - WIDTH));
    const above = rect.top > 64;
    setAt({ top: above ? rect.top - 48 : rect.bottom + 8, left });
  };

  useEffect(() => {
    if (!at) return;
    const returnTo = document.activeElement as HTMLElement | null;
    const close = () => setAt(null);
    const onDown = (e: PointerEvent) => {
      if (!panel.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    if (panel.current && !prefersReducedMotion()) {
      gsap.fromTo(panel.current, { autoAlpha: 0, y: 4, scale: 0.96 }, { autoAlpha: 1, y: 0, scale: 1, duration: MOTION.fast, ease: "power2.out" });
    }
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      returnTo?.focus?.();
    };
  }, [at]);

  return (
    <>
      {trigger(open)}
      {at &&
        createPortal(
          <div
            ref={panel}
            role="menu"
            aria-label="Reactions"
            className="fixed z-[70] flex gap-0.5 rounded-2xl bg-raised p-1 shadow-[0_8px_28px_rgb(0_0_0/0.6)]"
            style={{ top: at.top, left: at.left }}
            onKeyDown={(e) => {
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              const buttons = [...(panel.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
              const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
              buttons[(i + (e.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
              e.preventDefault();
            }}
          >
            {REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                role="menuitemcheckbox"
                aria-checked={mine.includes(emoji)}
                aria-label={REACTION_LABELS[emoji]}
                onClick={() => {
                  onPick(emoji);
                  setAt(null);
                }}
                className={`pressable grid size-9 place-items-center rounded-xl text-[20px] hover:bg-well ${mine.includes(emoji) ? "bg-well" : ""}`}
              >
                {emoji}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
