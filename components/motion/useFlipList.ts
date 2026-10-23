"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { Flip, MOTION } from "@/lib/motion/gsap";

/**
 * Smoothly moves list items to their new places when the order changes (rankings,
 * lineup moves, sorting). Items need a stable `data-flip-id`.
 *
 * Call `capture()` in the event handler right before the change (it records where
 * everything is); after React updates the DOM, the items glide from there to their new
 * places. Without a capture nothing animates, so data refreshes never cause movement.
 */
export function useFlipList(scope: RefObject<HTMLElement | null>) {
  const state = useRef<Flip.FlipState | null>(null);

  const capture = () => {
    if (!scope.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    state.current = Flip.getState(scope.current.querySelectorAll("[data-flip-id]"));
  };

  // Runs after every commit; only does work right after a capture.
  useLayoutEffect(() => {
    const previous = state.current;
    if (!previous || !scope.current) return;
    state.current = null;
    Flip.from(previous, {
      duration: MOTION.slow,
      ease: "power3.inOut",
      targets: scope.current.querySelectorAll("[data-flip-id]"),
      prune: true,
    });
  });

  return capture;
}
